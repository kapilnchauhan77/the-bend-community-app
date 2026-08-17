import axios from 'axios'
import type { AuthSnapshot, RuntimeConfig, SessionStore } from '@/platform/contracts'
import type { AuthTokens, Shop, User } from '@/types'
import { createPlatformServices } from '@/platform/createPlatformServices'
import { getRuntimeConfig } from '@/platform/runtimeConfig'

export type RefreshResponse = Pick<AuthTokens, 'access_token'> & Partial<Pick<AuthTokens, 'refresh_token' | 'user' | 'shop'>>

export interface SessionManagerOptions {
  runtime: RuntimeConfig
  sessionStore: SessionStore
  refresh: (refreshToken: string) => Promise<RefreshResponse>
  getCurrentSession: () => Promise<{ user: User; shop: Shop | null }>
  logoutRequest?: (refreshToken: string) => Promise<unknown>
  onSnapshot?: (snapshot: AuthSnapshot) => void
}

const emptySnapshot = (): AuthSnapshot => ({ user: null, shop: null, isAuthenticated: false, isLoading: false })

export class SessionManager {
  private accessToken: string | null = null
  private refreshToken: string | null = null
  private currentUser: User | null = null
  private currentShop: Shop | null = null
  private refreshInFlight: Promise<string | null> | null = null
  private initialized = false
  private listeners = new Set<(snapshot: AuthSnapshot) => void>()
  private readonly options: SessionManagerOptions

  constructor(options: SessionManagerOptions) { this.options = options }

  private snapshot(): AuthSnapshot {
    return { user: this.currentUser, shop: this.currentShop, isAuthenticated: !!this.accessToken && !!this.currentUser, isLoading: false }
  }

  private publish() {
    const snapshot = this.snapshot()
    this.options.onSnapshot?.(snapshot)
    this.listeners.forEach((listener) => listener(snapshot))
  }

  subscribe(listener: (snapshot: AuthSnapshot) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getAccessToken(): string | null { return this.accessToken }

  getSnapshot(): AuthSnapshot { return this.snapshot() }

  async setAuthenticated(response: AuthTokens | RefreshResponse): Promise<void> {
    this.accessToken = response.access_token
    if (response.refresh_token) {
      this.refreshToken = response.refresh_token
      await this.options.sessionStore.save({ refreshToken: response.refresh_token })
    }
    if (response.user) this.currentUser = response.user
    if (response.shop !== undefined) this.currentShop = response.shop ?? null
    if (!this.options.runtime.isNative && typeof localStorage?.setItem === 'function') {
      localStorage.setItem('access_token', response.access_token)
      if (this.currentUser) localStorage.setItem('user', JSON.stringify(this.currentUser))
      localStorage.setItem('shop', JSON.stringify(this.currentShop))
    }
    this.initialized = true
    this.publish()
  }

  async initialize(): Promise<AuthSnapshot> {
    if (this.initialized) return this.snapshot()
    const stored = await this.options.sessionStore.load().catch(() => null)
    if (!stored) { this.initialized = true; this.publish(); return emptySnapshot() }
    try {
      this.refreshToken = stored.refreshToken
      await this.refresh()
      const current = await this.options.getCurrentSession()
      this.currentUser = current.user
      this.currentShop = current.shop
      this.initialized = true
      this.publish()
      return this.snapshot()
    } catch {
      await this.clearLocalSession()
      this.initialized = true
      this.publish()
      return emptySnapshot()
    }
  }

  async refresh(): Promise<string | null> {
    if (this.refreshInFlight) return this.refreshInFlight
    this.refreshInFlight = this.doRefresh().finally(() => { this.refreshInFlight = null })
    return this.refreshInFlight
  }

  private async doRefresh(): Promise<string | null> {
    if (!this.refreshToken) {
      const stored = await this.options.sessionStore.load().catch(() => null)
      this.refreshToken = stored?.refreshToken ?? null
    }
    if (!this.refreshToken) return null
    try {
      const response = await this.options.refresh(this.refreshToken)
      await this.setAuthenticated({ ...response, refresh_token: response.refresh_token ?? this.refreshToken })
      return response.access_token
    } catch (error) {
      await this.clearLocalSession()
      throw error
    }
  }

  async logout(): Promise<void> {
    const refreshToken = this.refreshToken ?? (await this.options.sessionStore.load().catch(() => null))?.refreshToken
    try { if (refreshToken && this.options.logoutRequest) await this.options.logoutRequest(refreshToken) } catch { /* local cleanup is authoritative */ }
    await this.clearLocalSession()
    this.initialized = true
    this.publish()
  }

  private async clearLocalSession() {
    this.accessToken = null
    this.refreshToken = null
    this.currentUser = null
    this.currentShop = null
    await this.options.sessionStore.clear().catch(() => undefined)
    if (!this.options.runtime.isNative && typeof localStorage?.removeItem === 'function') {
      localStorage.removeItem('access_token')
      localStorage.removeItem('user')
      localStorage.removeItem('shop')
    }
  }
}

function createDefaultManager(): SessionManager {
  const runtime = getRuntimeConfig()
  const services = createPlatformServices(runtime)
  const client = axios.create({ baseURL: runtime.apiBaseUrl, headers: { 'Content-Type': 'application/json' } })
  return new SessionManager({
    runtime,
    sessionStore: services.sessionStore,
    refresh: async (refreshToken) => (await client.post<RefreshResponse>('/auth/refresh', { refresh_token: refreshToken })).data,
    getCurrentSession: async () => (await client.get<{ user: User; shop?: Shop | null }>('/auth/me')).data,
    logoutRequest: (refreshToken) => client.post('/auth/logout', { refresh_token: refreshToken }),
  })
}

export const sessionManager = createDefaultManager()
