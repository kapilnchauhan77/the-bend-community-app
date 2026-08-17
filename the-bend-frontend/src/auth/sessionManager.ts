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
  private initializing = false
  private initializeInFlight: Promise<AuthSnapshot> | null = null
  private epoch = 0
  private mutationQueue: Promise<void> = Promise.resolve()
  private listeners = new Set<(snapshot: AuthSnapshot) => void>()
  private readonly options: SessionManagerOptions

  constructor(options: SessionManagerOptions) { this.options = options }

  private snapshot(): AuthSnapshot {
    return { user: this.currentUser, shop: this.currentShop, isAuthenticated: !!this.accessToken && !!this.currentUser, isLoading: this.initializing }
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

  get isNative(): boolean { return this.options.runtime.isNative }

  getSnapshot(): AuthSnapshot { return this.snapshot() }

  async setAuthenticated(response: AuthTokens | RefreshResponse): Promise<void> {
    this.epoch += 1
    await this.applyAuthenticated(response, this.epoch)
  }

  private async applyAuthenticated(response: AuthTokens | RefreshResponse, expectedEpoch: number, markReady = true): Promise<void> {
    await this.enqueueMutation(async () => {
      if (expectedEpoch !== this.epoch) return
      if (response.refresh_token) await this.options.sessionStore.save({ refreshToken: response.refresh_token })
      if (expectedEpoch !== this.epoch) return
      this.accessToken = response.access_token
      if (response.refresh_token) this.refreshToken = response.refresh_token
      if (response.user) this.currentUser = response.user
      if (response.shop !== undefined) this.currentShop = response.shop ?? null
      if (markReady) this.initializing = false
      const browserStorage = !this.options.runtime.isNative && typeof globalThis !== 'undefined' ? (globalThis as typeof globalThis & { localStorage?: Storage }).localStorage : undefined
      if (browserStorage && typeof browserStorage.setItem === 'function') {
        browserStorage.setItem('access_token', response.access_token)
        if (this.currentUser) browserStorage.setItem('user', JSON.stringify(this.currentUser))
        browserStorage.setItem('shop', JSON.stringify(this.currentShop))
      }
      if (markReady) {
        this.initialized = true
        this.publish()
      }
    })
  }

  async initialize(): Promise<AuthSnapshot> {
    if (this.initialized) return this.snapshot()
    if (this.initializeInFlight) return this.initializeInFlight
    const hydrationEpoch = this.epoch
    this.initializing = true
    this.publish()
    this.initializeInFlight = this.hydrate(hydrationEpoch).finally(() => { this.initializeInFlight = null })
    return this.initializeInFlight
  }

  private async hydrate(hydrationEpoch: number): Promise<AuthSnapshot> {
    const stored = await this.options.sessionStore.load().catch(() => null)
    if (hydrationEpoch !== this.epoch) return this.snapshot()
    if (!stored) {
      this.initializing = false
      this.initialized = true
      this.publish()
      return emptySnapshot()
    }
    try {
      this.refreshToken = stored.refreshToken
      const token = await this.refresh(false)
      if (hydrationEpoch !== this.epoch) return this.snapshot()
      if (!token) throw new Error('Session refresh returned no access token')
      const current = await this.options.getCurrentSession()
      if (hydrationEpoch !== this.epoch) return this.snapshot()
      await this.enqueueMutation(async () => {
        if (hydrationEpoch !== this.epoch) return
        this.currentUser = current.user
        this.currentShop = current.shop
        this.initializing = false
        this.initialized = true
        this.publish()
      })
      return this.snapshot()
    } catch {
      if (hydrationEpoch !== this.epoch) return this.snapshot()
      await this.clearLocalSession()
      if (hydrationEpoch !== this.epoch) return this.snapshot()
      this.initializing = false
      this.initialized = true
      this.publish()
      return emptySnapshot()
    }
  }

  async refresh(markReady = true): Promise<string | null> {
    if (this.refreshInFlight) return this.refreshInFlight
    this.refreshInFlight = this.doRefresh(markReady).finally(() => { this.refreshInFlight = null })
    return this.refreshInFlight
  }

  private async doRefresh(markReady: boolean): Promise<string | null> {
    const requestEpoch = this.epoch
    if (!this.refreshToken) {
      const stored = await this.options.sessionStore.load().catch(() => null)
      this.refreshToken = stored?.refreshToken ?? null
    }
    if (!this.refreshToken) return null
    try {
      const response = await this.options.refresh(this.refreshToken)
      if (requestEpoch !== this.epoch) return null
      await this.applyAuthenticated({ ...response, refresh_token: response.refresh_token ?? this.refreshToken }, requestEpoch, markReady)
      return response.access_token
    } catch (error) {
      if (requestEpoch === this.epoch) await this.clearLocalSession()
      throw error
    }
  }

  async logout(): Promise<void> {
    const requestEpoch = ++this.epoch
    const refreshToken = this.refreshToken ?? (await this.options.sessionStore.load().catch(() => null))?.refreshToken
    if (this.refreshInFlight) await this.refreshInFlight.catch(() => undefined)
    if (requestEpoch !== this.epoch) return
    try { if (refreshToken && this.options.logoutRequest) await this.options.logoutRequest(refreshToken) } catch { /* local cleanup is authoritative */ }
    await this.clearLocalSession()
    this.initializing = false
    this.initialized = true
    this.publish()
  }

  private async clearLocalSession() {
    await this.enqueueMutation(async () => {
      this.accessToken = null
      this.refreshToken = null
      this.currentUser = null
      this.currentShop = null
      await this.options.sessionStore.clear().catch(() => undefined)
      const browserStorage = !this.options.runtime.isNative && typeof globalThis !== 'undefined' ? (globalThis as typeof globalThis & { localStorage?: Storage }).localStorage : undefined
      if (browserStorage && typeof browserStorage.removeItem === 'function') {
        browserStorage.removeItem('access_token')
        browserStorage.removeItem('user')
        browserStorage.removeItem('shop')
      }
    })
  }

  private enqueueMutation(task: () => Promise<void>): Promise<void> {
    const next = this.mutationQueue.then(task, task)
    this.mutationQueue = next.catch(() => undefined)
    return next
  }
}

function createDefaultManager(): SessionManager {
  const runtime = getRuntimeConfig()
  const services = createPlatformServices(runtime)
  const client = axios.create({ baseURL: runtime.apiBaseUrl, headers: { 'Content-Type': 'application/json', 'X-Tenant-Slug': runtime.tenantSlug } })
  return new SessionManager({
    runtime,
    sessionStore: services.sessionStore,
    refresh: async (refreshToken) => (await client.post<RefreshResponse>('/auth/refresh', { refresh_token: refreshToken })).data,
    getCurrentSession: async () => (await client.get<{ user: User; shop?: Shop | null }>('/auth/me', { headers: { Authorization: `Bearer ${sessionManager?.getAccessToken?.() ?? ''}`, 'X-Tenant-Slug': runtime.tenantSlug } })).data,
    logoutRequest: (refreshToken) => client.post('/auth/logout', { refresh_token: refreshToken }),
  })
}

export const sessionManager = createDefaultManager()
