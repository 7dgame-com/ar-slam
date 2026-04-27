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
          :model-url="parsedPackage?.modelBlobUrl || null"
          :model-name="parsedPackage?.modelFile?.name || ''"
        />
      </el-card>

      <el-card class="panel-card">
        <template #header>Scene binding</template>
        <SceneBindingPanel
          :scenes="scenes"
          :selected-scene-ids="selectedSceneIds"
          :pagination="scenePagination"
          :loading="scenesLoading"
          :error="scenesError"
          :search="sceneSearch"
          :can-create-draft="canCreateDraft"
          :binding-draft="bindingDraft"
          @toggle-scene="toggleSceneSelection"
          @page-change="loadScenes"
          @search-change="handleSceneSearch"
          @refresh="refreshScenes"
          @create-draft="handleCreateDraft"
        />
      </el-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { createSceneBindings, fetchSceneBindings, fetchVerseScenes } from '../api'
import GlbPreview from '../components/GlbPreview.vue'
import ScanUploadPanel from '../components/ScanUploadPanel.vue'
import SceneBindingPanel from '../components/SceneBindingPanel.vue'
import { useScanWorkbench } from '../composables/useScanWorkbench'
import { parseScanPackage } from '../domain/scanPackageParser'
import type { LocalizationProvider, ScenePagination } from '../domain/scanTypes'

const provider = ref<LocalizationProvider>('auto')
const currentFile = ref<File | null>(null)
const parseError = ref('')
const isParsing = ref(false)
const scenesLoading = ref(false)
const scenesError = ref('')
const sceneSearch = ref('')
const scenePagination = ref<ScenePagination>({
  page: 1,
  perPage: 10,
  pageCount: 1,
  totalCount: 0,
})
let parseRequestId = 0
let sceneRequestId = 0
const {
  scenes,
  parsedPackage,
  selectedSceneIds,
  bindingDraft,
  canCreateDraft,
  setScenes,
  setParsedPackage,
  toggleSceneSelection,
  createBindingDraft,
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
    })
    const bindings = await fetchSceneBindings(result.scenes.map((scene) => scene.id))

    if (requestId !== sceneRequestId) return

    const bindingBySceneId = new Map(bindings.map((binding) => [binding.sceneId, binding]))
    setScenes(result.scenes.map((scene) => {
      const binding = bindingBySceneId.get(scene.id)
      return binding
        ? {
            ...scene,
            boundSlamId: binding.slamId,
            boundSlamName: binding.slamName,
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

async function handleCreateDraft() {
  const draft = createBindingDraft()
  if (!draft) return
  scenesError.value = ''
  try {
    await createSceneBindings(draft)
    await refreshScenes()
  } catch (error) {
    const message = error instanceof Error && error.message
      ? error.message
      : 'Binding could not be created.'
    await refreshScenes()
    scenesError.value = message
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
