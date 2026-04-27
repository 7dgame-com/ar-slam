import { beforeEach, describe, expect, it, vi } from 'vitest'

const verifyCurrentToken = vi.fn()

vi.mock('../api/index', () => ({
  verifyCurrentToken,
}))

describe('useAuthSession', () => {
  beforeEach(() => {
    vi.resetModules()
    verifyCurrentToken.mockReset()
  })

  it('marks any authenticated user as loaded after verify-token succeeds', async () => {
    verifyCurrentToken.mockResolvedValue({
      data: {
        data: {
          id: 3,
          username: 'demo-user',
          roles: ['user'],
        },
      },
    })

    const { useAuthSession } = await import('../composables/useAuthSession')
    const session = useAuthSession()

    await session.fetchSession(true)

    expect(session.user.value).toEqual({
      id: 3,
      username: 'demo-user',
      roles: ['user'],
    })
    expect(session.loaded.value).toBe(true)
    expect(session.isAuthenticated.value).toBe(true)
  })
})
