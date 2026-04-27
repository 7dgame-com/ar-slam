import { computed, ref } from 'vue'
import type { BindingResult, ParsedScanPackage, SceneOption, UploadedScanPackage } from '../domain/scanTypes'

export function useScanWorkbench() {
  const scenes = ref<SceneOption[]>([])
  const parsedPackage = ref<ParsedScanPackage | null>(null)
  const selectedSceneIds = ref<string[]>([])
  const bindingResult = ref<BindingResult | null>(null)

  const selectedScenes = computed(() => {
    const selectedSet = new Set(selectedSceneIds.value)
    return scenes.value.filter((scene) => selectedSet.has(scene.id))
  })

  const sortedScenes = computed(() => {
    return scenes.value
      .map((scene, index) => ({ scene, index }))
      .sort((left, right) => {
        const leftBound = Boolean(left.scene.boundSpaceId)
        const rightBound = Boolean(right.scene.boundSpaceId)
        if (leftBound !== rightBound) return leftBound ? -1 : 1
        return left.index - right.index
      })
      .map(({ scene }) => scene)
  })

  const selectedHasUnavailableScene = computed(() => {
    return selectedScenes.value.some((scene) => Boolean(scene.boundSpaceId))
  })

  const canSubmitBinding = computed(() => {
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
    const availableIds = new Set(nextScenes.filter((scene) => !scene.boundSpaceId).map((scene) => scene.id))
    selectedSceneIds.value = selectedSceneIds.value.filter((sceneId) => availableIds.has(sceneId))
  }

  function setParsedPackage(nextPackage: ParsedScanPackage | null) {
    if (parsedPackage.value?.modelBlobUrl && parsedPackage.value.modelBlobUrl !== nextPackage?.modelBlobUrl) {
      URL.revokeObjectURL(parsedPackage.value.modelBlobUrl)
    }
    parsedPackage.value = nextPackage
    bindingResult.value = null
  }

  function toggleSceneSelection(sceneId: string) {
    const scene = scenes.value.find((item) => item.id === sceneId)
    if (!scene || scene.boundSpaceId) return

    if (selectedSceneIds.value.includes(sceneId)) {
      selectedSceneIds.value = selectedSceneIds.value.filter((id) => id !== sceneId)
    } else {
      selectedSceneIds.value = [...selectedSceneIds.value, sceneId]
    }
    bindingResult.value = null
  }

  function clearSceneSelection() {
    selectedSceneIds.value = []
    bindingResult.value = null
  }

  function createBindingResult(uploadedPackage: UploadedScanPackage): BindingResult | null {
    if (!canSubmitBinding.value) {
      return null
    }

    const result: BindingResult = {
      ...uploadedPackage,
      scenes: selectedScenes.value.map((scene) => ({
        id: scene.id,
        name: scene.name,
      })),
      createdAt: new Date().toISOString(),
    }
    bindingResult.value = result
    return result
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
    sortedScenes,
    bindingResult,
    canSubmitBinding,
    setScenes,
    setParsedPackage,
    toggleSceneSelection,
    clearSceneSelection,
    createBindingResult,
    dispose,
  }
}
