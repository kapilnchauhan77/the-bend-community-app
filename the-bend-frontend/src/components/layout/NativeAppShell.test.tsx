import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NativeAppShell } from './NativeAppShell'
import { PlatformServicesProvider } from '@/platform/createPlatformServices'
import type { RuntimeConfig } from '@/platform/contracts'

vi.mock('@/deep-links/useDeepLinks', () => ({ useDeepLinks: () => undefined }))

describe('NativeAppShell', () => {
  afterEach(() => vi.restoreAllMocks())
  it('owns one native-app root and removes the visual viewport listener', () => {
    const add = vi.fn(); const remove = vi.fn()
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: { height: 700, offsetTop: 0, addEventListener: add, removeEventListener: remove } })
    const config: RuntimeConfig = { kind: 'web', isNative: false, apiBaseUrl: 'https://api.example.test', wsBaseUrl: 'wss://api.example.test', tenantSlug: 'westmoreland', appVersion: 'test', buildNumber: '1', environment: 'test' }
    const view = render(<PlatformServicesProvider config={config}><MemoryRouter><NativeAppShell /></MemoryRouter></PlatformServicesProvider>)
    expect(document.querySelectorAll('.native-app')).toHaveLength(1)
    view.unmount(); expect(remove).toHaveBeenCalledOnce()
  })
})
