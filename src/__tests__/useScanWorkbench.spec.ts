import { describe, expect, it } from 'vitest'
import { useScanWorkbench } from '../composables/useScanWorkbench'
import type { ParsedScanPackage, SceneOption } from '../domain/scanTypes'

function parsedPackage(overrides: Partial<ParsedScanPackage> = {}): ParsedScanPackage {
  return {
    id: 'pkg-1',
    zipMd5: 'pkg-1',
    zipName: 'room.zip',
    provider: 'immersal',
    files: [],
    modelFile: {
      path: 'room.glb',
      name: 'room.glb',
      extension: 'glb',
      size: 123,
      role: 'model',
    },
    localizationFiles: [{
      path: 'map.bytes',
      name: 'map.bytes',
      extension: 'bytes',
      size: 456,
      role: 'localization',
    }],
    warnings: [],
    errors: [],
    needsManualSelection: false,
    modelBlobUrl: 'blob:model',
    ...overrides,
  }
}

describe('useScanWorkbench', () => {
  const scenes: SceneOption[] = [
    {
      id: '101',
      name: '旗舰店展厅',
      description: '上海 / 1F',
    },
    {
      id: '102',
      name: '培训教室',
      description: '深圳 / Lab A',
    },
  ]

  it('records a binding result for multiple backend scenes from one uploaded space', () => {
    const workbench = useScanWorkbench()
    workbench.setParsedPackage(parsedPackage())
    workbench.setScenes(scenes)
    workbench.toggleSceneSelection('101')
    workbench.toggleSceneSelection('102')

    const result = workbench.createBindingResult({
      spaceId: 701,
      spaceName: 'room.zip',
      zipMd5: 'pkg-1',
      cosPrefix: 'spaces/pkg-1',
      modelFileId: 11,
      thumbnailFileId: 13,
      localizationFileIds: [12],
    })

    expect(result?.spaceId).toBe(701)
    expect(result?.spaceName).toBe('room.zip')
    expect(result?.scenes).toEqual([
      { id: '101', name: '旗舰店展厅' },
      { id: '102', name: '培训教室' },
    ])
  })

  it('does not select a scene already bound to a different space', () => {
    const workbench = useScanWorkbench()
    workbench.setParsedPackage(parsedPackage())
    workbench.setScenes([
      {
        id: '101',
        name: '旗舰店展厅',
        boundSpaceId: '702',
        boundSpaceName: '旧定位包',
      },
    ])

    workbench.toggleSceneSelection('101')

    expect(workbench.selectedSceneIds.value).toEqual([])
    expect(workbench.canSubmitBinding.value).toBe(false)
  })

  it('does not create a binding result when package validation has errors', () => {
    const workbench = useScanWorkbench()
    workbench.setParsedPackage(parsedPackage({ errors: ['Missing localization data.'] }))
    workbench.setScenes(scenes)
    workbench.toggleSceneSelection('101')

    expect(workbench.createBindingResult({
      spaceId: 701,
      spaceName: 'room.zip',
      zipMd5: 'pkg-1',
      cosPrefix: 'spaces/pkg-1',
      modelFileId: 11,
      thumbnailFileId: 13,
      localizationFileIds: [12],
    })).toBe(null)
  })

  it('can create a binding result from an existing uploaded space without a parsed package', () => {
    const workbench = useScanWorkbench()
    workbench.setScenes(scenes)
    workbench.toggleSceneSelection('101')

    const result = workbench.createBindingResult({
      spaceId: 801,
      spaceName: 'A 馆定位包',
      zipMd5: 'zip-md5-a',
      cosPrefix: 'spaces/zip-md5-a',
      modelFileId: 31,
      thumbnailFileId: 33,
      localizationFileIds: [32],
    })

    expect(result?.spaceId).toBe(801)
    expect(result?.scenes).toEqual([{ id: '101', name: '旗舰店展厅' }])
  })
})
