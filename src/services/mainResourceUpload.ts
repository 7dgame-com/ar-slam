import JSZip from 'jszip'
// @ts-ignore -- cos-js-sdk-v5 does not ship declarations in this project.
import COS from 'cos-js-sdk-v5'
// @ts-ignore -- spark-md5 declarations are provided by the package in the main app, but optional here.
import SparkMD5 from 'spark-md5'
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
  filename: string
  role: ScanFileRole
  key: string
  blob: Blob
  mimeType: string
}

interface UploadedFileMapping {
  path: string
  role: ScanFileRole
  fileId: number
  key: string
  url: string
  md5: string
  size: number
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

function safePackageId(value: string): string {
  const cleaned = safePathPart(value).replace(/[^a-zA-Z0-9._/-]+/g, '-')
  return cleaned || `pkg-${Date.now()}`
}

function contentTypeFor(filename: string, fallback = 'application/octet-stream') {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.glb')) return 'model/gltf-binary'
  if (lower.endsWith('.gltf')) return 'model/gltf+json'
  if (lower.endsWith('.json')) return 'application/json'
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.webp')) return 'image/webp'
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

async function blobMd5(blob: Blob): Promise<string> {
  const spark = new SparkMD5.ArrayBuffer()
  const chunkSize = 2 * 1024 * 1024

  for (let offset = 0; offset < blob.size; offset += chunkSize) {
    spark.append(await blobToArrayBuffer(blob.slice(offset, offset + chunkSize)))
  }

  return spark.end()
}

async function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') {
    return blob.arrayBuffer()
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(reader.error ?? new Error('Blob could not be read.'))
    reader.readAsArrayBuffer(blob)
  })
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

function shouldExcludeFromRuntimePackage(fileRef: ScanFileRef): boolean {
  const extension = fileRef.extension.toLowerCase()
  return fileRef.role === 'model' || extension === 'glb' || extension === 'gltf'
}

async function buildZipCandidates(
  zip: JSZip,
  parsedPackage: ParsedScanPackage,
  cosPrefix: string,
): Promise<UploadCandidate[]> {
  const candidates: UploadCandidate[] = []

  for (const fileRef of uniqueFileRefs(parsedPackage.files)) {
    const safePath = safePathPart(fileRef.path)
    const entry = zip.file(fileRef.path) ?? zip.file(safePath)
    if (!entry) {
      throw new Error(`Package file is missing from zip: ${fileRef.path}`)
    }

    const blob = await entry.async('blob')
    candidates.push({
      path: safePath,
      filename: fileRef.name,
      role: fileRef.role,
      key: `${cosPrefix}/${safePath}`,
      blob,
      mimeType: contentTypeFor(fileRef.name),
    })
  }

  return candidates
}

async function buildRuntimeZipCandidate(
  zip: JSZip,
  parsedPackage: ParsedScanPackage,
  cosPrefix: string,
  packageId: string,
): Promise<UploadCandidate> {
  const runtimeZip = new JSZip()

  for (const fileRef of uniqueFileRefs(parsedPackage.files)) {
    if (shouldExcludeFromRuntimePackage(fileRef)) continue

    const safePath = safePathPart(fileRef.path)
    const entry = zip.file(fileRef.path) ?? zip.file(safePath)
    if (!entry) {
      throw new Error(`Package file is missing from zip: ${fileRef.path}`)
    }
    runtimeZip.file(safePath, await entry.async('blob'))
  }

  const runtimeFilename = `${packageId}-runtime.zip`
  const blob = await runtimeZip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
  })

  return {
    path: runtimeFilename,
    filename: runtimeFilename,
    role: 'support',
    key: `${cosPrefix}/${runtimeFilename}`,
    blob,
    mimeType: 'application/zip',
  }
}

async function createUploadedFileRecord(
  handler: CosHandler,
  candidate: UploadCandidate,
  url: string,
): Promise<UploadedFileMapping> {
  const md5 = await blobMd5(candidate.blob)
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
    role: candidate.role,
    fileId: responseId(record),
    key: candidate.key,
    url: url || objectUrl(handler.bucket, handler.region, candidate.key),
    md5,
    size: candidate.blob.size,
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

  const packageId = safePackageId(parsedPackage.id)
  const cosPrefix = `ar-slam-localization/${packageId}`
  emitProgress(onProgress, 'Preparing upload', 1)
  const handler = await createCosHandler()
  const zip = await JSZip.loadAsync(sourceFile)
  const zipCandidates = await buildZipCandidates(zip, parsedPackage, cosPrefix)
  const thumbnailCandidate: UploadCandidate = {
    path: 'thumbnail.png',
    filename: `${packageId}-thumbnail.png`,
    role: 'support',
    key: `${cosPrefix}/thumbnail.png`,
    blob: thumbnailBlob,
    mimeType: thumbnailBlob.type || 'image/png',
  }
  const runtimeCandidate = await buildRuntimeZipCandidate(zip, parsedPackage, cosPrefix, packageId)
  const candidates = [...zipCandidates, thumbnailCandidate, runtimeCandidate]
  const uploadedFiles: UploadedFileMapping[] = []

  for (const [index, candidate] of candidates.entries()) {
    const url = await uploadObject(handler, candidate, onProgress, index, candidates.length)
    uploadedFiles.push(await createUploadedFileRecord(handler, candidate, url))
    emitProgress(onProgress, `Saved file record for ${candidate.filename}`, 82 + ((index + 1) / candidates.length) * 10)
  }

  const mappingByPath = new Map(uploadedFiles.map((file) => [file.path, file]))
  const modelFile = mappingByPath.get(safePathPart(parsedPackage.modelFile.path))
  const thumbnailFile = mappingByPath.get('thumbnail.png')
  const runtimeFile = mappingByPath.get(runtimeCandidate.path)
  const localizationFileIds = parsedPackage.localizationFiles.map((fileRef) => {
    const uploadedFile = mappingByPath.get(safePathPart(fileRef.path))
    if (!uploadedFile) {
      throw new Error(`Localization file record was not created: ${fileRef.path}`)
    }
    return uploadedFile.fileId
  })

  if (!modelFile || !thumbnailFile || !runtimeFile) {
    throw new Error('Uploaded model, thumbnail, or runtime package file record is missing.')
  }

  emitProgress(onProgress, 'Creating space', 95)
  const space = await createSpaceRecord({
    name: parsedPackage.zipName,
    mesh_id: modelFile.fileId,
    image_id: thumbnailFile.fileId,
    file_id: runtimeFile.fileId,
    data: {
      source: 'ar-slam-localization',
      provider: parsedPackage.provider,
      zipName: parsedPackage.zipName,
      cosPrefix,
      runtimeFileId: runtimeFile.fileId,
      runtimeZipName: runtimeCandidate.filename,
      runtimeFileKey: runtimeFile.key,
      runtimePackageExcludes: ['glb', 'gltf'],
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
    cosPrefix,
    runtimeFileId: runtimeFile.fileId,
    modelFileId: modelFile.fileId,
    thumbnailFileId: thumbnailFile.fileId,
    localizationFileIds,
  }
}
