import { afterEach, describe, expect, it } from 'vitest'
import {
  arSlamApi,
  createSceneBindings,
  deleteSpaceRecord,
  deleteSceneBinding,
  fetchExistingSpaces,
  fetchSceneBindings,
  fetchVerseScenes,
  mainApi,
  updateSpaceRecord,
} from '../api'

describe('scene api', () => {
  const originalMainAdapter = mainApi.defaults.adapter
  const originalArSlamAdapter = arSlamApi.defaults.adapter

  afterEach(() => {
    mainApi.defaults.adapter = originalMainAdapter
    arSlamApi.defaults.adapter = originalArSlamAdapter
  })

  it('loads paginated Verse scenes from the main backend', async () => {
    mainApi.defaults.adapter = async (config) => {
      expect(config.url).toBe('/verses')
      expect(config.params).toEqual({
        page: 2,
        'per-page': 12,
        'VerseSearch[name]': '展厅',
        expand: 'image',
        sort: '-created_at',
      })

      return {
        status: 200,
        statusText: 'OK',
        data: [{
          id: 101,
          name: '旗舰店展厅',
          description: '上海 / 1F',
          image: { url: 'https://cdn.example.com/scene-101.png' },
        }],
        headers: {
          'x-pagination-total-count': '31',
          'x-pagination-page-count': '3',
          'x-pagination-current-page': '2',
          'x-pagination-per-page': '12',
        },
        config,
      }
    }

    const result = await fetchVerseScenes({ page: 2, perPage: 12, search: '展厅', sort: '-created_at' })

    expect(result.scenes).toEqual([{
      id: '101',
      name: '旗舰店展厅',
      description: '上海 / 1F',
      thumbnailUrl: 'https://cdn.example.com/scene-101.png',
    }])
    expect(result.pagination).toEqual({ page: 2, perPage: 12, pageCount: 3, totalCount: 31 })
  })

  it('loads existing bindings for a page of scene ids', async () => {
    arSlamApi.defaults.adapter = async (config) => {
      expect(config.url).toBe('/bindings')
      expect(config.params).toEqual({ verseIds: '101,102' })

      return {
        status: 200,
        statusText: 'OK',
        data: [{ verseId: 102, spaceId: 701, spaceName: 'A 馆定位包' }],
        headers: {},
        config,
      }
    }

    await expect(fetchSceneBindings(['101', '102'])).resolves.toEqual([
      { sceneId: '102', spaceId: '701', spaceName: 'A 馆定位包' },
    ])
  })

  it('loads reusable spaces from the main backend', async () => {
    mainApi.defaults.adapter = async (config) => {
      expect(config.url).toBe('/spaces')
      expect(config.params).toEqual({
        page: 1,
        'per-page': 20,
        expand: 'image,mesh,file',
      })

      return {
        status: 200,
        statusText: 'OK',
        data: [{
          id: 701,
          name: 'A 馆定位包',
          mesh_id: 11,
          image_id: 13,
          file_id: 12,
          image: { url: 'https://cdn.example.com/spaces/a.png' },
          mesh: {
            id: 11,
            filename: 'space-a.glb',
            url: 'https://cdn.example.com/spaces/space-a.glb',
          },
          data: {
            source: 'ar-slam-localization',
            provider: 'immersal',
            zipMd5: 'zip-md5-a',
            cosPrefix: 'spaces/zip-md5-a',
            modelFileId: 11,
            thumbnailFileId: 13,
            localizationFileIds: [12],
          },
        }],
        headers: {},
        config,
      }
    }

    await expect(fetchExistingSpaces()).resolves.toEqual([{
      spaceId: 701,
      spaceName: 'A 馆定位包',
      zipMd5: 'zip-md5-a',
      cosPrefix: 'spaces/zip-md5-a',
      modelFileId: 11,
      thumbnailFileId: 13,
      localizationFileIds: [12],
      provider: 'immersal',
      thumbnailUrl: 'https://cdn.example.com/spaces/a.png',
      modelUrl: 'https://cdn.example.com/spaces/space-a.glb',
      modelName: 'space-a.glb',
    }])
  })

  it('deduplicates reusable spaces by zip md5 so historical duplicate rows show once', async () => {
    mainApi.defaults.adapter = async (config) => ({
      status: 200,
      statusText: 'OK',
      data: [
        {
          id: 702,
          name: 'A 馆定位包 Copy',
          mesh_id: 21,
          image_id: 23,
          file_id: 22,
          data: {
            source: 'ar-slam-localization',
            provider: 'immersal',
            zipMd5: 'zip-md5-a',
            cosPrefix: 'spaces/zip-md5-a',
          },
        },
        {
          id: 701,
          name: 'A 馆定位包',
          mesh_id: 11,
          image_id: 13,
          file_id: 12,
          data: {
            source: 'ar-slam-localization',
            provider: 'immersal',
            zipMd5: 'zip-md5-a',
            cosPrefix: 'spaces/zip-md5-a',
          },
        },
      ],
      headers: {},
      config,
    })

    await expect(fetchExistingSpaces()).resolves.toEqual([expect.objectContaining({
      spaceId: 702,
      spaceName: 'A 馆定位包 Copy',
      zipMd5: 'zip-md5-a',
    })])
  })

  it('creates scene bindings with a space id and verse ids', async () => {
    arSlamApi.defaults.adapter = async (config) => {
      expect(config.url).toBe('/bindings')
      expect(config.method).toBe('post')
      expect(JSON.parse(String(config.data))).toEqual({
        spaceId: 701,
        verseIds: ['101', '102'],
      })

      return {
        status: 200,
        statusText: 'OK',
        data: { spaceId: 701, verseIds: [101, 102] },
        headers: {},
        config,
      }
    }

    await expect(createSceneBindings({ spaceId: 701, verseIds: ['101', '102'] })).resolves.toEqual({
      spaceId: 701,
      verseIds: [101, 102],
    })
  })

  it('deletes one scene binding by verse id', async () => {
    arSlamApi.defaults.adapter = async (config) => {
      expect(config.url).toBe('/bindings/101')
      expect(config.method).toBe('delete')

      return {
        status: 200,
        statusText: 'OK',
        data: { code: 0, data: { verseId: 101 } },
        headers: {},
        config,
      }
    }

    await expect(deleteSceneBinding('101')).resolves.toEqual({ code: 0, data: { verseId: 101 } })
  })

  it('deletes a reusable space from the main backend', async () => {
    mainApi.defaults.adapter = async (config) => {
      expect(config.url).toBe('/spaces/701')
      expect(config.method).toBe('delete')

      return {
        status: 204,
        statusText: 'No Content',
        data: '',
        headers: {},
        config,
      }
    }

    await expect(deleteSpaceRecord(701)).resolves.toBe('')
  })

  it('updates a reusable space name on the main backend', async () => {
    mainApi.defaults.adapter = async (config) => {
      expect(config.url).toBe('/spaces/701')
      expect(config.method).toBe('patch')
      expect(JSON.parse(String(config.data))).toEqual({ name: 'A 馆定位包 v2' })

      return {
        status: 200,
        statusText: 'OK',
        data: { id: 701, name: 'A 馆定位包 v2' },
        headers: {},
        config,
      }
    }

    await expect(updateSpaceRecord(701, { name: 'A 馆定位包 v2' })).resolves.toEqual({
      id: 701,
      name: 'A 馆定位包 v2',
    })
  })

  it('treats a missing binding endpoint as no binding records while backend catches up', async () => {
    arSlamApi.defaults.adapter = async () => {
      return Promise.reject({ response: { status: 404 } })
    }

    await expect(fetchSceneBindings(['101', '102'])).resolves.toEqual([])
  })
})
