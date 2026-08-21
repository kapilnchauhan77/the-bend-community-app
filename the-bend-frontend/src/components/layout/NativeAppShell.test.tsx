import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useNavigate } from 'react-router-dom'
import { NativeAppShell, useNativeAppShell } from './NativeAppShell'
import { PlatformServicesProvider } from '@/platform/createPlatformServices'
import type { RuntimeConfig } from '@/platform/contracts'
import { useDarkMode } from '@/hooks/useDarkMode'

vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => 'ios' } }))
vi.mock('@capacitor/status-bar', () => ({ StatusBar: { setStyle: vi.fn().mockResolvedValue(undefined), setBackgroundColor: vi.fn().mockResolvedValue(undefined) }, Style: { Dark: 'DARK', Light: 'LIGHT' } }))
import { StatusBar, Style } from '@capacitor/status-bar'

vi.mock('@/deep-links/useDeepLinks', () => ({ useDeepLinks: () => undefined }))

const config: RuntimeConfig = { kind: 'web', isNative: false, apiBaseUrl: '', wsBaseUrl: '', tenantSlug: '', appVersion: '', buildNumber: '', environment: 'test' }
function renderShell() { return render(<PlatformServicesProvider config={config}><MemoryRouter><NativeAppShell /></MemoryRouter></PlatformServicesProvider>) }

describe('NativeAppShell', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    delete (document as Document & { scrollingElement?: Element }).scrollingElement
  })
  it('owns one native-app root and removes the visual viewport listener', () => {
    let resizeHandler: (() => void) | undefined
    const add = vi.fn((_type: string, handler: () => void) => { resizeHandler = handler }); const remove = vi.fn()
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 })
    const viewport = { height: 700, offsetTop: 0, addEventListener: add, removeEventListener: remove }
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport })
    const config: RuntimeConfig = { kind: 'web', isNative: false, apiBaseUrl: 'https://api.example.test', wsBaseUrl: 'wss://api.example.test', tenantSlug: 'westmoreland', appVersion: 'test', buildNumber: '1', environment: 'test' }
    const view = render(<PlatformServicesProvider config={config}><MemoryRouter><NativeAppShell /></MemoryRouter></PlatformServicesProvider>)
    expect(document.querySelectorAll('.native-app')).toHaveLength(1)
    expect(document.querySelector('.native-status-bar-scrim')).toHaveAttribute('aria-hidden', 'true')
    const root = document.querySelector<HTMLElement>('.native-app')!
    expect(root.style.getPropertyValue('--native-keyboard-bottom')).toBe('100px')
    viewport.height = 620; viewport.offsetTop = 20; resizeHandler?.()
    expect(root.style.getPropertyValue('--native-keyboard-bottom')).toBe('160px')
    view.unmount(); expect(remove).toHaveBeenCalledWith('resize', resizeHandler); expect(root.style.getPropertyValue('--native-keyboard-bottom')).toBe('')
  })

  it('scrolls the document root when a registered page wrapper is not scrollable or is absent', () => {
    const pageScrollTo = vi.fn()
    const pageRoot = document.createElement('div'); pageRoot.scrollTo = pageScrollTo
    const documentScrollTo = vi.fn()
    const documentRoot = document.createElement('div'); documentRoot.scrollTo = documentScrollTo
    Object.defineProperty(document, 'scrollingElement', { configurable: true, value: documentRoot })
    const exposeShell = vi.fn()
    function Probe() { exposeShell(useNativeAppShell()); return null }
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: vi.fn(() => ({ matches: false } as MediaQueryList)) })
    const matchMedia = vi.mocked(window.matchMedia)
    const view = render(<PlatformServicesProvider config={{ kind: 'web', isNative: false, apiBaseUrl: '', wsBaseUrl: '', tenantSlug: '', appVersion: '', buildNumber: '', environment: 'test' }}><MemoryRouter><Routes><Route element={<NativeAppShell />}><Route path="/" element={<Probe />} /></Route></Routes></MemoryRouter></PlatformServicesProvider>)
    const shell = exposeShell.mock.calls[0][0] as ReturnType<typeof useNativeAppShell>
    shell.registerRootScroll('home', pageRoot); shell.scrollRootToTop('home')
    expect(documentScrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })
    expect(pageScrollTo).not.toHaveBeenCalled()
    matchMedia.mockReturnValue({ matches: true } as MediaQueryList)
    shell.registerRootScroll('explore', null)
    shell.scrollRootToTop('explore')
    expect(documentScrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: 'auto' })
    expect(documentScrollTo).toHaveBeenCalledTimes(2)
    view.unmount()
  })

  it.each([['dark', true], ['light', false]] as const)('localStorage %s theme wins', (theme, dark) => {
    Object.defineProperty(window, 'localStorage', { configurable: true, value: { getItem: () => theme } })
    const matchMedia = vi.fn(); Object.defineProperty(window, 'matchMedia', { configurable: true, value: matchMedia })
    document.documentElement.classList.remove('dark')
    const view = renderShell()
    expect(document.documentElement.classList.contains('dark')).toBe(dark)
    expect(matchMedia).not.toHaveBeenCalled()
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

  it('syncs native status-bar style and page backgrounds with theme, then restores inline styles', () => {
    Object.defineProperty(window, 'localStorage', { configurable: true, value: { getItem: () => 'dark' } })
    document.documentElement.style.backgroundColor = 'rgb(1, 2, 3)'
    document.body.style.backgroundColor = 'rgb(4, 5, 6)'
    const view = renderShell()
    expect(vi.mocked(StatusBar.setStyle)).toHaveBeenCalledWith({ style: Style.Dark })
    expect(vi.mocked(StatusBar.setBackgroundColor)).toHaveBeenCalledWith({ color: '#121915' })
    expect(document.documentElement.style.backgroundColor).toBe('rgb(18, 25, 21)')
    expect(document.body.style.backgroundColor).toBe('rgb(18, 25, 21)')
    view.unmount()
    expect(document.documentElement.style.backgroundColor).toBe('rgb(1, 2, 3)')
    expect(document.body.style.backgroundColor).toBe('rgb(4, 5, 6)')
  })

  it('uses light native chrome for a stored light theme', () => {
    Object.defineProperty(window, 'localStorage', { configurable: true, value: { getItem: () => 'light' } })
    const view = renderShell()
    expect(vi.mocked(StatusBar.setStyle)).toHaveBeenCalledWith({ style: Style.Light })
    expect(vi.mocked(StatusBar.setBackgroundColor)).toHaveBeenCalledWith({ color: '#f7f3ea' })
    expect(document.documentElement.style.backgroundColor).toBe('rgb(247, 243, 234)')
    view.unmount()
  })

  it('updates native chrome when the system theme changes', () => {
    Object.defineProperty(window, 'localStorage', { configurable: true, value: { getItem: () => null } })
    let change: (() => void) | undefined
    const media = { matches: true, addEventListener: vi.fn((_type: string, listener: () => void) => { change = listener }), removeEventListener: vi.fn() }
    vi.spyOn(window, 'matchMedia').mockReturnValue(media as unknown as MediaQueryList)
    const view = renderShell()
    media.matches = false; change?.()
    expect(vi.mocked(StatusBar.setStyle)).toHaveBeenCalledWith({ style: Style.Light })
    expect(document.body.style.backgroundColor).toBe('rgb(247, 243, 234)')
    view.unmount()
  })

  it('updates native chrome immediately when the in-app theme control changes', async () => {
    let storedTheme = 'light'
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: () => storedTheme,
        setItem: (_key: string, value: string) => { storedTheme = value },
      },
    })
    function ThemeControl() {
      const { toggle } = useDarkMode()
      return <button type="button" onClick={toggle}>change theme</button>
    }
    const view = render(<PlatformServicesProvider config={config}><MemoryRouter><Routes><Route element={<NativeAppShell />}><Route path="/" element={<ThemeControl />} /></Route></Routes></MemoryRouter></PlatformServicesProvider>)
    vi.mocked(StatusBar.setStyle).mockClear()
    vi.mocked(StatusBar.setBackgroundColor).mockClear()

    fireEvent.click(screen.getByRole('button', { name: 'change theme' }))

    await waitFor(() => expect(StatusBar.setStyle).toHaveBeenCalledWith({ style: Style.Dark }))
    expect(StatusBar.setBackgroundColor).toHaveBeenCalledWith({ color: '#121915' })
    expect(document.body.style.backgroundColor).toBe('rgb(18, 25, 21)')
    view.unmount()
  })

  it('tracks inverse Android root text scale on the native root and cleans up', () => {
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({ fontSize: '32px' } as CSSStyleDeclaration)
    let resize: (() => void) | undefined
    const add = vi.spyOn(window, 'addEventListener').mockImplementation((type, listener) => { if (type === 'resize') resize = listener as () => void })
    const remove = vi.spyOn(window, 'removeEventListener').mockImplementation(() => undefined)
    const view = renderShell()
    const root = document.querySelector<HTMLElement>('.native-app')!
    expect(root.style.getPropertyValue('--native-fixed-text-scale')).toBe('0.5')
    vi.mocked(window.getComputedStyle).mockReturnValue({ fontSize: '16px' } as CSSStyleDeclaration)
    resize?.()
    expect(root.style.getPropertyValue('--native-fixed-text-scale')).toBe('1')
    view.unmount()
    expect(remove).toHaveBeenCalledWith('resize', expect.any(Function))
    expect(root.style.getPropertyValue('--native-fixed-text-scale')).toBe('')
    expect(add).toHaveBeenCalled()
  })

  it('hides bottom navigation on every auth route and restores nav padding on normal routes', () => {
    function Probe() { const navigate = useNavigate(); return <><button onClick={() => navigate('/register')}>register</button><button onClick={() => navigate('/forgot-password')}>forgot</button><button onClick={() => navigate('/reset-password')}>reset</button><button onClick={() => navigate('/')}>root</button></> }
    const view = render(<PlatformServicesProvider config={config}><MemoryRouter initialEntries={['/bender/one']}><Routes><Route element={<NativeAppShell />}><Route path="*" element={<Probe />} /></Route></Routes></MemoryRouter></PlatformServicesProvider>)
    const main = document.querySelector('.native-main')!
    expect(main).toHaveAttribute('data-bottom-navigation', 'hidden')
    expect(main).toHaveClass('native-main')
    fireEvent.click(screen.getByRole('button', { name: 'register' }))
    expect(main).toHaveAttribute('data-bottom-navigation', 'hidden')
    fireEvent.click(screen.getByRole('button', { name: 'forgot' }))
    expect(main).toHaveAttribute('data-bottom-navigation', 'hidden')
    fireEvent.click(screen.getByRole('button', { name: 'reset' }))
    expect(main).toHaveAttribute('data-bottom-navigation', 'hidden')
    fireEvent.click(screen.getByRole('button', { name: 'root' }))
    expect(main).toHaveAttribute('data-bottom-navigation', 'visible')
    view.unmount()
  })
})
