import { describe, expect, it, vi } from 'vitest'
import type { RuntimeConfig, SessionStore, StoredSession } from '@/platform/contracts'
import type { AuthTokens, Shop, User } from '@/types'
import { SessionManager } from './sessionManager'

const runtime: RuntimeConfig = { kind: 'ios', isNative: true, apiBaseUrl: 'https://example.test/api/v1', wsBaseUrl: 'wss://example.test', tenantSlug: 'westmoreland', appVersion: '1', buildNumber: '1', environment: 'test' }
const user: User = { id: 'u1', name: 'Ada', email: 'ada@example.com', role: 'individual' }
const shop: Shop = { id: 's1', name: 'Shop', business_type: 'cafe', status: 'active' }
const tokens: AuthTokens = { access_token: 'access', refresh_token: 'refresh', token_type: 'bearer', user, shop }

function store(initial: StoredSession | null = null): SessionStore {
  let value = initial
  return { load: vi.fn(async () => value), save: vi.fn(async (next) => { value = next }), clear: vi.fn(async () => { value = null }) }
}

describe('SessionManager', () => {
  it('keeps native access tokens in memory only', async () => {
    const sessionStore = store()
    const manager = new SessionManager({ runtime, sessionStore, refresh: vi.fn(), getCurrentSession: vi.fn(async () => ({ user, shop })) })
    await manager.setAuthenticated(tokens)
    expect(manager.getAccessToken()).toBe('access')
    expect(await sessionStore.load()).toEqual({ refreshToken: 'refresh' })
  })

  it('coalesces concurrent refreshes', async () => {
    const sessionStore = store({ refreshToken: 'refresh' })
    const refreshApi = vi.fn(async () => ({ access_token: 'new-access', refresh_token: 'new-refresh', user, shop }))
    const manager = new SessionManager({ runtime, sessionStore, refresh: refreshApi, getCurrentSession: vi.fn(async () => ({ user, shop })) })
    await Promise.all([manager.refresh(), manager.refresh(), manager.refresh()])
    expect(refreshApi).toHaveBeenCalledTimes(1)
    expect(manager.getAccessToken()).toBe('new-access')
  })

  it('hydrates and authenticates only after refresh and current session succeed', async () => {
    const manager = new SessionManager({ runtime, sessionStore: store({ refreshToken: 'refresh' }), refresh: vi.fn(async () => tokens), getCurrentSession: vi.fn(async () => ({ user, shop })) })
    await expect(manager.initialize()).resolves.toMatchObject({ user, shop, isAuthenticated: true, isLoading: false })
  })

  it('returns an unauthenticated snapshot when hydration fails', async () => {
    const manager = new SessionManager({ runtime, sessionStore: store({ refreshToken: 'refresh' }), refresh: vi.fn(async () => { throw new Error('offline') }), getCurrentSession: vi.fn() })
    await expect(manager.initialize()).resolves.toMatchObject({ user: null, shop: null, isAuthenticated: false, isLoading: false })
  })

  it('allows web access token compatibility persistence through the web adapter', async () => {
    const sessionStore = store()
    const manager = new SessionManager({ runtime: { ...runtime, kind: 'web', isNative: false }, sessionStore, refresh: vi.fn(), getCurrentSession: vi.fn(async () => ({ user, shop })) })
    await manager.setAuthenticated(tokens)
    expect(sessionStore.save).toHaveBeenCalledWith({ refreshToken: 'refresh' })
    expect(manager.getAccessToken()).toBe('access')
  })
})
