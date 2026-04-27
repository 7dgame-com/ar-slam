import { beforeEach, describe, expect, it, vi } from 'vitest'

const { fetchSession, sessionState } = vi.hoisted(() => ({
  fetchSession: vi.fn(),
  sessionState: {
    loaded: { value: false },
    loading: { value: false },
    user: { value: null as null | { roles?: string[] } },
    isAuthenticated: { value: false },
  },
}))

vi.mock('../composables/useAuthSession', () => ({
  useAuthSession: () => ({
    user: sessionState.user,
    loaded: sessionState.loaded,
    loading: sessionState.loading,
    isAuthenticated: sessionState.isAuthenticated,
    fetchSession,
  }),
}))

async function loadComposable() {
  vi.resetModules()
  return import('../composables/usePermissions')
}

describe('usePermissions', () => {
  beforeEach(() => {
    fetchSession.mockReset()
    sessionState.loaded.value = false
    sessionState.loading.value = false
    sessionState.user.value = null
    sessionState.isAuthenticated.value = false
  })

  it('treats the workbench as auth-only once the session is loaded', async () => {
    sessionState.loaded.value = true
    sessionState.user.value = { roles: ['user'] }
    sessionState.isAuthenticated.value = true

    const { usePermissions } = await loadComposable()
    const permissions = usePermissions()

    await permissions.fetchPermissions()

    expect(fetchSession).toHaveBeenCalledTimes(1)
    expect(permissions.loaded.value).toBe(true)
    expect(permissions.hasAny()).toBe(true)
    expect(permissions.can('workbench-access')).toBe(true)
  })

  it('keeps the workbench unavailable when no authenticated session exists', async () => {
    const { usePermissions } = await loadComposable()
    const permissions = usePermissions()

    await permissions.fetchPermissions()

    expect(permissions.hasAny()).toBe(false)
    expect(permissions.can('workbench-access')).toBe(false)
  })
})
