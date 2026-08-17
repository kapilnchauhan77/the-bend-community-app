import { beforeEach, describe, expect, it, vi } from 'vitest'
const secureValues = new Map<string, string>()
vi.mock('@aparajita/capacitor-secure-storage', () => ({
  KeychainAccess: { whenUnlockedThisDeviceOnly: 1 },
  SecureStorage: {
    setSynchronize: vi.fn(async () => undefined),
    get: vi.fn(async (key: string) => secureValues.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => { secureValues.set(key, value) }),
    remove: vi.fn(async (key: string) => { secureValues.delete(key) }),
  },
}))
import { createPlatformServices } from './createPlatformServices'
import type { RuntimeConfig } from './contracts'
import { NativeSessionStore } from './native/NativeSessionStore'
import { WebSessionStore } from './web/WebSessionStore'

function config(kind: RuntimeConfig['kind']): RuntimeConfig {
  return {
    kind,
    isNative: kind !== 'web',
    apiBaseUrl: 'https://api.example.test/api/v1',
    wsBaseUrl: 'wss://api.example.test',
    tenantSlug: 'westmoreland',
    appVersion: '1.0.0',
    buildNumber: '1',
    environment: 'test',
  }
}

describe('createPlatformServices', () => {
  beforeEach(() => secureValues.clear())
  it('selects native services for iOS', () => {
    expect(createPlatformServices(config('ios')).sessionStore).toBeInstanceOf(NativeSessionStore)
  })

  it('selects web services for the browser', () => {
    expect(createPlatformServices(config('web')).sessionStore).toBeInstanceOf(WebSessionStore)
  })

  it('does not persist an access token in the native session store', async () => {
    const nativeStore = new NativeSessionStore()
    await nativeStore.save({ refreshToken: 'refresh-only' })

    expect(await nativeStore.load()).toEqual({ refreshToken: 'refresh-only' })
    expect(JSON.stringify(await nativeStore.load())).not.toContain('accessToken')
  })
})
