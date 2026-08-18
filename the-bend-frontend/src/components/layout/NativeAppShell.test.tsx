import { render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NativeAppShell, useNativeAppShell } from './NativeAppShell'
import { PlatformServicesProvider } from '@/platform/createPlatformServices'
import type { RuntimeConfig } from '@/platform/contracts'

vi.mock('@/deep-links/useDeepLinks', () => ({ useDeepLinks: () => undefined }))

const config: RuntimeConfig = { kind: 'web', isNative: false, apiBaseUrl: '', wsBaseUrl: '', tenantSlug: '', appVersion: '', buildNumber: '', environment: 'test' }
function renderShell() { return render(<PlatformServicesProvider config={config}><MemoryRouter><NativeAppShell /></MemoryRouter></PlatformServicesProvider>) }

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

  it.each([['dark', true], ['light', false]] as const)('localStorage %s theme wins', (theme, dark) => {
    Object.defineProperty(window, 'localStorage', { configurable: true, value: { getItem: () => theme } })
    document.documentElement.classList.remove('dark')
    const view = renderShell()
    expect(document.documentElement.classList.contains('dark')).toBe(dark)
    view.unmount()
  })

  it('uses and cleans the color-scheme media listener when no local theme exists', () => {
    Object.defineProperty(window, 'localStorage', { configurable: true, value: { getItem: () => null } })
    let change: (() => void) | undefined
    const media = { matches: true, addEventListener: vi.fn((_type, listener) => { change = listener }), removeEventListener: vi.fn() }
    vi.spyOn(window, 'matchMedia').mockReturnValue(media as unknown as MediaQueryList)
    const view = renderShell()
    expect(document.documentElement).toHaveClass('dark')
    media.matches = false; change?.(); expect(document.documentElement).not.toHaveClass('dark')
    view.unmount(); expect(media.removeEventListener).toHaveBeenCalledOnce()
  })

  it('restores the pre-shell dark class and keyboard inset on unmount', () => {
    Object.defineProperty(window, 'localStorage', { configurable: true, value: { getItem: () => null } })
    document.documentElement.classList.add('dark')
    const root = document.createElement('div')
    const add = vi.fn(); const remove = vi.fn()
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: { height: 700, offsetTop: 0, addEventListener: add, removeEventListener: remove } })
    const view = renderShell()
    view.unmount(); expect(document.documentElement).toHaveClass('dark'); expect(remove).toHaveBeenCalledOnce()
    void root
  })
})
