import axios from 'axios'
import type { AxiosError, InternalAxiosRequestConfig } from 'axios'
import {
  getToken,
  setToken,
  removeAllTokens,
  isInIframe,
  requestParentTokenRefresh,
  getRefreshToken,
  setRefreshToken
} from '../utils/token'
import type { BindingDraft, SceneBindingRecord, SceneListResult, SceneOption } from '../domain/scanTypes'

/**
 * AR SLAM 定位插件业务 API 实例
 */
const arSlamApi = axios.create({
  baseURL: '/api/v1/plugin-ar-slam-localization',
  timeout: 10000
})

/**
 * 主后端接口（指向主系统 /api/v1）
 */
const mainApi = axios.create({
  baseURL: '/api/v1',
  timeout: 10000
})

// --- Token refresh state ---
let isRefreshing = false
let failedQueue: Array<{
  resolve: (token: string) => void
  reject: (error: Error) => void
}> = []
let bootstrapTokenPromise: Promise<string | null> | null = null

function processQueue(error: Error | null, token: string | null) {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error || !token) {
      reject(error ?? new Error('Token refresh failed'))
    } else {
      resolve(token)
    }
  })
  failedQueue = []
}

/**
 * 两段式 token 刷新：
 * 1. iframe 模式下先请求主框架刷新
 * 2. 主框架超时后回退到本地 refresh token
 * 两段均失败才返回 null，由上层触发 TOKEN_EXPIRED
 */
async function tryRefreshToken(): Promise<string | null> {
  if (isInIframe()) {
    const result = await requestParentTokenRefresh()
    if (result?.accessToken) {
      setToken(result.accessToken)
      return result.accessToken
    }
  }

  const refreshToken = getRefreshToken()
  if (!refreshToken) return null

  try {
    const res = await axios.post('/api/auth/refresh', { refreshToken })
    const { accessToken, refreshToken: newRefreshToken } = res.data
    setToken(accessToken)
    if (newRefreshToken) setRefreshToken(newRefreshToken)
    return accessToken
  } catch {
    return null
  }
}

async function getRequestToken(): Promise<string | null> {
  const token = getToken()
  if (token) return token

  if (!isInIframe()) {
    return null
  }

  if (!bootstrapTokenPromise) {
    bootstrapTokenPromise = requestParentTokenRefresh()
      .then((result) => {
        const accessToken = result?.accessToken ?? getToken()
        if (accessToken) {
          setToken(accessToken)
        }
        return accessToken
      })
      .finally(() => {
        bootstrapTokenPromise = null
      })
  }

  return bootstrapTokenPromise
}

/**
 * 为 axios 实例添加请求/响应拦截器
 */
function setupInterceptors(instance: ReturnType<typeof axios.create>) {
  // Request: 注入 Authorization header
  instance.interceptors.request.use(async (config) => {
    const token = await getRequestToken()
    if (token) config.headers.Authorization = `Bearer ${token}`
    return config
  })

  // Response: 提取 x-refresh-token 响应头 + 处理 401 刷新
  instance.interceptors.response.use(
    (res) => {
      const refreshToken = res.headers['x-refresh-token']
      if (refreshToken) setRefreshToken(refreshToken)
      return res
    },
    async (err: AxiosError) => {
      const originalRequest = err.config as InternalAxiosRequestConfig & {
        _retry?: boolean
      }

      if (err.response?.status !== 401 || originalRequest._retry) {
        return Promise.reject(err)
      }

      if (isRefreshing) {
        return new Promise<string>((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        }).then((newToken) => {
          originalRequest.headers.Authorization = `Bearer ${newToken}`
          originalRequest._retry = true
          return instance(originalRequest)
        })
      }

      originalRequest._retry = true
      isRefreshing = true

      try {
        const newToken = await tryRefreshToken()

        if (!newToken) {
          throw new Error('Token refresh failed')
        }

        processQueue(null, newToken)
        originalRequest.headers.Authorization = `Bearer ${newToken}`
        return instance(originalRequest)
      } catch (refreshError) {
        removeAllTokens()

        if (isInIframe()) {
          window.parent.postMessage({ type: 'TOKEN_EXPIRED' }, '*')
        }

        processQueue(
          refreshError instanceof Error
            ? refreshError
            : new Error('Token refresh failed'),
          null
        )

        return Promise.reject(refreshError)
      } finally {
        isRefreshing = false
      }
    }
  )
}

setupInterceptors(arSlamApi)
setupInterceptors(mainApi)

// 默认导出 arSlamApi（业务接口），同时具名导出 mainApi
export default arSlamApi
export { arSlamApi, mainApi }

export interface VerifyTokenResponse {
  code: number
  message?: string
  data: {
    id: number
    username?: string
    nickname?: string
    roles?: string[]
  }
}

export function verifyCurrentToken(): Promise<{ data: VerifyTokenResponse }> {
  return mainApi.get('/plugin/verify-token')
}

interface VerseSceneResponse {
  id: number | string
  name?: string
  description?: string | null
  info?: string | null
}

interface SceneListParams {
  page: number
  perPage: number
  search?: string
}

function headerInt(headers: Record<string, unknown>, key: string, fallback: number): number {
  const value = headers[key] ?? headers[key.toLowerCase()]
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function toSceneOption(item: VerseSceneResponse): SceneOption {
  return {
    id: String(item.id),
    name: item.name || `Scene ${item.id}`,
    description: item.description || item.info || undefined,
  }
}

export async function fetchVerseScenes(params: SceneListParams): Promise<SceneListResult> {
  const search = params.search?.trim()
  const response = await mainApi.get<VerseSceneResponse[]>('/verses', {
    params: {
      page: params.page,
      'per-page': params.perPage,
      'VerseSearch[name]': search || undefined,
    },
  })

  return {
    scenes: response.data.map(toSceneOption),
    pagination: {
      page: headerInt(response.headers, 'x-pagination-current-page', params.page),
      perPage: headerInt(response.headers, 'x-pagination-per-page', params.perPage),
      pageCount: headerInt(response.headers, 'x-pagination-page-count', 1),
      totalCount: headerInt(response.headers, 'x-pagination-total-count', response.data.length),
    },
  }
}

export async function fetchSceneBindings(sceneIds: string[]): Promise<SceneBindingRecord[]> {
  if (sceneIds.length === 0) return []

  let response: { data: Array<{
    sceneId?: number | string
    scene_id?: number | string
    slamId?: string
    slam_id?: string
    slamName?: string
    slam_name?: string
  }> }

  try {
    response = await arSlamApi.get('/bindings', {
      params: {
        sceneIds: sceneIds.join(','),
      },
    })
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'response' in error) {
      const status = (error as { response?: { status?: number } }).response?.status
      if (status === 404) return []
    }
    throw error
  }

  return response.data
    .map((item) => ({
      sceneId: String(item.sceneId ?? item.scene_id ?? ''),
      slamId: String(item.slamId ?? item.slam_id ?? ''),
      slamName: item.slamName ?? item.slam_name,
    }))
    .filter((item) => item.sceneId && item.slamId)
}

export async function createSceneBindings(draft: BindingDraft): Promise<unknown> {
  return arSlamApi.post('/bindings', {
    slamId: draft.slamId,
    slamName: draft.slamName,
    provider: draft.provider,
    zipName: draft.zipName,
    modelFileName: draft.modelFileName,
    localizationFileNames: draft.localizationFileNames,
    sceneIds: draft.scenes.map((scene) => scene.id),
  }).then((response) => response.data)
}
