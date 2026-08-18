import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
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
import { UnsupportedPlatformOperation } from './unsupportedPlatformOperation'
import { PlatformServicesProvider, usePlatformServices } from './createPlatformServices'

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
    const services = createPlatformServices(config('ios'))
    expect(services.sessionStore).toBeInstanceOf(NativeSessionStore)
    expect(services.haptics).toBeDefined()
  })

  it('selects native services for Android', () => {
    expect(createPlatformServices(config('android')).sessionStore).toBeInstanceOf(NativeSessionStore)
  })

  it('selects web services for the browser', () => {
    const services = createPlatformServices(config('web'))
    expect(services.sessionStore).toBeInstanceOf(WebSessionStore)
    expect(services.haptics).toBeDefined()
  })

  it('does not persist an access token in the native session store', async () => {
    const nativeStore = new NativeSessionStore()
    await nativeStore.save({ refreshToken: 'refresh-only' })

    expect(await nativeStore.load()).toEqual({ refreshToken: 'refresh-only' })
    expect(JSON.stringify(await nativeStore.load())).not.toContain('accessToken')
  })

  it('selects from the runtime kind even when isNative is inconsistent', () => {
    expect(createPlatformServices({ ...config('ios'), isNative: false }).sessionStore).toBeInstanceOf(NativeSessionStore)
    expect(createPlatformServices({ ...config('web'), isNative: true }).sessionStore).toBeInstanceOf(WebSessionStore)
  })

  it('rejects unsupported async native operations lazily', async () => {
    const services = createPlatformServices(config('ios'))
    await expect(services.browser.open('https://example.test')).rejects.toBeInstanceOf(UnsupportedPlatformOperation)
  })

  it('throws unsupported synchronous native operations only when called', () => {
    const services = createPlatformServices(config('ios'))
    expect(() => services.deepLinks.parse('https://example.test')).toThrow(UnsupportedPlatformOperation)
    expect(() => services.analytics.capture('event')).toThrow(UnsupportedPlatformOperation)
  })

  it('provides platform services through the provider and hook', () => {
    const wrapper = ({ children }: { children: ReactNode }) => createElement(PlatformServicesProvider, { config: config('web') }, children)
    const { result } = renderHook(() => usePlatformServices(), { wrapper })
    expect(result.current.sessionStore).toBeInstanceOf(WebSessionStore)
  })
})
