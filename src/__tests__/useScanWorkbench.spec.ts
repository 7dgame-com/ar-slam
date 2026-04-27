import { describe, expect, it } from 'vitest'
import { useScanWorkbench } from '../composables/useScanWorkbench'
import type { ParsedScanPackage, SceneOption } from '../domain/scanTypes'

function parsedPackage(overrides: Partial<ParsedScanPackage> = {}): ParsedScanPackage {
  return {
    id: 'pkg-1',
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

  it('creates a binding draft for multiple backend scenes from one SLAM package', () => {
    const workbench = useScanWorkbench()
    workbench.setParsedPackage(parsedPackage())
    workbench.setScenes(scenes)
    workbench.toggleSceneSelection('101')
    workbench.toggleSceneSelection('102')

    const draft = workbench.createBindingDraft()

    expect(draft?.slamId).toBe('pkg-1')
    expect(draft?.scenes).toEqual([
      { id: '101', name: '旗舰店展厅' },
      { id: '102', name: '培训教室' },
    ])
    expect(draft?.provider).toBe('immersal')
    expect(draft?.modelFileName).toBe('room.glb')
    expect(draft?.localizationFileNames).toEqual(['map.bytes'])
  })

  it('does not select a scene already bound to a different SLAM package', () => {
    const workbench = useScanWorkbench()
    workbench.setParsedPackage(parsedPackage())
    workbench.setScenes([
      {
        id: '101',
        name: '旗舰店展厅',
        boundSlamId: 'other-slam',
        boundSlamName: '旧定位包',
      },
    ])

    workbench.toggleSceneSelection('101')

    expect(workbench.selectedSceneIds.value).toEqual([])
    expect(workbench.canCreateDraft.value).toBe(false)
  })

  it('does not create a binding draft when package validation has errors', () => {
    const workbench = useScanWorkbench()
    workbench.setParsedPackage(parsedPackage({ errors: ['Missing localization data.'] }))
    workbench.setScenes(scenes)
    workbench.toggleSceneSelection('101')

    expect(workbench.createBindingDraft()).toBe(null)
  })
})
