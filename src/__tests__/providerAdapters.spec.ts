import { describe, expect, it } from 'vitest'
import { detectProvider, detectAreaTargetScanner, detectImmersal } from '../domain/providerAdapters'
import type { ScanFileRef } from '../domain/scanTypes'

function file(path: string, size = 100): ScanFileRef {
  return {
    path,
    name: path.split('/').pop() || path,
    extension: path.split('.').pop()?.toLowerCase() || '',
    size,
    role: 'unknown',
  }
}

describe('provider adapters', () => {
  it('detects Immersal packages with glb and bytes map files', () => {
    const result = detectImmersal([
      file('room/textured_mesh.glb'),
      file('room/map.bytes'),
      file('room/sparse.ply'),
    ])

    expect(result.matched).toBe(true)
    expect(result.provider).toBe('immersal')
    expect(result.modelFile?.name).toBe('textured_mesh.glb')
    expect(result.localizationFiles.map((item) => item.name)).toEqual(['map.bytes'])
    expect(result.errors).toEqual([])
  })

  it('rejects Immersal packages missing the byte map file', () => {
    const result = detectImmersal([file('room/textured_mesh.glb')])

    expect(result.matched).toBe(false)
    expect(result.errors).toContain('Immersal packages require a .bytes or .byte map file.')
  })

  it('detects Area Target Scanner bundles with manifest, model glb, and features db', () => {
    const result = detectAreaTargetScanner([
      file('asset_bundle/manifest.json'),
      file('asset_bundle/model.glb'),
      file('asset_bundle/features.db'),
      file('asset_bundle/texture_atlas.png'),
    ])

    expect(result.matched).toBe(true)
    expect(result.provider).toBe('area-target-scanner')
    expect(result.modelFile?.name).toBe('model.glb')
    expect(result.localizationFiles.map((item) => item.name)).toEqual(['features.db'])
    expect(result.errors).toEqual([])
  })

  it('rejects Area Target Scanner bundles missing features.db', () => {
    const result = detectAreaTargetScanner([
      file('asset_bundle/manifest.json'),
      file('asset_bundle/model.glb'),
    ])

    expect(result.matched).toBe(false)
    expect(result.errors).toContain('Area Target Scanner bundles require features.db.')
  })

  it('asks for manual selection when multiple providers match', () => {
    const result = detectProvider([
      file('asset_bundle/manifest.json'),
      file('asset_bundle/model.glb'),
      file('asset_bundle/features.db'),
      file('asset_bundle/map.bytes'),
    ], 'auto')

    expect(result.provider).toBe(null)
    expect(result.needsManualSelection).toBe(true)
    expect(result.warnings).toContain('Multiple localization providers matched. Choose the correct provider manually.')
  })
})
