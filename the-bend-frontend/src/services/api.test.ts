import { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApiClient } from './api'

const runtime = { kind: 'ios' as const, isNative: true, apiBaseUrl: 'https://api.test/api/v1', wsBaseUrl: 'wss://api.test', tenantSlug: 'westmoreland', appVersion: '1', buildNumber: '1', environment: 'test' as const }

function response(config: InternalAxiosRequestConfig, status = 200, data: unknown = { ok: true }) {
  return { data, status, statusText: String(status), headers: {}, config }
}

describe('authenticated API interceptors', () => {
  beforeEach(() => { window.history.replaceState({}, '', '/login') })
  it('adds bearer and tenant headers and retries once with a replacement token', async () => {
    let calls = 0
    const manager = { getAccessToken: vi.fn(() => calls ? 'new-token' : 'old-token'), refresh: vi.fn(async () => 'new-token'), logout: vi.fn(async () => undefined) }
    const api = createApiClient(manager, runtime)
    api.defaults.adapter = async (config) => {
      calls += 1
      if (calls === 1) throw new AxiosError('unauthorized', 'ERR_BAD_REQUEST', config, undefined, response(config, 401))
      return response(config, 200, { authorization: config.headers.Authorization, tenant: config.headers['X-Tenant-Slug'] })
    }
    await expect(api.get('/members')).resolves.toMatchObject({ data: { authorization: 'Bearer new-token', tenant: 'westmoreland' } })
    expect(manager.refresh).toHaveBeenCalledTimes(1)
  })

  it('does not refresh a retried 401 a second time', async () => {
    const manager = { getAccessToken: vi.fn(() => 'token'), refresh: vi.fn(async () => 'replacement'), logout: vi.fn(async () => undefined) }
    const api = createApiClient(manager, runtime)
    api.defaults.adapter = async (config) => { throw new AxiosError('unauthorized', 'ERR_BAD_REQUEST', config, undefined, response(config, 401)) }
    await expect(api.get('/members')).rejects.toBeInstanceOf(AxiosError)
    expect(manager.refresh).toHaveBeenCalledTimes(1)
  })

  it('cleans up when refresh returns null', async () => {
    const manager = { getAccessToken: vi.fn(() => 'token'), refresh: vi.fn(async () => null), logout: vi.fn(async () => undefined) }
    const api = createApiClient(manager, runtime)
    api.defaults.adapter = async (config) => { throw new AxiosError('unauthorized', 'ERR_BAD_REQUEST', config, undefined, response(config, 401)) }
    await expect(api.get('/members')).rejects.toBeInstanceOf(AxiosError)
    expect(manager.logout).toHaveBeenCalledTimes(1)
  })

  it('marks auth refresh and logout requests as non-refreshable', async () => {
    const manager = { getAccessToken: vi.fn(() => 'token'), refresh: vi.fn(), logout: vi.fn() }
    const api = createApiClient(manager, runtime)
    api.defaults.adapter = async (config) => { throw new AxiosError('unauthorized', 'ERR_BAD_REQUEST', config, undefined, response(config, 401)) }
    await expect(api.post('/auth/refresh')).rejects.toBeInstanceOf(AxiosError)
    await expect(api.post('/auth/logout')).rejects.toBeInstanceOf(AxiosError)
    expect(manager.refresh).not.toHaveBeenCalled()
  })
})
