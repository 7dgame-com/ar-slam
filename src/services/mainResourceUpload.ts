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
  originalName?: string
  filename: string
  role: ScanFileRole
  key: string
  blob: Blob
  mimeType: string
  md5?: string
}

interface UploadedFileMapping {
  path: string
  originalName?: string
  filename: string
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

function extensionSuffix(filename: string): string {
  const cleanName = filename.split(/[?#]/)[0] || filename
  const dot = cleanName.lastIndexOf('.')
  return dot >= 0 ? cleanName.slice(dot).toLowerCase() : ''
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
    const md5 = await blobMd5(blob)
    const filename = `${md5}${extensionSuffix(fileRef.name)}`
    candidates.push({
      path: safePath,
      originalName: fileRef.name,
      filename,
      role: fileRef.role,
      key: `${cosPrefix}/${filename}`,
      blob,
      mimeType: contentTypeFor(fileRef.name),
      md5,
    })
  }

  return candidates
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
    originalName: candidate.originalName,
    filename: candidate.filename,
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

  const zipMd5 = await blobMd5(sourceFile)
  const cosPrefix = `spaces/${zipMd5}`
  emitProgress(onProgress, 'Preparing upload', 1)
  const handler = await createCosHandler()
  const zip = await JSZip.loadAsync(sourceFile)
  const zipCandidates = await buildZipCandidates(zip, parsedPackage, cosPrefix)
  const thumbnailCandidate: UploadCandidate = {
    path: 'screenshot',
    filename: `${zipMd5}.png`,
    role: 'support',
    key: `spaces/${zipMd5}.png`,
    blob: thumbnailBlob,
    mimeType: thumbnailBlob.type || 'image/png',
  }
  const candidates = [...zipCandidates, thumbnailCandidate]
  const uploadedFiles: UploadedFileMapping[] = []

  for (const [index, candidate] of candidates.entries()) {
    const url = await uploadObject(handler, candidate, onProgress, index, candidates.length)
    uploadedFiles.push(await createUploadedFileRecord(handler, candidate, url))
    emitProgress(onProgress, `Saved file record for ${candidate.filename}`, 82 + ((index + 1) / candidates.length) * 10)
  }

  const mappingByPath = new Map(uploadedFiles.map((file) => [file.path, file]))
  const modelFile = mappingByPath.get(safePathPart(parsedPackage.modelFile.path))
  const thumbnailFile = mappingByPath.get('screenshot')
  const localizationFileIds = parsedPackage.localizationFiles.map((fileRef) => {
    const uploadedFile = mappingByPath.get(safePathPart(fileRef.path))
    if (!uploadedFile) {
      throw new Error(`Localization file record was not created: ${fileRef.path}`)
    }
    return uploadedFile.fileId
  })
  const primaryLocalizationFileId = localizationFileIds[0]

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
