import JSZip from 'jszip'
import { blobMd5 } from '../utils/blobMd5'
import { detectProvider } from './providerAdapters'
import type { LocalizationProvider, ManifestSummary, ParsedScanPackage, ScanFileRef } from './scanTypes'

function extensionFor(path: string): string {
  const name = nameFor(path)
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : ''
}

function nameFor(path: string): string {
  return path.split('/').pop() || path
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

  const zipMd5 = await blobMd5(file)
  const zip = await JSZip.loadAsync(file)
  const entries = Object.values(zip.files).filter((entry) => !entry.dir)
  const files = entries.map((entry) => toFileRef(entry.name, 0))
  const detection = detectProvider(files, selectedProvider)
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
  }
}
