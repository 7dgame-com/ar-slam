import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import { ElMessage } from 'element-plus'
import { usePermissions } from '../composables/usePermissions'
import { notifyHostPluginUrlChanged } from '../utils/hostEvents'

declare module 'vue-router' {
  interface RouteMeta {
    title?: string
    titleKey?: string
    public?: boolean
    requiresPermission?: string
  }
}

export function createPluginRoutes(
  options: { includeDiagnostics?: boolean } = {},
): RouteRecordRaw[] {
  const includeDiagnostics = import.meta.env.DEV && (options.includeDiagnostics ?? true)
  const routes: RouteRecordRaw[] = []

  if (includeDiagnostics) {
    routes.push({
      path: '/api-diagnostics',
      name: 'ApiDiagnostics',
      component: () => import('../views/ApiDiagnostics.vue'),
      meta: { title: 'API 诊断', public: true }
    })
  }

  routes.push(
    {
      path: '/',
      component: () => import('../layout/AppLayout.vue'),
      redirect: '/workbench',
      children: [
        {
          path: 'workbench',
          name: 'Workbench',
          component: () => import('../views/WorkbenchView.vue'),
          meta: { titleKey: 'workbench.title', requiresPermission: 'workbench-access' }
        },
      ]
    },
  )

  return routes
}

const router = createRouter({
  history: createWebHistory(),
  routes: createPluginRoutes(),
})

export function permissionGuard(
  to: { meta: { public?: boolean; requiresPermission?: string } },
  from: { name?: string | symbol | null | undefined }
): boolean | string {
  if (to.meta.public) return true

  const requiredPermission = to.meta.requiresPermission
  if (!requiredPermission) return true

  try {
    const { can } = usePermissions()
    if (can(requiredPermission as Parameters<typeof can>[0])) {
      return true
    }
    if (!from.name) return true
    ElMessage.error('您没有权限访问此页面')
    return false
  } catch {
    ElMessage.error('权限验证失败，请稍后重试')
    if (!from.name) return true
    return false
  }
}

router.beforeEach(permissionGuard)

router.afterEach((to) => {
  notifyHostPluginUrlChanged(to.fullPath)
})

export default router
