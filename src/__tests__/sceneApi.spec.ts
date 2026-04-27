import { afterEach, describe, expect, it } from 'vitest'
import { arSlamApi, createSceneBindings, fetchSceneBindings, fetchVerseScenes, mainApi } from '../api'

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
      expect(config.params).toEqual({ page: 2, 'per-page': 12, 'VerseSearch[name]': '展厅' })

      return {
        status: 200,
        statusText: 'OK',
        data: [{ id: 101, name: '旗舰店展厅', description: '上海 / 1F' }],
        headers: {
          'x-pagination-total-count': '31',
          'x-pagination-page-count': '3',
          'x-pagination-current-page': '2',
          'x-pagination-per-page': '12',
        },
        config,
      }
    }

    const result = await fetchVerseScenes({ page: 2, perPage: 12, search: '展厅' })

    expect(result.scenes).toEqual([{ id: '101', name: '旗舰店展厅', description: '上海 / 1F' }])
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

  it('treats a missing binding endpoint as no binding records while backend catches up', async () => {
    arSlamApi.defaults.adapter = async () => {
      return Promise.reject({ response: { status: 404 } })
    }

    await expect(fetchSceneBindings(['101', '102'])).resolves.toEqual([])
  })
})
