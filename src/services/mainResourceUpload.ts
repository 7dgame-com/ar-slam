import JSZip from 'jszip'
// @ts-ignore -- cos-js-sdk-v5 does not ship declarations in this project.
import COS from 'cos-js-sdk-v5'
import {
  createFileRecord,
  createSpaceRecord,
  fetchCloudConfig,
  fetchCosPublicToken,
  type CosPublicTokenResponse,
  type FileRecordResponse,
  type MainCloudConfigResponse,
} from '../api'
import type {
  ParsedScanPackage,
  ScanFileRef,
  ScanFileRole,
  UploadedScanPackage,
} from '../domain/scanTypes'
import { blobMd5 } from '../utils/blobMd5'

const BUNDLE_ZIP_ENTRY_DATE = new Date(Date.UTC(1980, 0, 1, 0, 0, 0))

export interface UploadProgressState {
  stage: string
  percent: number
}

export interface UploadScanPackageParams {
  sourceFile: File
  parsedPackage: ParsedScanPackage
  thumbnailBlob: Blob
  onProgress?: (state: UploadProgressState) => void
}

interface CosHandler {
  cos: any
  bucket: string
  region: string
}

interface UploadCandidate {
  path: string
  sourcePath?: string
  originalName?: string
  filename: string
  role: ScanFileRole
  key: string
  blob: Blob
  mimeType: string
  md5?: string
  entries?: UploadedArchiveEntry[]
}

interface UploadedArchiveEntry {
  path: string
  originalName: string
  role: ScanFileRole
  md5: string
  size: number
}

interface UploadedFileMapping {
  path: string
  sourcePath?: string
  originalName?: string
  filename: string
  role: ScanFileRole
  fileId: number
  key: string
  url: string
  md5: string
  size: number
  entries?: UploadedArchiveEntry[]
}

function emitProgress(
  callback: UploadScanPackageParams['onProgress'],
  stage: string,
  percent: number,
) {
  callback?.({
    stage,
    percent: Math.max(0, Math.min(100, Math.round(percent))),
  })
}

function assertCloudConfig(config: MainCloudConfigResponse) {
  const bucket = config.public?.bucket ?? config.bucket
  const region = config.public?.region ?? config.region

  if (!bucket || !region) {
    throw new Error('Public COS bucket configuration is missing.')
  }

  return { bucket, region }
}

function assertToken(token: CosPublicTokenResponse) {
  const credentials = (token.Credentials ?? token.credentials ?? {}) as Record<string, string | undefined>
  const tmpSecretId = credentials?.TmpSecretId ?? credentials?.tmpSecretId
  const tmpSecretKey = credentials?.TmpSecretKey ?? credentials?.tmpSecretKey
  const securityToken = credentials?.Token ?? credentials?.sessionToken ?? credentials?.token

  if (!tmpSecretId || !tmpSecretKey || !securityToken) {
    throw new Error('Public COS upload credentials are missing.')
  }

  return {
    TmpSecretId: tmpSecretId,
    TmpSecretKey: tmpSecretKey,
    SecurityToken: securityToken,
    StartTime: token.StartTime ?? token.startTime ?? Math.floor(Date.now() / 1000) - 1,
    ExpiredTime: token.ExpiredTime ?? token.expiredTime ?? Math.floor(Date.now() / 1000) + 1800,
  }
}

async function createCosHandler(): Promise<CosHandler> {
  const { bucket, region } = assertCloudConfig(await fetchCloudConfig())
  const authorization = assertToken(await fetchCosPublicToken())
  const cos = new COS({
    getAuthorization(_options, callback) {
      callback(authorization)
    },
  })

  return { cos, bucket, region }
}

function safePathPart(value: string): string {
  return value
    .trim()
    .replace(/\\/g, '/')
    .split('/')
    .filter((part) => part && part !== '.' && part !== '..')
    .join('/')
    .replace(/[?#]/g, '_')
}

function contentTypeFor(filename: string, fallback = 'application/octet-stream') {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.glb')) return 'model/gltf-binary'
  if (lower.endsWith('.gltf')) return 'model/gltf+json'
  if (lower.endsWith('.json')) return 'application/json'
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.zip')) return 'application/zip'
  return fallback
}

function objectUrl(bucket: string, region: string, key: string, location?: string) {
  if (location) {
    return location.startsWith('http') ? location : `https://${location}`
  }

  const encodedKey = key
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/')
  return `https://${bucket}.cos.${region}.myqcloud.com/${encodedKey}`
}

async function objectExists(handler: CosHandler, key: string): Promise<boolean> {
  return new Promise((resolve) => {
    handler.cos.headObject({
      Bucket: handler.bucket,
      Region: handler.region,
      Key: key,
    }, (error: Error | null) => {
      resolve(!error)
    })
  })
}

async function uploadObject(
  handler: CosHandler,
  candidate: UploadCandidate,
  onProgress: UploadScanPackageParams['onProgress'],
  objectIndex: number,
  objectCount: number,
): Promise<string> {
  const exists = await objectExists(handler, candidate.key)
  if (exists) {
    return objectUrl(handler.bucket, handler.region, candidate.key)
  }

  return new Promise((resolve, reject) => {
    handler.cos.uploadFile({
      Bucket: handler.bucket,
      Region: handler.region,
      Key: candidate.key,
      Body: candidate.blob,
      ContentType: candidate.mimeType,
      onProgress: (progressData: { percent?: number }) => {
        const ratio = typeof progressData.percent === 'number' ? progressData.percent : 0
        emitProgress(
          onProgress,
          `Uploading ${candidate.path}`,
          ((objectIndex + ratio) / objectCount) * 82,
        )
      },
    }, (error: Error | null, data?: { Location?: string }) => {
      if (error) {
        reject(error)
        return
      }

      resolve(objectUrl(handler.bucket, handler.region, candidate.key, data?.Location))
    })
  })
}

function responseId(response: FileRecordResponse | { data?: FileRecordResponse }): number {
  const raw = 'data' in response && response.data ? response.data.id : (response as FileRecordResponse).id
  const id = Number(raw)
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error('File record response did not include a valid id.')
  }
  return id
}

function uniqueFileRefs(files: ScanFileRef[]): ScanFileRef[] {
  return Array.from(new Map(files.map((file) => [file.path, file])).values())
}

async function readZipEntry(
  zip: JSZip,
  fileRef: ScanFileRef,
): Promise<{ safePath: string; bytes: Uint8Array; blob: Blob }> {
  const safePath = safePathPart(fileRef.path)
  const entry = zip.file(fileRef.path) ?? zip.file(safePath)
  if (!entry) {
    throw new Error(`Package file is missing from zip: ${fileRef.path}`)
  }

  const bytes = await entry.async('uint8array')
  const blob = await entry.async('blob')
  return {
    safePath,
    bytes,
    blob: blob.slice(0, blob.size, contentTypeFor(fileRef.name)),
  }
}

function isGlbFile(fileRef: ScanFileRef): boolean {
  return fileRef.extension.toLowerCase() === 'glb' || fileRef.role === 'model'
}

async function buildMeshCandidate(
  zip: JSZip,
  parsedPackage: ParsedScanPackage,
  cosPrefix: string,
): Promise<UploadCandidate> {
  if (!parsedPackage.modelFile) {
    throw new Error('A GLB model file is required before upload.')
  }

  const { safePath, blob } = await readZipEntry(zip, parsedPackage.modelFile)

  return {
    path: 'mesh.glb',
    sourcePath: safePath,
    originalName: parsedPackage.modelFile.name,
    filename: 'mesh.glb',
    role: 'model',
    key: `${cosPrefix}/mesh.glb`,
    blob,
    mimeType: 'model/gltf-binary',
    md5: await blobMd5(blob),
  }
}

async function buildFileZipCandidate(
  zip: JSZip,
  parsedPackage: ParsedScanPackage,
  cosPrefix: string,
): Promise<UploadCandidate> {
  const archiveFiles = uniqueFileRefs(parsedPackage.files).filter((fileRef) => !isGlbFile(fileRef))
  if (archiveFiles.length === 0) {
    throw new Error('At least one non-GLB localization data file is required before upload.')
  }

  const fileZip = new JSZip()
  const entries: UploadedArchiveEntry[] = []

  for (const fileRef of archiveFiles) {
    const { safePath, bytes, blob } = await readZipEntry(zip, fileRef)
    entries.push({
      path: safePath,
      originalName: fileRef.name,
      role: fileRef.role,
      md5: await blobMd5(blob),
      size: bytes.byteLength,
    })
    fileZip.file(safePath, bytes, {
      date: BUNDLE_ZIP_ENTRY_DATE,
    })
  }

  const archiveBlob = await fileZip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  })

  return {
    path: 'file.zip',
    filename: 'file.zip',
    role: 'localization',
    key: `${cosPrefix}/file.zip`,
    blob: archiveBlob,
    mimeType: 'application/zip',
    md5: await blobMd5(archiveBlob),
    entries,
  }
}

async function createUploadedFileRecord(
  handler: CosHandler,
  candidate: UploadCandidate,
  url: string,
): Promise<UploadedFileMapping> {
  const md5 = candidate.md5 ?? await blobMd5(candidate.blob)
  const record = await createFileRecord({
    filename: candidate.filename,
    md5,
    key: candidate.key,
    url,
    size: candidate.blob.size,
    mime_type: candidate.mimeType,
  })

  return {
    path: candidate.path,
    sourcePath: candidate.sourcePath,
    originalName: candidate.originalName,
    filename: candidate.filename,
    role: candidate.role,
    fileId: responseId(record),
    key: candidate.key,
    url: url || objectUrl(handler.bucket, handler.region, candidate.key),
    md5,
    size: candidate.blob.size,
    entries: candidate.entries,
  }
}

export async function uploadScanPackageToMain({
  sourceFile,
  parsedPackage,
  thumbnailBlob,
  onProgress,
}: UploadScanPackageParams): Promise<UploadedScanPackage> {
  if (!parsedPackage.provider) {
    throw new Error('A concrete localization provider is required before upload.')
  }
  if (!parsedPackage.modelFile) {
    throw new Error('A GLB model file is required before upload.')
  }
  if (parsedPackage.localizationFiles.length === 0) {
    throw new Error('At least one localization data file is required before upload.')
  }

  const uploadSourceFile = parsedPackage.cleanZipFile ?? sourceFile
  const zipMd5 = parsedPackage.zipMd5
  const cosPrefix = `spaces/${zipMd5}`
  emitProgress(onProgress, 'Preparing upload', 1)
  const handler = await createCosHandler()
  const zip = await JSZip.loadAsync(uploadSourceFile)
  const meshCandidate = await buildMeshCandidate(zip, parsedPackage, cosPrefix)
  const fileZipCandidate = await buildFileZipCandidate(zip, parsedPackage, cosPrefix)
  const thumbnailCandidate: UploadCandidate = {
    path: 'image.png',
    filename: 'image.png',
    role: 'support',
    key: `${cosPrefix}/image.png`,
    blob: thumbnailBlob,
    mimeType: thumbnailBlob.type || 'image/png',
  }
  const candidates = [meshCandidate, fileZipCandidate, thumbnailCandidate]
  const uploadedFiles: UploadedFileMapping[] = []

  for (const [index, candidate] of candidates.entries()) {
    const url = await uploadObject(handler, candidate, onProgress, index, candidates.length)
    uploadedFiles.push(await createUploadedFileRecord(handler, candidate, url))
    emitProgress(onProgress, `Saved file record for ${candidate.filename}`, 82 + ((index + 1) / candidates.length) * 10)
  }

  const mappingByPath = new Map(uploadedFiles.map((file) => [file.path, file]))
  const modelFile = mappingByPath.get('mesh.glb')
  const fileZipFile = mappingByPath.get('file.zip')
  const thumbnailFile = mappingByPath.get('image.png')
  const localizationFileIds = fileZipFile ? [fileZipFile.fileId] : []
  const primaryLocalizationFileId = fileZipFile?.fileId

  if (!modelFile || !thumbnailFile || !primaryLocalizationFileId) {
    throw new Error('Uploaded model, thumbnail, or localization file record is missing.')
  }

  emitProgress(onProgress, 'Creating space', 95)
  const space = await createSpaceRecord({
    name: parsedPackage.zipName,
    mesh_id: modelFile.fileId,
    image_id: thumbnailFile.fileId,
    file_id: primaryLocalizationFileId,
    data: {
      source: 'ar-slam-localization',
      provider: parsedPackage.provider,
      zipMd5,
      zipName: parsedPackage.zipName,
      cosPrefix,
      screenshotKey: thumbnailFile.key,
      meshKey: modelFile.key,
      fileKey: fileZipFile?.key,
      primaryLocalizationFileId,
      modelFileId: modelFile.fileId,
      thumbnailFileId: thumbnailFile.fileId,
      localizationFileIds,
      files: uploadedFiles,
      manifestSummary: parsedPackage.manifestSummary,
    },
  })

  const spaceId = Number(space.id)
  if (!Number.isFinite(spaceId) || spaceId <= 0) {
    throw new Error('Space response did not include a valid id.')
  }

  emitProgress(onProgress, 'Upload complete', 100)
  return {
    spaceId,
    spaceName: space.name || parsedPackage.zipName,
    zipMd5,
    cosPrefix,
    modelFileId: modelFile.fileId,
    thumbnailFileId: thumbnailFile.fileId,
    localizationFileIds,
  }
}
