import { computed, readonly } from 'vue'
import { useAuthSession } from './useAuthSession'

export interface Permissions {
  'workbench-access': boolean
}

export function usePermissions() {
  const { user, loaded, loading, isAuthenticated, fetchSession } = useAuthSession()

  const permissions = computed<Permissions>(() => ({
    'workbench-access': loaded.value && isAuthenticated.value,
  }))

  async function fetchPermissions(force = false) {
    await fetchSession(force)
  }

  function can(action: keyof Permissions): boolean {
    return permissions.value[action]
  }

  function hasAny(): boolean {
    return Object.values(permissions.value).some(Boolean)
  }

  return {
    user: readonly(user),
    permissions: readonly(permissions),
    loaded: readonly(loaded),
    loading: readonly(loading),
    fetchPermissions,
    can,
    hasAny,
  }
}
