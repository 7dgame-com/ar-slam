<template>
  <div class="workbench-view">
    <header class="page-header">
      <h2>{{ $t('workbench.title') }}</h2>
      <p class="page-desc">{{ $t('workbench.description') }}</p>
    </header>

    <div class="workbench-grid">
      <el-card class="panel-card">
        <template #header>Upload and validation</template>
        <ScanUploadPanel
          :provider="provider"
          :parsed-package="parsedPackage"
          :parse-error="parseError"
          :upload-notice="uploadNotice"
          :is-parsing="isParsing"
          :is-uploading="isUploadingPackage"
          :upload-stage="uploadStage"
          :upload-progress="uploadProgress"
          @upload="handleUpload"
          @provider-change="handleProviderChange"
        />
        <ExistingSpacePanel
          :spaces="existingSpaces"
          :loading="spacesLoading"
          :error="spacesError"
          :selected-space-id="selectedSpaceId"
          :deleting-space-id="deletingSpaceId"
          :updating-space-id="updatingSpaceId"
          @select-space="handleSelectExistingSpace"
          @delete-space="handleDeleteExistingSpace"
          @update-space-name="handleUpdateSpaceName"
          @refresh="loadExistingSpaces"
        />
      </el-card>

      <el-card class="panel-card preview-card">
        <template #header>3D preview</template>
        <GlbPreview
          ref="previewRef"
          :model-url="previewModelUrl"
          :model-name="previewModelName"
          @model-loaded="handlePreviewModelLoaded"
          @model-error="handlePreviewModelError"
        />
      </el-card>

      <el-card class="panel-card">
        <template #header>Scene binding</template>
        <SceneBindingPanel
          :scenes="sortedScenes"
          :selected-scene-ids="selectedSceneIds"
          :pagination="scenePagination"
          :loading="scenesLoading"
          :error="scenesError"
          :search="sceneSearch"
          :sort="sceneSort"
          :can-submit-binding="canSubmitSceneBinding"
          :submitting="isSubmittingBinding"
          :unbinding-scene-id="unbindingSceneId"
          :binding-result="bindingResult"
          @toggle-scene="toggleSceneSelection"
          @page-change="loadScenes"
          @search-change="handleSceneSearch"
          @sort-change="handleSceneSort"
          @refresh="refreshScenes"
          @submit-binding="handleSubmitBinding"
          @unbind-scene="handleUnbindScene"
        />
      </el-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  createSceneBindings,
  deleteSceneBinding,
  deleteSpaceRecord,
  fetchExistingSpaces,
  fetchSceneBindings,
  fetchVerseScenes,
  updateSpaceRecord,
} from '../api'
import ExistingSpacePanel from '../components/ExistingSpacePanel.vue'
import GlbPreview from '../components/GlbPreview.vue'
import ScanUploadPanel from '../components/ScanUploadPanel.vue'
import SceneBindingPanel from '../components/SceneBindingPanel.vue'
import { useScanWorkbench } from '../composables/useScanWorkbench'
import { parseScanPackage } from '../domain/scanPackageParser'
import { uploadScanPackageToMain } from '../services/mainResourceUpload'
import type {
  ExistingSpaceOption,
  LocalizationProvider,
  ScenePagination,
  SceneSort,
  UploadedScanPackage,
} from '../domain/scanTypes'

interface GlbPreviewExpose {
  captureScreenshot: () => Promise<Blob | null>
}

const provider = ref<LocalizationProvider>('auto')
const currentFile = ref<File | null>(null)
const previewRef = ref<GlbPreviewExpose | null>(null)
const parseError = ref('')
const uploadNotice = ref('')
const isParsing = ref(false)
const isSubmittingBinding = ref(false)
const isUploadingPackage = ref(false)
const uploadStage = ref('')
const uploadProgress = ref(0)
const uploadedPackage = ref<UploadedScanPackage | null>(null)
const existingSpaces = ref<ExistingSpaceOption[]>([])
const localUploadedSpaces = ref<ExistingSpaceOption[]>([])
const spacesLoading = ref(false)
const spacesError = ref('')
const selectedSpaceId = ref<number | null>(null)
const selectedExistingSpace = ref<ExistingSpaceOption | null>(null)
const deletingSpaceId = ref<number | null>(null)
const updatingSpaceId = ref<number | null>(null)
const scenesLoading = ref(false)
const scenesError = ref('')
const sceneSearch = ref('')
const sceneSort = ref<SceneSort>('-created_at')
const unbindingSceneId = ref('')
const scenePagination = ref<ScenePagination>({
  page: 1,
  perPage: 10,
  pageCount: 1,
  totalCount: 0,
})
let parseRequestId = 0
let sceneRequestId = 0
let uploadRequestId = 0
let spacesRequestId = 0
const {
  parsedPackage,
  selectedSceneIds,
  selectedScenes,
  sortedScenes,
  selectedHasUnavailableScene,
  bindingResult,
  setScenes,
  setParsedPackage,
  toggleSceneSelection,
  createBindingResult,
  dispose,
} = useScanWorkbench()

const canSubmitSceneBinding = computed(() => (
  Boolean(uploadedPackage.value)
  && selectedScenes.value.length > 0
  && !selectedHasUnavailableScene.value
  && !isUploadingPackage.value
))

const previewModelUrl = computed(() => (
  selectedExistingSpace.value?.modelUrl
  || parsedPackage.value?.modelBlobUrl
  || null
))

const previewModelName = computed(() => (
  selectedExistingSpace.value?.modelName
  || selectedExistingSpace.value?.spaceName
  || parsedPackage.value?.modelFile?.name
  || ''
))

function existingSpaceKey(space: ExistingSpaceOption) {
  return space.zipMd5 ? `zip:${space.zipMd5}` : `space:${space.spaceId}`
}

function mergeExistingSpaces(remoteSpaces: ExistingSpaceOption[], localSpaces = localUploadedSpaces.value) {
  const seen = new Set<string>()
  const merged: ExistingSpaceOption[] = []

  for (const space of [...remoteSpaces, ...localSpaces]) {
    const key = existingSpaceKey(space)
    if (seen.has(key)) continue

    seen.add(key)
    merged.push(space)
  }

  return merged
}

function rememberUploadedSpace(result: UploadedScanPackage) {
  const localSpace: ExistingSpaceOption = {
    ...result,
    ...(parsedPackage.value?.provider ? { provider: parsedPackage.value.provider } : {}),
    ...(parsedPackage.value?.modelFile?.name ? { modelName: parsedPackage.value.modelFile.name } : {}),
  }

  localUploadedSpaces.value = mergeExistingSpaces([localSpace], localUploadedSpaces.value)
  existingSpaces.value = mergeExistingSpaces(existingSpaces.value)
}

function withRenamedSpace(spaces: ExistingSpaceOption[], spaceId: number, spaceName: string) {
  return spaces.map((space) => (
    space.spaceId === spaceId
      ? { ...space, spaceName }
      : space
  ))
}

function renameSpaceLocally(spaceId: number, spaceName: string) {
  existingSpaces.value = withRenamedSpace(existingSpaces.value, spaceId, spaceName)
  localUploadedSpaces.value = withRenamedSpace(localUploadedSpaces.value, spaceId, spaceName)

  if (selectedExistingSpace.value?.spaceId === spaceId) {
    selectedExistingSpace.value = {
      ...selectedExistingSpace.value,
      spaceName,
    }
  }

  if (uploadedPackage.value?.spaceId === spaceId) {
    uploadedPackage.value = {
      ...uploadedPackage.value,
      spaceName,
    }
  }
}

async function loadExistingSpaces(): Promise<ExistingSpaceOption[]> {
  const requestId = ++spacesRequestId
  spacesLoading.value = true
  spacesError.value = ''

  try {
    const result = await fetchExistingSpaces()
    if (requestId !== spacesRequestId) return existingSpaces.value
    existingSpaces.value = mergeExistingSpaces(result)
    return existingSpaces.value
  } catch (error) {
    if (requestId === spacesRequestId) {
      existingSpaces.value = mergeExistingSpaces([])
      spacesError.value = error instanceof Error && error.message
        ? error.message
        : 'Spaces could not be loaded.'
    }
    return existingSpaces.value
  } finally {
    if (requestId === spacesRequestId) {
      spacesLoading.value = false
    }
  }
}

function handleSelectExistingSpace(space: ExistingSpaceOption, notice = '') {
  uploadedPackage.value = {
    spaceId: space.spaceId,
    spaceName: space.spaceName,
    zipMd5: space.zipMd5,
    cosPrefix: space.cosPrefix,
    modelFileId: space.modelFileId,
    thumbnailFileId: space.thumbnailFileId,
    localizationFileIds: [...space.localizationFileIds],
  }
  selectedSpaceId.value = space.spaceId
  selectedExistingSpace.value = space
  uploadRequestId += 1
  isUploadingPackage.value = false
  uploadStage.value = 'Using existing space'
  uploadProgress.value = 100
  uploadNotice.value = notice
  scenesError.value = ''
}

function findExistingSpaceByZipMd5(zipMd5: string, spaces = existingSpaces.value) {
  return spaces.find((space) => space.zipMd5 === zipMd5)
}

function clearSelectedSpace() {
  currentFile.value = null
  uploadedPackage.value = null
  selectedSpaceId.value = null
  selectedExistingSpace.value = null
  uploadStage.value = ''
  uploadProgress.value = 0
  setParsedPackage(null)
}

async function handleDeleteExistingSpace(space: ExistingSpaceOption) {
  if (deletingSpaceId.value) return

  deletingSpaceId.value = space.spaceId
  spacesError.value = ''
  uploadNotice.value = ''

  try {
    await deleteSpaceRecord(space.spaceId)
    const deletedKey = existingSpaceKey(space)
    localUploadedSpaces.value = localUploadedSpaces.value.filter((item) => existingSpaceKey(item) !== deletedKey)
    existingSpaces.value = existingSpaces.value.filter((item) => existingSpaceKey(item) !== deletedKey)

    if (selectedSpaceId.value === space.spaceId) {
      clearSelectedSpace()
    }

    uploadNotice.value = `Deleted space: ${space.spaceName}.`
    await loadExistingSpaces()
    await refreshScenes()
  } catch (error) {
    spacesError.value = error instanceof Error && error.message
      ? error.message
      : 'Space could not be deleted.'
  } finally {
    deletingSpaceId.value = null
  }
}

async function handleUpdateSpaceName(space: ExistingSpaceOption, name: string) {
  if (updatingSpaceId.value) return

  updatingSpaceId.value = space.spaceId
  spacesError.value = ''
  uploadNotice.value = ''

  try {
    const updated = await updateSpaceRecord(space.spaceId, { name })
    const nextName = updated.name || name
    renameSpaceLocally(space.spaceId, nextName)
    uploadNotice.value = `Updated space: ${nextName}.`
    await refreshScenes()
  } catch (error) {
    spacesError.value = error instanceof Error && error.message
      ? error.message
      : 'Space could not be updated.'
  } finally {
    updatingSpaceId.value = null
  }
}

async function loadScenes(page = scenePagination.value.page) {
  const requestId = ++sceneRequestId
  scenesLoading.value = true
  scenesError.value = ''

  try {
    const result = await fetchVerseScenes({
      page,
      perPage: scenePagination.value.perPage,
      search: sceneSearch.value,
      sort: sceneSort.value,
    })
    const bindings = await fetchSceneBindings(result.scenes.map((scene) => scene.id))

    if (requestId !== sceneRequestId) return

    const bindingBySceneId = new Map(bindings.map((binding) => [binding.sceneId, binding]))
    setScenes(result.scenes.map((scene) => {
      const binding = bindingBySceneId.get(scene.id)
      return binding
        ? {
            ...scene,
            boundSpaceId: binding.spaceId,
            boundSpaceName: binding.spaceName,
          }
        : scene
    }))
    scenePagination.value = result.pagination
  } catch (error) {
    if (requestId === sceneRequestId) {
      setScenes([])
      scenesError.value = error instanceof Error && error.message
        ? error.message
        : 'Scenes could not be loaded.'
    }
  } finally {
    if (requestId === sceneRequestId) {
      scenesLoading.value = false
    }
  }
}

async function refreshScenes() {
  await loadScenes(scenePagination.value.page)
}

async function handleSceneSearch(search: string) {
  sceneSearch.value = search
  await loadScenes(1)
}

async function handleSceneSort(sort: SceneSort) {
  sceneSort.value = sort
  await loadScenes(1)
}

async function handleUnbindScene(sceneId: string) {
  if (unbindingSceneId.value) return

  scenesError.value = ''
  unbindingSceneId.value = sceneId
  try {
    await deleteSceneBinding(sceneId)
    await refreshScenes()
  } catch (error) {
    scenesError.value = error instanceof Error && error.message
      ? error.message
      : 'Scene binding could not be removed.'
    await refreshScenes()
  } finally {
    unbindingSceneId.value = ''
  }
}

async function handleSubmitBinding() {
  if (!uploadedPackage.value || !canSubmitSceneBinding.value || isSubmittingBinding.value) {
    return
  }

  const verseIds = [...selectedSceneIds.value]
  scenesError.value = ''
  isSubmittingBinding.value = true

  try {
    uploadStage.value = 'Binding scenes'
    uploadProgress.value = Math.max(uploadProgress.value, 95)
    await createSceneBindings({
      spaceId: uploadedPackage.value.spaceId,
      verseIds,
    })
    createBindingResult(uploadedPackage.value)
    uploadStage.value = 'Binding complete'
    uploadProgress.value = 100
    await refreshScenes()
  } catch (error) {
    const message = error instanceof Error && error.message
      ? error.message
      : 'Binding could not be created.'
    scenesError.value = message
    await refreshScenes()
    scenesError.value = message
    uploadStage.value = ''
    uploadProgress.value = 0
  } finally {
    isSubmittingBinding.value = false
  }
}

async function uploadCurrentPackage() {
  if (
    !currentFile.value
    || !parsedPackage.value
    || isParsing.value
    || isUploadingPackage.value
    || uploadedPackage.value
    || parsedPackage.value.errors.length > 0
    || !parsedPackage.value.provider
    || !parsedPackage.value.modelFile
    || parsedPackage.value.localizationFiles.length === 0
  ) {
    return
  }

  const requestId = ++uploadRequestId
  scenesError.value = ''
  uploadStage.value = 'Preparing thumbnail'
  uploadProgress.value = 0
  isUploadingPackage.value = true

  try {
    const thumbnailBlob = await previewRef.value?.captureScreenshot()
    if (!thumbnailBlob) {
      throw new Error('Thumbnail could not be captured. Please wait for the 3D preview to finish loading.')
    }

    const result = await uploadScanPackageToMain({
      sourceFile: parsedPackage.value.cleanZipFile ?? currentFile.value,
      parsedPackage: parsedPackage.value,
      thumbnailBlob,
      onProgress: (progress) => {
        if (requestId !== uploadRequestId) return
        uploadStage.value = progress.stage
        uploadProgress.value = Math.round(progress.percent)
      },
    })

    if (requestId !== uploadRequestId) return
    uploadedPackage.value = result
    selectedSpaceId.value = result.spaceId
    selectedExistingSpace.value = null
    uploadStage.value = 'Upload complete'
    uploadProgress.value = 100
    rememberUploadedSpace(result)
    void loadExistingSpaces()
  } catch (error) {
    if (requestId !== uploadRequestId) return
    scenesError.value = error instanceof Error && error.message
      ? error.message
      : 'Scan package could not be uploaded.'
    uploadStage.value = ''
    uploadProgress.value = 0
  } finally {
    if (requestId === uploadRequestId) {
      isUploadingPackage.value = false
    }
  }
}

function handlePreviewModelLoaded() {
  void uploadCurrentPackage()
}

function handlePreviewModelError(message: string) {
  scenesError.value = message
}

async function parseCurrentFile(file: File) {
  const requestId = ++parseRequestId
  parseError.value = ''
  uploadNotice.value = ''
  isParsing.value = true

  try {
    const parsed = await parseScanPackage(file, provider.value)
    const spaces = await loadExistingSpaces()
    if (requestId !== parseRequestId) {
      if (parsed.modelBlobUrl) {
        URL.revokeObjectURL(parsed.modelBlobUrl)
      }
      return
    }

    setParsedPackage(parsed)
    const existingSpace = findExistingSpaceByZipMd5(parsed.zipMd5, spaces)
      ?? (
        parsed.originalZipMd5 && parsed.originalZipMd5 !== parsed.zipMd5
          ? findExistingSpaceByZipMd5(parsed.originalZipMd5, spaces)
          : undefined
      )
    if (existingSpace) {
      handleSelectExistingSpace(
        existingSpace,
        `This scan package already exists. Using existing space: ${existingSpace.spaceName}.`,
      )
    }
  } catch (error) {
    if (requestId === parseRequestId) {
      setParsedPackage(null)
      parseError.value = error instanceof Error && error.message
        ? error.message
        : 'Scan package could not be parsed.'
    }
  } finally {
    if (requestId === parseRequestId) {
      isParsing.value = false
    }
  }
}

async function handleUpload(file: File) {
  currentFile.value = file
  setParsedPackage(null)
  uploadedPackage.value = null
  selectedSpaceId.value = null
  selectedExistingSpace.value = null
  uploadRequestId += 1
  isUploadingPackage.value = false
  uploadStage.value = ''
  uploadProgress.value = 0
  uploadNotice.value = ''
  await parseCurrentFile(file)
}

async function handleProviderChange(nextProvider: LocalizationProvider) {
  provider.value = nextProvider
  if (currentFile.value) {
    setParsedPackage(null)
    uploadedPackage.value = null
    selectedSpaceId.value = null
    selectedExistingSpace.value = null
    uploadRequestId += 1
    isUploadingPackage.value = false
    uploadNotice.value = ''
    await parseCurrentFile(currentFile.value)
  }
}

onBeforeUnmount(() => {
  parseRequestId += 1
  sceneRequestId += 1
  uploadRequestId += 1
  spacesRequestId += 1
  dispose()
})

onMounted(() => {
  void loadScenes(1)
  void loadExistingSpaces()
})
</script>

<style scoped>
.workbench-view {
  min-height: calc(100vh - 96px);
}

.page-header {
  margin-bottom: var(--spacing-lg);
}

.page-header h2 {
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  margin-bottom: var(--spacing-xs);
}

.page-desc {
  font-size: var(--font-size-sm);
  color: var(--text-muted);
}

.workbench-grid {
  display: grid;
  grid-template-columns: minmax(260px, 320px) minmax(420px, 1fr) minmax(280px, 340px);
  gap: var(--spacing-lg);
  align-items: stretch;
}

.panel-card {
  border-radius: var(--radius-sm);
  min-width: 0;
}

.preview-card {
  min-height: 540px;
}

@media (max-width: 1180px) {
  .workbench-grid {
    grid-template-columns: 1fr;
  }
}
</style>
