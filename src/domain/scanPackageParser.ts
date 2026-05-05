import JSZip from 'jszip'
import { blobMd5 } from '../utils/blobMd5'
import { detectProvider } from './providerAdapters'
import type {
  LocalizationProvider,
  ManifestSummary,
  ParsedScanPackage,
  ProviderDetectionResult,
  ScanFileRef,
} from './scanTypes'

const CLEAN_ZIP_ENTRY_DATE = new Date(Date.UTC(1980, 0, 1, 0, 0, 0))

function extensionFor(path: string): string {
  const name = nameFor(path)
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : ''
}

function nameFor(path: string): string {
  return path.split('/').pop() || path
}

function isIgnorableZipEntry(path: string): boolean {
  const segments = path.split(/[\\/]+/).filter(Boolean)
  const name = segments[segments.length - 1] || path
  const lowerName = name.toLowerCase()

  return segments.some((segment) => segment.toLowerCase() === '__macosx')
    || name.startsWith('._')
    || lowerName === '.ds_store'
    || lowerName === 'thumbs.db'
    || lowerName === 'desktop.ini'
}

function uniqueFileRefs(files: ScanFileRef[]): ScanFileRef[] {
  return Array.from(new Map(files.map((file) => [file.path, file])).values())
}

function filesForCleanPackage(detection: ProviderDetectionResult): ScanFileRef[] | null {
  if (detection.provider === 'immersal') {
    const localizationFile = detection.localizationFiles.find((file) => ['bytes', 'byte'].includes(file.extension))
    if (!detection.modelFile || !localizationFile) return null
    return uniqueFileRefs([detection.modelFile, localizationFile])
  }

  if (detection.provider === 'area-target-scanner') {
    if (!detection.modelFile || !detection.manifestFile || detection.localizationFiles.length === 0) {
      return null
    }
    return uniqueFileRefs([
      detection.modelFile,
      detection.manifestFile,
      ...detection.localizationFiles,
    ])
  }

  return null
}

async function buildCleanZipFile(originalFile: File, zip: JSZip, files: ScanFileRef[]): Promise<File> {
  const cleanZip = new JSZip()

  for (const fileRef of files) {
    const entry = zip.file(fileRef.path)
    if (!entry) {
      throw new Error(`Package file is missing from zip: ${fileRef.path}`)
    }
    cleanZip.file(fileRef.path, await entry.async('uint8array'), {
      date: CLEAN_ZIP_ENTRY_DATE,
    })
  }

  const blob = await cleanZip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  })
  return new File([blob], originalFile.name, {
    type: 'application/zip',
    lastModified: 0,
  })
}

async function contentMd5For(zip: JSZip, fileRef: ScanFileRef): Promise<string> {
  const entry = zip.file(fileRef.path)
  if (!entry) {
    throw new Error(`Package file is missing from zip: ${fileRef.path}`)
  }

  return blobMd5(await entry.async('blob'))
}

async function packageContentMd5(
  zip: JSZip,
  detection: ProviderDetectionResult,
  files: ScanFileRef[],
): Promise<string | null> {
  if (!detection.provider) return null

  const manifest = {
    provider: detection.provider,
    files: await Promise.all(files.map(async (fileRef) => ({
      role: fileRef.role,
      md5: await contentMd5For(zip, fileRef),
    }))),
  }

  return blobMd5(new Blob([JSON.stringify(manifest)], { type: 'application/json' }))
}

function toFileRef(path: string, size: number): ScanFileRef {
  return {
    path,
    name: nameFor(path),
    extension: extensionFor(path),
    size,
    role: 'unknown',
  }
}

function summarizeManifest(value: unknown): ManifestSummary {
  const record = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
  const keyframeCountValue = record.keyframeCount ?? record.keyframes ?? record.frameCount

  return {
    version: typeof record.version === 'string' ? record.version : undefined,
    keyframeCount: typeof keyframeCountValue === 'number' ? keyframeCountValue : undefined,
    bounds: record.bounds ?? record.boundingBox,
    rawKeys: Object.keys(record),
  }
}

export async function parseScanPackage(
  file: File,
  selectedProvider: LocalizationProvider = 'auto'
): Promise<ParsedScanPackage> {
  if (!file.name.toLowerCase().endsWith('.zip')) {
    throw new Error('Only .zip scan packages are supported.')
  }

  const originalZipMd5 = await blobMd5(file)
  const zip = await JSZip.loadAsync(file)
  const entries = Object.values(zip.files).filter((entry) => !entry.dir && !isIgnorableZipEntry(entry.name))
  const discoveredFiles = entries.map((entry) => toFileRef(entry.name, 0))
  const initialDetection = detectProvider(discoveredFiles, selectedProvider)
  const cleanFiles = filesForCleanPackage(initialDetection)
  const cleanZipFile = cleanFiles
    ? await buildCleanZipFile(file, zip, cleanFiles)
    : undefined
  const files = cleanFiles ?? discoveredFiles
  const detection = cleanFiles && initialDetection.provider
    ? detectProvider(files, initialDetection.provider)
    : initialDetection
  const zipMd5 = await packageContentMd5(zip, detection, files) ?? originalZipMd5
  const warnings = [...detection.warnings]
  const errors = [...detection.errors]

  let manifestSummary: ManifestSummary | undefined
  if (detection.manifestFile) {
    const manifestEntry = zip.file(detection.manifestFile.path)
    if (manifestEntry) {
      try {
        manifestSummary = summarizeManifest(JSON.parse(await manifestEntry.async('text')))
      } catch {
        warnings.push('manifest.json could not be parsed. The package can still be inspected, but metadata is unavailable.')
      }
    }
  }

  let modelBlobUrl: string | null = null
  if (detection.modelFile) {
    const modelEntry = zip.file(detection.modelFile.path)
    if (modelEntry) {
      const modelBlob = await modelEntry.async('blob')
      modelBlobUrl = URL.createObjectURL(modelBlob)
    }
  }

  return {
    id: zipMd5,
    zipMd5,
    originalZipMd5,
    zipName: file.name,
    provider: detection.provider,
    files,
    modelFile: detection.modelFile,
    localizationFiles: detection.localizationFiles,
    manifestSummary,
    warnings,
    errors,
    needsManualSelection: detection.needsManualSelection,
    modelBlobUrl,
    cleanZipFile,
  }
}
