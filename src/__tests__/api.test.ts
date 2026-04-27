import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../utils/token', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/token')>()
  return {
    ...actual,
    isInIframe: vi.fn().mockReturnValue(true),
    requestParentTokenRefresh: vi.fn().mockResolvedValue(null),
  }
})

describe('api token bootstrap', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('waits for the parent token before sending the first embedded request', async () => {
    const tokenModule = await import('../utils/token')
    vi.mocked(tokenModule.isInIframe).mockReturnValue(true)
    vi.mocked(tokenModule.requestParentTokenRefresh).mockResolvedValueOnce({ accessToken: 'parent-token' })

    const { default: api } = await import('../api/index')

    let callCount = 0
    const originalAdapter = api.defaults.adapter
    api.defaults.adapter = async (config: import('axios').InternalAxiosRequestConfig) => {
      callCount += 1
      expect(config.headers.Authorization).toBe('Bearer parent-token')

      return {
        status: 200,
        statusText: 'OK',
        data: { ok: true },
        headers: {},
        config,
      }
    }

    try {
      const response = await api.get('/items')

      expect(response.data).toEqual({ ok: true })
      expect(callCount).toBe(1)
      expect(tokenModule.requestParentTokenRefresh).toHaveBeenCalledTimes(1)
      expect(localStorage.getItem('ar-slam-localization-token')).toBe('parent-token')
    } finally {
      api.defaults.adapter = originalAdapter
    }
  })
})
