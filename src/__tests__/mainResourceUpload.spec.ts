import JSZip from 'jszip'
import SparkMD5 from 'spark-md5'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mainApi } from '../api'
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

  it('reuses existing COS objects for the fixed mesh/file/image keys', async () => {
    const sourceFile = await zipFile('room.zip', {
      'room/model.glb': new Uint8Array([1, 2, 3]),
      'room/map.bytes': new Uint8Array([4, 5, 6]),
    })
    const zipMd5 = 'content-md5-from-retained-files'
    let nextFileId = 20
    cosMock.existingKeys.add(`spaces/${zipMd5}/file.zip`)

    mainApi.defaults.adapter = async (config) => {
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
