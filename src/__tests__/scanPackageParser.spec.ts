import JSZip from 'jszip'
import SparkMD5 from 'spark-md5'
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

async function fileMd5(file: File): Promise<string> {
  const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(reader.error ?? new Error('File could not be read.'))
    reader.readAsArrayBuffer(file)
  })
  return SparkMD5.ArrayBuffer.hash(buffer)
}

async function zipEntries(file: File): Promise<string[]> {
  const zip = await JSZip.loadAsync(file)
  return Object.values(zip.files)
    .filter((entry) => !entry.dir)
    .map((entry) => entry.name)
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
    const cleanZipFile = (result as typeof result & { cleanZipFile?: File }).cleanZipFile

    expect(cleanZipFile).toBeInstanceOf(File)
    expect(result.id).toBe(result.zipMd5)
    expect(result.zipMd5).not.toBe(await fileMd5(file))
    await expect(zipEntries(cleanZipFile as File)).resolves.toEqual([
      'room/textured_mesh.glb',
      'room/map.bytes',
    ])
    expect(result.provider).toBe('immersal')
    expect(result.modelFile?.name).toBe('textured_mesh.glb')
    expect(result.localizationFiles.map((item) => item.name)).toEqual(['map.bytes'])
    expect(result.modelBlobUrl).toBe('blob:scan-model')
    expect(result.errors).toEqual([])
  })

  it('builds a clean Immersal upload zip from the GLB and first bytes file only', async () => {
    const file = await zipFile('immersal-room.zip', {
      'room/textured_mesh.glb': new Uint8Array([1, 2, 3]),
      'room/._textured_mesh.glb': new Uint8Array([9, 9, 9]),
      'room/map.bytes': new Uint8Array([4, 5, 6]),
      'room/._map.bytes': new Uint8Array([8, 8, 8]),
      'room/extra.bytes': new Uint8Array([3, 3, 3]),
      'room/preview.png': new Uint8Array([2, 2, 2]),
      'room/readme.txt': 'ignore me',
      '__MACOSX/room/._map.bytes': new Uint8Array([7, 7, 7]),
      'room/.DS_Store': new Uint8Array([6, 6, 6]),
      'room/Thumbs.db': new Uint8Array([5, 5, 5]),
      'room/desktop.ini': new Uint8Array([4, 4, 4]),
    })

    const result = await parseScanPackage(file, 'auto')
    const cleanZipFile = (result as typeof result & { cleanZipFile?: File }).cleanZipFile

    expect(result.provider).toBe('immersal')
    expect(result.files.map((item) => item.path)).toEqual([
      'room/textured_mesh.glb',
      'room/map.bytes',
    ])
    expect(result.modelFile?.path).toBe('room/textured_mesh.glb')
    expect(result.localizationFiles.map((item) => item.path)).toEqual(['room/map.bytes'])
    expect(cleanZipFile).toBeInstanceOf(File)
    await expect(zipEntries(cleanZipFile as File)).resolves.toEqual([
      'room/textured_mesh.glb',
      'room/map.bytes',
    ])
    expect(result.zipMd5).not.toBe(await fileMd5(file))
  })

  it('uses retained file contents instead of zip container bytes for Immersal package md5', async () => {
    const firstFile = await zipFile('first.zip', {
      'room/textured_mesh.glb': new Uint8Array([1, 2, 3]),
      'room/map.bytes': new Uint8Array([4, 5, 6]),
      'room/readme.txt': 'first packaging',
    })
    const secondFile = await zipFile('second.zip', {
      'scan/textured_mesh.glb': new Uint8Array([1, 2, 3]),
      'scan/map.bytes': new Uint8Array([4, 5, 6]),
      'scan/readme.txt': 'second packaging',
      'scan/preview.png': new Uint8Array([7, 8, 9]),
      '__MACOSX/scan/._map.bytes': new Uint8Array([0]),
    })

    const firstResult = await parseScanPackage(firstFile, 'auto')
    const secondResult = await parseScanPackage(secondFile, 'auto')

    expect(firstResult.provider).toBe('immersal')
    expect(secondResult.provider).toBe('immersal')
    expect(firstResult.zipMd5).toBe(secondResult.zipMd5)
    expect(firstResult.zipMd5).not.toBe(await fileMd5(firstFile))
    expect(secondResult.zipMd5).not.toBe(await fileMd5(secondFile))
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
      'asset_bundle/preview.png': new Uint8Array([4, 4, 4]),
      'asset_bundle/readme.txt': 'ignore me',
    })

    const result = await parseScanPackage(file, 'auto')
    const cleanZipFile = (result as typeof result & { cleanZipFile?: File }).cleanZipFile

    expect(result.provider).toBe('area-target-scanner')
    expect(result.files.map((item) => item.path)).toEqual([
      'asset_bundle/model.glb',
      'asset_bundle/manifest.json',
      'asset_bundle/features.db',
    ])
    expect(cleanZipFile).toBeInstanceOf(File)
    await expect(zipEntries(cleanZipFile as File)).resolves.toEqual([
      'asset_bundle/model.glb',
      'asset_bundle/manifest.json',
      'asset_bundle/features.db',
    ])
    expect(result.zipMd5).not.toBe(await fileMd5(file))
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
