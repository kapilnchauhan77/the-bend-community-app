import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { getRuntimeConfig } from '@/platform/runtimeConfig'
import { sessionManager } from '@/auth/sessionManager'

declare module 'axios' { interface InternalAxiosRequestConfig { _authRetry?: boolean; _skipAuthRefresh?: boolean } }
const runtime = getRuntimeConfig()
const api = axios.create({ baseURL: runtime.apiBaseUrl, headers: { 'Content-Type': 'application/json' } })

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = sessionManager.getAccessToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  config.headers['X-Tenant-Slug'] = runtime.tenantSlug
  return config
})

api.interceptors.response.use((response) => response, async (error: AxiosError) => {
  const originalRequest = error.config
  if (error.response?.status !== 401 || !originalRequest || originalRequest._authRetry || originalRequest._skipAuthRefresh) return Promise.reject(error)
  originalRequest._authRetry = true
  try {
    const token = await sessionManager.refresh()
    if (!token) return Promise.reject(error)
    originalRequest.headers.Authorization = `Bearer ${token}`
    return api(originalRequest)
  } catch {
    await sessionManager.logout()
    if (typeof window !== 'undefined' && window.location.pathname !== '/login') window.location.href = '/login'
    return Promise.reject(error)
  }
})

export default api;
