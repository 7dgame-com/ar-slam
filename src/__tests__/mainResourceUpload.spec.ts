import JSZip from 'jszip'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mainApi } from '../api'
import type { ParsedScanPackage } from '../domain/scanTypes'
import { uploadScanPackageToMain } from '../services/mainResourceUpload'

const cosMock = vi.hoisted(() => {
  const uploadCalls: Array<{ Bucket: string; Region: string; Key: string; Body: Blob }> = []
  const instance = {
    headObject: vi.fn((_params: unknown, callback: (error: Error | null) => void) => {
      callback(new Error('not found'))
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

function parsedPackage(): ParsedScanPackage {
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
    zipName: 'room.zip',
    provider: 'immersal',
    files: [modelFile, localizationFile],
    modelFile,
    localizationFiles: [localizationFile],
    warnings: [],
    errors: [],
    needsManualSelection: false,
    modelBlobUrl: 'blob:model',
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
  })

  it('uploads extracted scan files and thumbnail through main COS and creates file plus space records', async () => {
    const sourceFile = await zipFile('room.zip', {
      'room/model.glb': new Uint8Array([1, 2, 3]),
      'room/map.bytes': new Uint8Array([4, 5, 6]),
    })
    const filePayloads: Array<Record<string, unknown>> = []
    const spacePayloads: Array<Record<string, unknown>> = []
    const nextFileIds = [11, 12, 13, 14]

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
      parsedPackage: parsedPackage(),
      thumbnailBlob: new Blob(['thumb'], { type: 'image/png' }),
      onProgress: vi.fn(),
    })

    expect(cosMock.uploadCalls.map((item) => item.Key)).toEqual([
      'ar-slam-localization/pkg-room/room/model.glb',
      'ar-slam-localization/pkg-room/room/map.bytes',
      'ar-slam-localization/pkg-room/thumbnail.png',
      'ar-slam-localization/pkg-room/pkg-room-runtime.zip',
    ])
    const runtimeUpload = cosMock.uploadCalls.find((item) => item.Key.endsWith('pkg-room-runtime.zip'))
    expect(runtimeUpload).toBeDefined()
    const runtimeZip = await JSZip.loadAsync(runtimeUpload!.Body)
    const runtimeFiles = Object.values(runtimeZip.files)
      .filter((entry) => !entry.dir)
      .map((entry) => entry.name)
      .sort()
    expect(runtimeFiles).toEqual(['room/map.bytes'])

    expect(filePayloads.map((item) => item.filename)).toEqual([
      'model.glb',
      'map.bytes',
      'pkg-room-thumbnail.png',
      'pkg-room-runtime.zip',
    ])
    expect(filePayloads.every((item) => typeof item.md5 === 'string' && item.md5.length === 32)).toBe(true)
    expect(spacePayloads).toHaveLength(1)
    expect(spacePayloads[0]).toMatchObject({
      name: 'room.zip',
      mesh_id: 11,
      image_id: 13,
      file_id: 14,
    })
    expect(spacePayloads[0].data).toMatchObject({
      source: 'ar-slam-localization',
      provider: 'immersal',
      zipName: 'room.zip',
      cosPrefix: 'ar-slam-localization/pkg-room',
      runtimeFileId: 14,
      modelFileId: 11,
      thumbnailFileId: 13,
      localizationFileIds: [12],
    })
    expect(result).toMatchObject({
      spaceId: 701,
      spaceName: 'room.zip',
      cosPrefix: 'ar-slam-localization/pkg-room',
      runtimeFileId: 14,
      modelFileId: 11,
      thumbnailFileId: 13,
      localizationFileIds: [12],
    })
  })
})
