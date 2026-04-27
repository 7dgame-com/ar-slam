import type {
  ConcreteLocalizationProvider,
  LocalizationProvider,
  ProviderDetectionResult,
  ScanFileRef,
} from './scanTypes'

const EMPTY_RESULT: ProviderDetectionResult = {
  provider: null,
  matched: false,
  confidence: 'low',
  modelFile: null,
  localizationFiles: [],
  manifestFile: null,
  warnings: [],
  errors: [],
  needsManualSelection: false,
}

function cloneResult(overrides: Partial<ProviderDetectionResult>): ProviderDetectionResult {
  return {
    ...EMPTY_RESULT,
    warnings: [],
    errors: [],
    localizationFiles: [],
    ...overrides,
  }
}

function hasExtension(file: ScanFileRef, extensions: string[]): boolean {
  return extensions.includes(file.extension.toLowerCase())
}

function withRole(file: ScanFileRef, role: ScanFileRef['role']): ScanFileRef {
  return { ...file, role }
}

function findGlb(files: ScanFileRef[], preferredName?: string): ScanFileRef | null {
  const glbs = files.filter((item) => hasExtension(item, ['glb']))
  if (preferredName) {
    const preferred = glbs.find((item) => item.name.toLowerCase() === preferredName)
    if (preferred) return withRole(preferred, 'model')
  }
  return glbs[0] ? withRole(glbs[0], 'model') : null
}

export function detectImmersal(files: ScanFileRef[]): ProviderDetectionResult {
  const modelFile = findGlb(files)
  const byteMaps = files
    .filter((item) => hasExtension(item, ['bytes', 'byte']))
    .map((item) => withRole(item, 'localization'))

  const errors: string[] = []
  if (!modelFile) errors.push('Immersal packages require a .glb model file.')
  if (byteMaps.length === 0) errors.push('Immersal packages require a .bytes or .byte map file.')

  return cloneResult({
    provider: errors.length === 0 ? 'immersal' : null,
    matched: errors.length === 0,
    confidence: errors.length === 0 ? 'high' : 'low',
    modelFile,
    localizationFiles: byteMaps,
    errors,
  })
}

export function detectAreaTargetScanner(files: ScanFileRef[]): ProviderDetectionResult {
  const manifestFile = files.find((item) => item.name.toLowerCase() === 'manifest.json')
  const featuresDb = files.find((item) => item.name.toLowerCase() === 'features.db')
  const modelFile = findGlb(files, 'model.glb')

  const errors: string[] = []
  if (!manifestFile) errors.push('Area Target Scanner bundles require manifest.json.')
  if (!featuresDb) errors.push('Area Target Scanner bundles require features.db.')
  if (!modelFile) errors.push('Area Target Scanner bundles require a .glb model file.')

  return cloneResult({
    provider: errors.length === 0 ? 'area-target-scanner' : null,
    matched: errors.length === 0,
    confidence: errors.length === 0 ? 'high' : 'low',
    modelFile,
    manifestFile: manifestFile ? withRole(manifestFile, 'manifest') : null,
    localizationFiles: featuresDb ? [withRole(featuresDb, 'localization')] : [],
    errors,
  })
}

export function detectProvider(
  files: ScanFileRef[],
  selectedProvider: LocalizationProvider = 'auto'
): ProviderDetectionResult {
  if (selectedProvider === 'immersal') return detectImmersal(files)
  if (selectedProvider === 'area-target-scanner') return detectAreaTargetScanner(files)

  const candidates = [detectImmersal(files), detectAreaTargetScanner(files)].filter((item) => item.matched)

  if (candidates.length === 1) return candidates[0]
  if (candidates.length > 1) {
    return cloneResult({
      warnings: ['Multiple localization providers matched. Choose the correct provider manually.'],
      needsManualSelection: true,
    })
  }

  return cloneResult({
    errors: ['No supported localization package was detected. Choose a provider manually or upload a valid ZIP.'],
    needsManualSelection: true,
  })
}

export const PROVIDER_LABELS: Record<ConcreteLocalizationProvider, string> = {
  immersal: 'Immersal',
  'area-target-scanner': 'Area Target Scanner',
}
