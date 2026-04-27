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
          :is-parsing="isParsing"
          @upload="handleUpload"
          @provider-change="handleProviderChange"
        />
      </el-card>

      <el-card class="panel-card preview-card">
        <template #header>3D preview</template>
        <GlbPreview
          ref="previewRef"
          :model-url="parsedPackage?.modelBlobUrl || null"
          :model-name="parsedPackage?.modelFile?.name || ''"
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
          :can-submit-binding="canSubmitBinding"
          :submitting="isSubmittingBinding"
          :unbinding-scene-id="unbindingSceneId"
          :upload-stage="uploadStage"
          :upload-progress="uploadProgress"
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
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { createSceneBindings, deleteSceneBinding, fetchSceneBindings, fetchVerseScenes } from '../api'
import GlbPreview from '../components/GlbPreview.vue'
import ScanUploadPanel from '../components/ScanUploadPanel.vue'
import SceneBindingPanel from '../components/SceneBindingPanel.vue'
import { useScanWorkbench } from '../composables/useScanWorkbench'
import { parseScanPackage } from '../domain/scanPackageParser'
import { uploadScanPackageToMain } from '../services/mainResourceUpload'
import type { LocalizationProvider, ScenePagination, SceneSort } from '../domain/scanTypes'

interface GlbPreviewExpose {
  captureScreenshot: () => Promise<Blob | null>
}

const provider = ref<LocalizationProvider>('auto')
const currentFile = ref<File | null>(null)
const previewRef = ref<GlbPreviewExpose | null>(null)
const parseError = ref('')
const isParsing = ref(false)
const isSubmittingBinding = ref(false)
const uploadStage = ref('')
const uploadProgress = ref(0)
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
const {
  parsedPackage,
  selectedSceneIds,
  sortedScenes,
  bindingResult,
  canSubmitBinding,
  setScenes,
  setParsedPackage,
  toggleSceneSelection,
  createBindingResult,
  dispose,
} = useScanWorkbench()

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
  if (!currentFile.value || !parsedPackage.value || !canSubmitBinding.value || isSubmittingBinding.value) {
    return
  }

  const verseIds = [...selectedSceneIds.value]
  scenesError.value = ''
  uploadStage.value = 'Preparing thumbnail'
  uploadProgress.value = 0
  isSubmittingBinding.value = true

  try {
    const thumbnailBlob = await previewRef.value?.captureScreenshot()
    if (!thumbnailBlob) {
      throw new Error('Thumbnail could not be captured. Please wait for the 3D preview to finish loading.')
    }

    const uploadedPackage = await uploadScanPackageToMain({
      sourceFile: currentFile.value,
      parsedPackage: parsedPackage.value,
      thumbnailBlob,
      onProgress: (progress) => {
        uploadStage.value = progress.stage
        uploadProgress.value = Math.round(progress.percent)
      },
    })

    uploadStage.value = 'Binding scenes'
    uploadProgress.value = Math.max(uploadProgress.value, 95)
    await createSceneBindings({
      spaceId: uploadedPackage.spaceId,
      verseIds,
    })
    createBindingResult(uploadedPackage)
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

async function parseCurrentFile(file: File) {
  const requestId = ++parseRequestId
  parseError.value = ''
  isParsing.value = true

  try {
    const parsed = await parseScanPackage(file, provider.value)
    if (requestId !== parseRequestId) {
      if (parsed.modelBlobUrl) {
        URL.revokeObjectURL(parsed.modelBlobUrl)
      }
      return
    }

    setParsedPackage(parsed)
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
  uploadStage.value = ''
  uploadProgress.value = 0
  await parseCurrentFile(file)
}

async function handleProviderChange(nextProvider: LocalizationProvider) {
  provider.value = nextProvider
  if (currentFile.value) {
    await parseCurrentFile(currentFile.value)
  }
}

onBeforeUnmount(() => {
  parseRequestId += 1
  sceneRequestId += 1
  dispose()
})

onMounted(() => {
  void loadScenes(1)
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
