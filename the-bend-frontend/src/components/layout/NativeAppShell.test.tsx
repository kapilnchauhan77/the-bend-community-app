import { render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NativeAppShell, useNativeAppShell } from './NativeAppShell'
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

  it('scrolls registered roots with motion preference and unregisters them', () => {
    const scrollTo = vi.fn()
    const root = document.createElement('div'); root.scrollTo = scrollTo
    const exposeShell = vi.fn()
    function Probe() { exposeShell(useNativeAppShell()); return null }
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: vi.fn(() => ({ matches: false } as MediaQueryList)) })
    const matchMedia = vi.mocked(window.matchMedia)
    const view = render(<PlatformServicesProvider config={{ kind: 'web', isNative: false, apiBaseUrl: '', wsBaseUrl: '', tenantSlug: '', appVersion: '', buildNumber: '', environment: 'test' }}><MemoryRouter><Routes><Route element={<NativeAppShell />}><Route path="/" element={<Probe />} /></Route></Routes></MemoryRouter></PlatformServicesProvider>)
    const shell = exposeShell.mock.calls[0][0] as ReturnType<typeof useNativeAppShell>
    shell.registerRootScroll('explore', root); shell.scrollRootToTop('explore')
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })
    matchMedia.mockReturnValue({ matches: true } as MediaQueryList)
    shell.scrollRootToTop('explore')
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: 'auto' })
    shell.registerRootScroll('explore', null); shell.scrollRootToTop('explore')
    expect(scrollTo).toHaveBeenCalledTimes(2)
    view.unmount()
  })
})
