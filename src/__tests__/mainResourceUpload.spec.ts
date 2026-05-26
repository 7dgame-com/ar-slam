import JSZip from 'jszip'
import { readFile } from 'node:fs/promises'
import { URL as NodeURL } from 'node:url'
import SparkMD5 from 'spark-md5'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mainApi } from '../api'
import { parseScanPackage } from '../domain/scanPackageParser'
import type { ParsedScanPackage } from '../domain/scanTypes'
import { uploadScanPackageToMain } from '../services/mainResourceUpload'

const cosMock = vi.hoisted(() => {
  const uploadCalls: Array<{ Bucket: string; Region: string; Key: string; Body: Blob }> = []
  const existingKeys = new Set<string>()
  const instance = {
    headObject: vi.fn((params: { Key: string }, callback: (error: Error | null) => void) => {
      callback(existingKeys.has(params.Key) ? null : new Error('not found'))
    }),
    uploadFile: vi.fn((params: { Bucket: string; Region: string; Key: string; Body: Blob }, callback: (error: Error | null, data?: { Location?: string }) => void) => {
      uploadCalls.push(params)
      callback(null, {
        Location: `${params.Bucket}.cos.${params.Region}.myqcloud.com/${params.Key}`,
      })
    }),
  }

  return {
    constructor: vi.fn(() => instance),
    instance,
    uploadCalls,
    existingKeys,
  }
})

vi.mock('cos-js-sdk-v5', () => ({
  default: cosMock.constructor,
}))

async function zipFile(name: string, entries: Record<string, string | Uint8Array>): Promise<File> {
  const zip = new JSZip()
  for (const [path, content] of Object.entries(entries)) {
    zip.file(path, content)
  }
  const blob = await zip.generateAsync({ type: 'blob' })
  return new File([blob], name, { type: 'application/zip' })
}

async function blobMd5(blob: Blob): Promise<string> {
  const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(reader.error ?? new Error('Blob could not be read.'))
    reader.readAsArrayBuffer(blob)
  })
  return SparkMD5.ArrayBuffer.hash(buffer)
}

async function zipEntries(blob: Blob): Promise<string[]> {
  const zip = await JSZip.loadAsync(blob)
  return Object.values(zip.files)
    .filter((entry) => !entry.dir)
    .map((entry) => entry.name)
}

async function actualAreaTargetPipelineFile(): Promise<File> {
  const bytes = await readFile(new NodeURL('./fixtures/uv_unwrap_fixed.zip', import.meta.url))
  return new File([new Uint8Array(bytes)], 'uv_unwrap_fixed.zip', { type: 'application/zip' })
}

function parsedPackage(overrides: Partial<ParsedScanPackage> = {}): ParsedScanPackage {
  const modelFile = {
    path: 'room/model.glb',
    name: 'model.glb',
    extension: 'glb',
    size: 3,
    role: 'model' as const,
  }
  const localizationFile = {
    path: 'room/map.bytes',
    name: 'map.bytes',
    extension: 'bytes',
    size: 3,
    role: 'localization' as const,
  }

  return {
    id: 'pkg-room',
    zipMd5: 'pkg-room',
    zipName: 'room.zip',
    provider: 'immersal',
    files: [modelFile, localizationFile],
    modelFile,
    localizationFiles: [localizationFile],
    warnings: [],
    errors: [],
    needsManualSelection: false,
    modelBlobUrl: 'blob:model',
    ...overrides,
  }
}

describe('main resource upload service', () => {
  const originalMainAdapter = mainApi.defaults.adapter

  afterEach(() => {
    mainApi.defaults.adapter = originalMainAdapter
    cosMock.constructor.mockClear()
    cosMock.instance.headObject.mockClear()
    cosMock.instance.uploadFile.mockClear()
    cosMock.uploadCalls.length = 0
    cosMock.existingKeys.clear()
    vi.unstubAllGlobals()
  })

  it('uploads only mesh.glb, file.zip, and image.png under the content-addressed space directory', async () => {
    const sourceFile = await zipFile('room.zip', {
      'room/model.glb': new Uint8Array([1, 2, 3]),
      'room/map.bytes': new Uint8Array([4, 5, 6]),
    })
    const zipMd5 = 'content-md5-from-retained-files'
    const filePayloads: Array<Record<string, unknown>> = []
    const spacePayloads: Array<Record<string, unknown>> = []
    const nextFileIds = [11, 12, 13]

    mainApi.defaults.adapter = async (config) => {
      if (config.method === 'get' && config.url === '/system/deployment') {
        return {
          status: 200,
          statusText: 'OK',
          data: { deploymentMode: 'cloud', storageDriver: 'cos' },
          headers: {},
          config,
        }
      }

      if (config.method === 'get' && config.url === '/tencent-cloud/cloud') {
        return {
          status: 200,
          statusText: 'OK',
          data: { public: { bucket: 'public-bucket-1250000000', region: 'ap-guangzhou' } },
          headers: {},
          config,
        }
      }

      if (config.method === 'get' && config.url === '/tencent-cloud/public-token') {
        return {
          status: 200,
          statusText: 'OK',
          data: {
            Credentials: {
              TmpSecretId: 'tmp-id',
              TmpSecretKey: 'tmp-key',
              Token: 'tmp-token',
            },
            StartTime: 1777280000,
            ExpiredTime: 1777283600,
          },
          headers: {},
          config,
        }
      }

      if (config.method === 'post' && config.url === '/files') {
        const payload = JSON.parse(String(config.data))
        filePayloads.push(payload)
        return {
          status: 200,
          statusText: 'OK',
          data: { id: nextFileIds[filePayloads.length - 1] },
          headers: {},
          config,
        }
      }

      if (config.method === 'post' && config.url === '/spaces') {
        const payload = JSON.parse(String(config.data))
        spacePayloads.push(payload)
        return {
          status: 200,
          statusText: 'OK',
          data: { id: 701, name: payload.name, ...payload },
          headers: {},
          config,
        }
      }

      throw new Error(`Unexpected request ${config.method} ${config.url}`)
    }

    const result = await uploadScanPackageToMain({
      sourceFile,
      parsedPackage: parsedPackage({
        id: zipMd5,
        zipMd5,
      }),
      thumbnailBlob: new Blob(['thumb'], { type: 'image/png' }),
      onProgress: vi.fn(),
    })

    expect(cosMock.uploadCalls.map((item) => item.Key)).toEqual([
      `spaces/${zipMd5}/mesh.glb`,
      `spaces/${zipMd5}/file.zip`,
      `spaces/${zipMd5}/image.png`,
    ])
    await expect(zipEntries(cosMock.uploadCalls[1].Body)).resolves.toEqual(['room/map.bytes'])
    expect(filePayloads.map((item) => item.filename)).toEqual([
      'mesh.glb',
      'file.zip',
      'image.png',
    ])
    expect(filePayloads.every((item) => typeof item.md5 === 'string' && item.md5.length === 32)).toBe(true)
    expect(spacePayloads).toHaveLength(1)
    expect(spacePayloads[0]).toMatchObject({
      name: 'room.zip',
      mesh_id: 11,
      image_id: 13,
      file_id: 12,
    })
    expect(spacePayloads[0].data).toMatchObject({
      source: 'ar-slam-localization',
      provider: 'immersal',
      zipMd5,
      zipName: 'room.zip',
      cosPrefix: `spaces/${zipMd5}`,
      screenshotKey: `spaces/${zipMd5}/image.png`,
      primaryLocalizationFileId: 12,
      modelFileId: 11,
      thumbnailFileId: 13,
      localizationFileIds: [12],
    })
    expect(spacePayloads[0].data.files).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: 'mesh.glb',
        filename: 'mesh.glb',
        originalName: 'model.glb',
        key: `spaces/${zipMd5}/mesh.glb`,
      }),
      expect.objectContaining({
        path: 'file.zip',
        filename: 'file.zip',
        key: `spaces/${zipMd5}/file.zip`,
        entries: [expect.objectContaining({
          path: 'room/map.bytes',
          originalName: 'map.bytes',
        })],
      }),
      expect.objectContaining({
        path: 'image.png',
        filename: 'image.png',
        key: `spaces/${zipMd5}/image.png`,
      }),
    ]))
    expect(result).toMatchObject({
      spaceId: 701,
      spaceName: 'room.zip',
      zipMd5,
      cosPrefix: `spaces/${zipMd5}`,
      modelFileId: 11,
      thumbnailFileId: 13,
      localizationFileIds: [12],
    })
  })

  it('uses the main backend local upload endpoint when deployment config is local', async () => {
    const sourceFile = await zipFile('room.zip', {
      'room/model.glb': new Uint8Array([1, 2, 3]),
      'room/map.bytes': new Uint8Array([4, 5, 6]),
    })
    const zipMd5 = 'local-content-md5'
    const localUploadFilenames: string[] = []
    let nextFileId = 41

    mainApi.defaults.adapter = async (config) => {
      if (config.method === 'get' && config.url === '/system/deployment') {
        return {
          status: 200,
          statusText: 'OK',
          data: {
            deploymentMode: 'local',
            storageDriver: 'local',
            storage: { publicBucket: 'store', publicBaseUrl: '/storage' },
          },
          headers: {},
          config,
        }
      }

      if (config.method === 'post' && config.url === '/upload/file') {
        const formData = config.data as FormData
        const filename = String(formData.get('filename'))
        const directory = String(formData.get('directory'))
        const key = `${directory}/${filename}`
        localUploadFilenames.push(filename)
        return {
          status: 200,
          statusText: 'OK',
          data: {
            over: true,
            bucket: 'store',
            key,
            url: `/storage/store/${key}`,
            filename,
            size: Number(formData.get('size')),
            md5: String(formData.get('md5')),
          },
          headers: {},
          config,
        }
      }

      if (config.method === 'post' && config.url === '/files') {
        return {
          status: 200,
          statusText: 'OK',
          data: { id: nextFileId++ },
          headers: {},
          config,
        }
      }

      if (config.method === 'post' && config.url === '/spaces') {
        return {
          status: 200,
          statusText: 'OK',
          data: { id: 901, name: 'room.zip' },
          headers: {},
          config,
        }
      }

      throw new Error(`Unexpected request ${config.method} ${config.url}`)
    }

    const result = await uploadScanPackageToMain({
      sourceFile,
      parsedPackage: parsedPackage({
        id: zipMd5,
        zipMd5,
      }),
      thumbnailBlob: new Blob(['thumb'], { type: 'image/png' }),
    })

    expect(localUploadFilenames).toEqual(['mesh.glb', 'file.zip', 'image.png'])
    expect(cosMock.constructor).not.toHaveBeenCalled()
    expect(cosMock.uploadCalls).toHaveLength(0)
    expect(result).toMatchObject({
      spaceId: 901,
      zipMd5,
      modelFileId: 41,
      thumbnailFileId: 43,
      localizationFileIds: [42],
    })
  })

  it('stops before COS token requests when deployment config cannot be loaded', async () => {
    const sourceFile = await zipFile('room.zip', {
      'room/model.glb': new Uint8Array([1, 2, 3]),
      'room/map.bytes': new Uint8Array([4, 5, 6]),
    })

    mainApi.defaults.adapter = async (config) => {
      if (config.method === 'get' && config.url === '/system/deployment') {
        throw new Error('deployment unavailable')
      }

      throw new Error(`Unexpected request ${config.method} ${config.url}`)
    }

    await expect(uploadScanPackageToMain({
      sourceFile,
      parsedPackage: parsedPackage(),
      thumbnailBlob: new Blob(['thumb'], { type: 'image/png' }),
    })).rejects.toThrow('deployment unavailable')

    expect(cosMock.constructor).not.toHaveBeenCalled()
    expect(cosMock.uploadCalls).toHaveLength(0)
  })

  it('uploads the real Area Target Scanner pipeline artifact into an area-target-scanner space', async () => {
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:area-target-model'),
      revokeObjectURL: vi.fn(),
    })
    const sourceFile = await actualAreaTargetPipelineFile()
    const parsed = await parseScanPackage(sourceFile, 'auto')
    const filePayloads: Array<Record<string, unknown>> = []
    const spacePayloads: Array<Record<string, unknown>> = []
    const nextFileIds = [31, 32, 33]

    mainApi.defaults.adapter = async (config) => {
      if (config.method === 'get' && config.url === '/system/deployment') {
        return {
          status: 200,
          statusText: 'OK',
          data: { deploymentMode: 'cloud', storageDriver: 'cos' },
          headers: {},
          config,
        }
      }

      if (config.method === 'get' && config.url === '/tencent-cloud/cloud') {
        return {
          status: 200,
          statusText: 'OK',
          data: { public: { bucket: 'public-bucket-1250000000', region: 'ap-guangzhou' } },
          headers: {},
          config,
        }
      }

      if (config.method === 'get' && config.url === '/tencent-cloud/public-token') {
        return {
          status: 200,
          statusText: 'OK',
          data: {
            Credentials: {
              TmpSecretId: 'tmp-id',
              TmpSecretKey: 'tmp-key',
              Token: 'tmp-token',
            },
          },
          headers: {},
          config,
        }
      }

      if (config.method === 'post' && config.url === '/files') {
        const payload = JSON.parse(String(config.data))
        filePayloads.push(payload)
        return {
          status: 200,
          statusText: 'OK',
          data: { id: nextFileIds[filePayloads.length - 1] },
          headers: {},
          config,
        }
      }

      if (config.method === 'post' && config.url === '/spaces') {
        const payload = JSON.parse(String(config.data))
        spacePayloads.push(payload)
        return {
          status: 200,
          statusText: 'OK',
          data: { id: 801, name: payload.name, ...payload },
          headers: {},
          config,
        }
      }

      throw new Error(`Unexpected request ${config.method} ${config.url}`)
    }

    const result = await uploadScanPackageToMain({
      sourceFile,
      parsedPackage: parsed,
      thumbnailBlob: new Blob(['thumb'], { type: 'image/png' }),
    })

    expect(parsed.provider).toBe('area-target-scanner')
    expect(parsed.modelFile?.name).toBe('optimized.glb')
    expect(cosMock.uploadCalls.map((item) => item.Key)).toEqual([
      `spaces/${parsed.zipMd5}/mesh.glb`,
      `spaces/${parsed.zipMd5}/file.zip`,
      `spaces/${parsed.zipMd5}/image.png`,
    ])
    await expect(zipEntries(cosMock.uploadCalls[1].Body)).resolves.toEqual([
      'manifest.json',
      'features.db',
    ])
    expect(filePayloads.map((item) => item.filename)).toEqual([
      'mesh.glb',
      'file.zip',
      'image.png',
    ])
    expect(spacePayloads).toHaveLength(1)
    expect(spacePayloads[0]).toMatchObject({
      name: 'uv_unwrap_fixed.zip',
      mesh_id: 31,
      file_id: 32,
      image_id: 33,
    })
    const spaceData = spacePayloads[0].data as Record<string, unknown>
    expect(spaceData).toMatchObject({
      source: 'ar-slam-localization',
      provider: 'area-target-scanner',
      zipMd5: parsed.zipMd5,
      zipName: 'uv_unwrap_fixed.zip',
      cosPrefix: `spaces/${parsed.zipMd5}`,
      primaryLocalizationFileId: 32,
      modelFileId: 31,
      thumbnailFileId: 33,
      localizationFileIds: [32],
      manifestSummary: {
        version: '2.0',
        keyframeCount: 18,
      },
    })
    expect(spaceData.files).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: 'mesh.glb',
        sourcePath: 'optimized.glb',
        originalName: 'optimized.glb',
        filename: 'mesh.glb',
        role: 'model',
        key: `spaces/${parsed.zipMd5}/mesh.glb`,
      }),
      expect.objectContaining({
        path: 'file.zip',
        filename: 'file.zip',
        role: 'localization',
        key: `spaces/${parsed.zipMd5}/file.zip`,
        entries: [
          expect.objectContaining({
            path: 'manifest.json',
            originalName: 'manifest.json',
            role: 'manifest',
          }),
          expect.objectContaining({
            path: 'features.db',
            originalName: 'features.db',
            role: 'localization',
          }),
        ],
      }),
      expect.objectContaining({
        path: 'image.png',
        filename: 'image.png',
        role: 'support',
        key: `spaces/${parsed.zipMd5}/image.png`,
      }),
    ]))
    expect(result).toMatchObject({
      spaceId: 801,
      spaceName: 'uv_unwrap_fixed.zip',
      zipMd5: parsed.zipMd5,
      cosPrefix: `spaces/${parsed.zipMd5}`,
      modelFileId: 31,
      thumbnailFileId: 33,
      localizationFileIds: [32],
    })
  })

  it('reuses existing COS objects for the fixed mesh/file/image keys', async () => {
    const sourceFile = await zipFile('room.zip', {
      'room/model.glb': new Uint8Array([1, 2, 3]),
      'room/map.bytes': new Uint8Array([4, 5, 6]),
    })
    const zipMd5 = 'content-md5-from-retained-files'
    let nextFileId = 20
    cosMock.existingKeys.add(`spaces/${zipMd5}/file.zip`)

    mainApi.defaults.adapter = async (config) => {
      if (config.method === 'get' && config.url === '/system/deployment') {
        return {
          status: 200,
          statusText: 'OK',
          data: { deploymentMode: 'cloud', storageDriver: 'cos' },
          headers: {},
          config,
        }
      }

      if (config.method === 'get' && config.url === '/tencent-cloud/cloud') {
        return {
          status: 200,
          statusText: 'OK',
          data: { public: { bucket: 'public-bucket-1250000000', region: 'ap-guangzhou' } },
          headers: {},
          config,
        }
      }

      if (config.method === 'get' && config.url === '/tencent-cloud/public-token') {
        return {
          status: 200,
          statusText: 'OK',
          data: {
            Credentials: {
              TmpSecretId: 'tmp-id',
              TmpSecretKey: 'tmp-key',
              Token: 'tmp-token',
            },
          },
          headers: {},
          config,
        }
      }

      if (config.method === 'post' && config.url === '/files') {
        return {
          status: 200,
          statusText: 'OK',
          data: { id: nextFileId++ },
          headers: {},
          config,
        }
      }

      if (config.method === 'post' && config.url === '/spaces') {
        return {
          status: 200,
          statusText: 'OK',
          data: { id: 701, name: 'room.zip' },
          headers: {},
          config,
        }
      }

      throw new Error(`Unexpected request ${config.method} ${config.url}`)
    }

    await uploadScanPackageToMain({
      sourceFile,
      parsedPackage: parsedPackage({
        id: zipMd5,
        zipMd5,
      }),
      thumbnailBlob: new Blob(['thumb'], { type: 'image/png' }),
    })

    expect(cosMock.uploadCalls.map((item) => item.Key)).toEqual([
      `spaces/${zipMd5}/mesh.glb`,
      `spaces/${zipMd5}/image.png`,
    ])
  })
})
