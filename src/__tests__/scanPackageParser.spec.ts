import JSZip from 'jszip'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseScanPackage } from '../domain/scanPackageParser'

async function zipFile(name: string, entries: Record<string, string | Uint8Array>): Promise<File> {
  const zip = new JSZip()
  for (const [path, content] of Object.entries(entries)) {
    zip.file(path, content)
  }
  const blob = await zip.generateAsync({ type: 'blob' })
  return new File([blob], name, { type: 'application/zip' })
}

describe('scanPackageParser', () => {
  beforeEach(() => {
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:scan-model'),
      revokeObjectURL: vi.fn(),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('parses Immersal scan packages and creates a model blob URL', async () => {
    const file = await zipFile('immersal-room.zip', {
      'room/textured_mesh.glb': new Uint8Array([1, 2, 3]),
      'room/map.bytes': new Uint8Array([4, 5, 6]),
    })

    const result = await parseScanPackage(file, 'auto')

    expect(result.provider).toBe('immersal')
    expect(result.modelFile?.name).toBe('textured_mesh.glb')
    expect(result.localizationFiles.map((item) => item.name)).toEqual(['map.bytes'])
    expect(result.modelBlobUrl).toBe('blob:scan-model')
    expect(result.errors).toEqual([])
  })

  it('parses Area Target Scanner manifests into a summary', async () => {
    const file = await zipFile('area-target.zip', {
      'asset_bundle/manifest.json': JSON.stringify({
        version: '1.3.0',
        keyframeCount: 42,
        bounds: { min: [0, 0, 0], max: [1, 2, 3] },
      }),
      'asset_bundle/model.glb': new Uint8Array([1, 2, 3]),
      'asset_bundle/features.db': new Uint8Array([7, 8, 9]),
    })

    const result = await parseScanPackage(file, 'auto')

    expect(result.provider).toBe('area-target-scanner')
    expect(result.manifestSummary).toEqual({
      version: '1.3.0',
      keyframeCount: 42,
      bounds: { min: [0, 0, 0], max: [1, 2, 3] },
      rawKeys: ['version', 'keyframeCount', 'bounds'],
    })
  })

  it('rejects non-zip files', async () => {
    const file = new File(['hello'], 'room.txt', { type: 'text/plain' })

    await expect(parseScanPackage(file, 'auto')).rejects.toThrow('Only .zip scan packages are supported.')
  })
})
