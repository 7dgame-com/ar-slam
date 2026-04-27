import { computed, ref } from 'vue'
import type { BindingDraft, ParsedScanPackage, SceneOption } from '../domain/scanTypes'

export function useScanWorkbench() {
  const scenes = ref<SceneOption[]>([])
  const parsedPackage = ref<ParsedScanPackage | null>(null)
  const selectedSceneIds = ref<string[]>([])
  const bindingDraft = ref<BindingDraft | null>(null)

  const selectedScenes = computed(() => {
    const selectedSet = new Set(selectedSceneIds.value)
    return scenes.value.filter((scene) => selectedSet.has(scene.id))
  })

  const selectedHasUnavailableScene = computed(() => {
    return selectedScenes.value.some((scene) => Boolean(scene.boundSlamId))
  })

  const canCreateDraft = computed(() => {
    return Boolean(
      parsedPackage.value?.provider &&
      parsedPackage.value.modelFile &&
      parsedPackage.value.localizationFiles.length > 0 &&
      parsedPackage.value.errors.length === 0 &&
      selectedScenes.value.length > 0 &&
      !selectedHasUnavailableScene.value
    )
  })

  function setScenes(nextScenes: SceneOption[]) {
    scenes.value = nextScenes
    const availableIds = new Set(nextScenes.filter((scene) => !scene.boundSlamId).map((scene) => scene.id))
    selectedSceneIds.value = selectedSceneIds.value.filter((sceneId) => availableIds.has(sceneId))
  }

  function setParsedPackage(nextPackage: ParsedScanPackage | null) {
    if (parsedPackage.value?.modelBlobUrl && parsedPackage.value.modelBlobUrl !== nextPackage?.modelBlobUrl) {
      URL.revokeObjectURL(parsedPackage.value.modelBlobUrl)
    }
    parsedPackage.value = nextPackage
    bindingDraft.value = null
  }

  function toggleSceneSelection(sceneId: string) {
    const scene = scenes.value.find((item) => item.id === sceneId)
    if (!scene || scene.boundSlamId) return

    if (selectedSceneIds.value.includes(sceneId)) {
      selectedSceneIds.value = selectedSceneIds.value.filter((id) => id !== sceneId)
    } else {
      selectedSceneIds.value = [...selectedSceneIds.value, sceneId]
    }
    bindingDraft.value = null
  }

  function clearSceneSelection() {
    selectedSceneIds.value = []
    bindingDraft.value = null
  }

  function createBindingDraft(): BindingDraft | null {
    if (!canCreateDraft.value || !parsedPackage.value?.provider || !parsedPackage.value.modelFile) {
      return null
    }

    const draft: BindingDraft = {
      slamId: parsedPackage.value.id,
      slamName: parsedPackage.value.zipName,
      scenes: selectedScenes.value.map((scene) => ({
        id: scene.id,
        name: scene.name,
      })),
      provider: parsedPackage.value.provider,
      zipName: parsedPackage.value.zipName,
      modelFileName: parsedPackage.value.modelFile.name,
      localizationFileNames: parsedPackage.value.localizationFiles.map((file) => file.name),
      createdAt: new Date().toISOString(),
    }
    bindingDraft.value = draft
    return draft
  }

  function dispose() {
    if (parsedPackage.value?.modelBlobUrl) {
      URL.revokeObjectURL(parsedPackage.value.modelBlobUrl)
    }
  }

  return {
    scenes,
    parsedPackage,
    selectedSceneIds,
    selectedScenes,
    bindingDraft,
    canCreateDraft,
    setScenes,
    setParsedPackage,
    toggleSceneSelection,
    clearSceneSelection,
    createBindingDraft,
    dispose,
  }
}
