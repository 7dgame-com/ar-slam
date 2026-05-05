export type LocalizationProvider = 'auto' | 'immersal' | 'area-target-scanner'
export type ConcreteLocalizationProvider = Exclude<LocalizationProvider, 'auto'>
export type ScanFileRole = 'model' | 'localization' | 'manifest' | 'texture' | 'support' | 'unknown'
export type DetectionConfidence = 'high' | 'medium' | 'low'

export interface ScanFileRef {
  path: string
  name: string
  extension: string
  size: number
  role: ScanFileRole
}

export interface ProviderDetectionResult {
  provider: ConcreteLocalizationProvider | null
  matched: boolean
  confidence: DetectionConfidence
  modelFile: ScanFileRef | null
  localizationFiles: ScanFileRef[]
  manifestFile: ScanFileRef | null
  warnings: string[]
  errors: string[]
  needsManualSelection: boolean
}

export interface ManifestSummary {
  version?: string
  keyframeCount?: number
  bounds?: unknown
  rawKeys: string[]
}

export interface ParsedScanPackage {
  id: string
  zipMd5: string
  originalZipMd5?: string
  zipName: string
  provider: ConcreteLocalizationProvider | null
  files: ScanFileRef[]
  modelFile: ScanFileRef | null
  localizationFiles: ScanFileRef[]
  manifestSummary?: ManifestSummary
  warnings: string[]
  errors: string[]
  needsManualSelection: boolean
  modelBlobUrl: string | null
  cleanZipFile?: File
}

export interface SceneOption {
  id: string
  name: string
  description?: string
  thumbnailUrl?: string
  boundSpaceId?: string
  boundSpaceName?: string
}

export interface ScenePagination {
  page: number
  perPage: number
  pageCount: number
  totalCount: number
}

export interface SceneListResult {
  scenes: SceneOption[]
  pagination: ScenePagination
}

export type SceneSort = '-created_at' | 'created_at' | 'name'

export interface SceneBindingRecord {
  sceneId: string
  spaceId: string
  spaceName?: string
}

export interface UploadedScanPackage {
  spaceId: number
  spaceName: string
  zipMd5: string
  cosPrefix: string
  modelFileId: number
  thumbnailFileId: number
  localizationFileIds: number[]
}

export interface ExistingSpaceOption extends UploadedScanPackage {
  provider?: string
  thumbnailUrl?: string
  modelUrl?: string
  modelName?: string
  createdAt?: string
}

export interface BindingResult extends UploadedScanPackage {
  scenes: Array<{
    id: string
    name: string
  }>
  createdAt: string
}

export interface CreateSceneBindingsPayload {
  spaceId: number
  verseIds: string[]
}
