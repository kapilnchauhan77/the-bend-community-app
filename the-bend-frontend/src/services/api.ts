import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { getRuntimeConfig, type RuntimeConfig } from '@/platform/runtimeConfig'
import { sessionManager } from '@/auth/sessionManager'

declare module 'axios' { interface InternalAxiosRequestConfig { _authRetry?: boolean; _skipAuthRefresh?: boolean } }
export interface AuthInterceptorManager {
  getAccessToken: () => string | null
  refresh: () => Promise<string | null>
  logout: () => Promise<void>
}

export function createApiClient(manager: AuthInterceptorManager = sessionManager, runtime: RuntimeConfig = getRuntimeConfig()) {
  const api = axios.create({ baseURL: runtime.apiBaseUrl, headers: { 'Content-Type': 'application/json' } })

  api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    const token = manager.getAccessToken()
    if (token) config.headers.Authorization = `Bearer ${token}`
    config.headers['X-Tenant-Slug'] = runtime.tenantSlug
    if (typeof config.url === 'string' && /\/auth\/(refresh|logout)$/.test(config.url)) config._skipAuthRefresh = true
    return config
  })

  api.interceptors.response.use((response) => response, async (error: AxiosError) => {
    const originalRequest = error.config
    if (error.response?.status !== 401 || !originalRequest || originalRequest._authRetry || originalRequest._skipAuthRefresh) return Promise.reject(error)
    originalRequest._authRetry = true
    try {
      const token = await manager.refresh()
      if (!token) {
        await manager.logout()
        redirectToLogin()
        return Promise.reject(error)
      }
      originalRequest.headers.Authorization = `Bearer ${token}`
      return api(originalRequest)
    } catch {
      await manager.logout()
      redirectToLogin()
      return Promise.reject(error)
    }
  })
  return api
}

function redirectToLogin() {
  if (typeof window !== 'undefined' && window.location.pathname !== '/login') window.location.href = '/login'
}

export default createApiClient()
