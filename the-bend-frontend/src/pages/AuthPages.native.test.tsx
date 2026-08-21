import { readFileSync } from 'node:fs'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import LoginPage from './LoginPage'
import RegisterPage from './RegisterPage'
import ForgotPasswordPage from './ForgotPasswordPage'
import ResetPasswordPage from './ResetPasswordPage'
import { NativePresentationProvider } from '@/components/layout/NativePresentationContext'

vi.mock('@/services/authApi', () => ({ authApi: { login: vi.fn(), register: vi.fn(), forgotPassword: vi.fn(), resetPassword: vi.fn() } }))
vi.mock('@/stores/authStore', () => ({ useAuthStore: () => ({ setAuth: vi.fn() }) }))
vi.mock('@/platform/createPlatformServices', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/platform/createPlatformServices')>()),
  usePlatformServices: () => ({ browser: { open: vi.fn(() => Promise.resolve()) } }),
}))

const nativeCss = readFileSync('src/styles/native.css', 'utf8')
const cssRule = (selector: string) => {
  return nativeCss.split('}').find((chunk) => chunk.includes(selector) && chunk.includes('{'))?.split('{').slice(1).join('{') ?? ''
}
const cssRules = (selector: string) => {
  return nativeCss.split('}').filter((chunk) => chunk.includes(selector) && chunk.includes('{')).map((chunk) => chunk.split('{').slice(1).join('{')).join(' ')
}

function renderNative(element: React.ReactElement, path: string) {
  if (!globalThis.ResizeObserver) globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as typeof ResizeObserver
  return render(<MemoryRouter initialEntries={[path]}><NativePresentationProvider>{element}</NativePresentationProvider></MemoryRouter>)
}

describe('native auth pages', () => {
  afterEach(cleanup)

  it.each([
    ['login', <LoginPage />, '/login', '/'],
    ['register', <RegisterPage />, '/register', '/login'],
    ['forgot password', <ForgotPasswordPage />, '/forgot-password', '/login'],
    ['reset password', <ResetPasswordPage />, '/reset-password?token=test', '/login'],
  ])('shows one native Back control on %s with fallback %s', (_name, page, path, fallback) => {
    renderNative(page, path)
    expect(fallback).toMatch(/^\//)
    expect(screen.getAllByRole('button', { name: 'Go back' })).toHaveLength(1)
  })

  it('does not render native Back on web auth routes', () => {
    render(<MemoryRouter initialEntries={['/login']}><LoginPage /></MemoryRouter>)
    expect(screen.queryByRole('button', { name: 'Go back' })).not.toBeInTheDocument()
  })

  it('scopes every native auth page and its password controls', () => {
    for (const [page, path] of [
      [<LoginPage />, '/login'],
      [<RegisterPage />, '/register'],
      [<ForgotPasswordPage />, '/forgot-password'],
      [<ResetPasswordPage />, '/reset-password?token=test'],
    ] as const) {
      cleanup()
      const { container } = renderNative(page, path)
      const authRoot = container.querySelector('.native-auth-page')
      expect(authRoot).toBeInTheDocument()
      expect(authRoot?.querySelector('.native-auth-surface') ?? (authRoot?.classList.contains('native-auth-surface') ? authRoot : null)).toBeInTheDocument()
      for (const input of authRoot?.querySelectorAll('input[type="password"]') ?? []) {
        expect(input.closest('.native-auth-page')).toBe(authRoot)
      }
    }
  })

  it('exposes stable native auth control classes', async () => {
    renderNative(<LoginPage />, '/login')
    expect(screen.getByText('Forgot password?')).toHaveClass('native-auth-inline-action')
    expect(screen.getByRole('button', { name: 'Show password' })).toHaveClass('native-auth-password-toggle')
    cleanup()
    renderNative(<RegisterPage />, '/register')
    fireEvent.click(screen.getByRole('button', { name: 'An individual' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await screen.findByRole('heading', { name: 'Your details' })
    fireEvent.change(screen.getByRole('textbox', { name: /Your Name/ }), { target: { value: 'Pat Neighbor' } })
    fireEvent.change(screen.getByRole('textbox', { name: /Email Address/ }), { target: { value: 'pat@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await screen.findByRole('heading', { name: 'Security and guidelines' })
    expect(screen.getByRole('link', { name: 'View' })).toHaveClass('native-auth-guideline-action')
    expect(screen.getByRole('link', { name: 'community guidelines' })).toHaveClass('native-auth-guideline-action')
    expect(screen.getByRole('checkbox')).toHaveClass('native-auth-consent-control')
    cleanup()
    renderNative(<ResetPasswordPage />, '/reset-password?token=test')
    const toggles = Array.from(document.querySelectorAll('.native-auth-password-toggle'))
    expect(toggles).toHaveLength(2)
    expect(toggles.every((button) => button instanceof HTMLButtonElement)).toBe(true)
  })

  it('marks shared auth actions for large-text wrapping across the flow', () => {
    renderNative(<LoginPage />, '/login')
    expect(screen.getByRole('button', { name: 'Log In' })).toHaveClass('native-auth-adaptive-action')
    expect(screen.getByRole('button', { name: 'Register as a Business or Individual' })).toHaveClass('native-auth-adaptive-action')

    cleanup()
    renderNative(<ForgotPasswordPage />, '/forgot-password')
    expect(screen.getByRole('button', { name: 'Send Reset Link' })).toHaveClass('native-auth-adaptive-action')

    cleanup()
    renderNative(<ResetPasswordPage />, '/reset-password?token=test')
    expect(screen.getByRole('button', { name: 'Reset Password' })).toHaveClass('native-auth-adaptive-action')

    cleanup()
    renderNative(<RegisterPage />, '/register')
    expect(screen.getByRole('button', { name: 'Next' })).toHaveClass('native-auth-adaptive-action')
  })

  it('allows the login field header and inline recovery action to wrap within the viewport', () => {
    renderNative(<LoginPage />, '/login')
    expect(screen.getByText('Forgot password?').parentElement).toHaveClass('native-auth-field-header')

    const headerRule = cssRule('.native-app .native-auth-field-header')
    expect(headerRule).toMatch(/flex-wrap:\s*wrap/)
    expect(headerRule).toMatch(/min-width:\s*0/)

    const inlineRule = cssRules('.native-app .native-auth-inline-action')
    expect(inlineRule).toMatch(/max-width:\s*100%/)
    expect(inlineRule).toMatch(/white-space:\s*normal/)
    expect(inlineRule).toMatch(/overflow-wrap:\s*anywhere/)
  })

  it('lets large auth action text grow vertically without losing its 44px target', () => {
    const rule = cssRule('.native-app .native-auth-adaptive-action')
    expect(rule).toMatch(/min-width:\s*0/)
    expect(rule).toMatch(/max-width:\s*100%/)
    expect(rule).toMatch(/min-height:\s*44px/)
    expect(rule).toMatch(/height:\s*auto/)
    expect(rule).toMatch(/white-space:\s*normal/)
    expect(rule).toMatch(/overflow-wrap:\s*anywhere/)
  })

  it('defines native auth touch geometry and focus outlines', () => {
    for (const selector of ['.native-auth-password-toggle', '.native-auth-inline-action', '.native-auth-guideline-action', '.native-auth-consent-control']) {
      const rule = cssRule(`.native-app ${selector}`)
      expect(rule).toMatch(/min-width:\s*44px/)
      expect(rule).toMatch(/min-height:\s*44px/)
      expect(nativeCss).toContain(`.native-app ${selector}:focus-visible`)
      expect(nativeCss).toContain('outline: 3px solid var(--native-focus)')
    }
    expect(cssRule(".native-app .native-auth-page input[type='password']")).toMatch(/padding-right:\s*52px/)
    expect(cssRule(".native-app .native-auth-page input[autocomplete='new-password']")).toMatch(/padding-right:\s*52px/)
    expect(cssRule(".native-app .native-auth-page input[autocomplete='current-password']")).toMatch(/padding-right:\s*52px/)
  })

  it('gives native auth pages the full available viewport without the obsolete nav height', () => {
    expect(cssRule('.native-app .native-auth-page')).toMatch(/min-height:\s*calc\(100dvh - var\(--native-safe-bottom\)\)/)
    expect(cssRule('.native-app .native-auth-page')).not.toMatch(/88px/)
  })

  it('keeps every registration step reachable through a native viewport scroller', () => {
    const { container } = renderNative(<RegisterPage />, '/register')
    expect(container.querySelector('.native-auth-page')).toHaveClass('native-registration-page')
    expect(container.querySelector('.native-auth-surface')).toHaveClass('native-registration-scroll')

    const pageRule = cssRule('.native-app .native-registration-page')
    expect(pageRule).toMatch(/height:\s*calc\(100dvh - var\(--native-safe-bottom\)\)/)
    expect(pageRule).toMatch(/min-height:\s*0/)
    expect(pageRule).toMatch(/overflow:\s*hidden/)

    const scrollRule = cssRule('.native-app .native-registration-scroll')
    expect(scrollRule).toMatch(/min-height:\s*0/)
    expect(scrollRule).toMatch(/overflow-y:\s*auto/)
    expect(scrollRule).toMatch(/-webkit-overflow-scrolling:\s*touch/)
  })

  it('does not add the registration scroll container to native login or web registration', () => {
    const nativeLogin = renderNative(<LoginPage />, '/login')
    expect(nativeLogin.container.querySelector('.native-registration-page')).not.toBeInTheDocument()
    expect(nativeLogin.container.querySelector('.native-registration-scroll')).not.toBeInTheDocument()

    cleanup()
    const webRegistration = render(<MemoryRouter initialEntries={['/register']}><RegisterPage /></MemoryRouter>)
    expect(webRegistration.container.querySelector('.native-registration-page')).not.toBeInTheDocument()
    expect(webRegistration.container.querySelector('.native-registration-scroll')).not.toBeInTheDocument()
    expect(webRegistration.container.querySelector('.native-auth-page')).toHaveClass('min-h-screen')
    expect(webRegistration.container.querySelector('.native-auth-surface')).toHaveClass('overflow-y-auto')
  })

  it('places native auth back controls and content below the status scrim', () => {
    expect(nativeCss).toMatch(/\.native-app \.native-auth-page\s*\{[^}]*--native-auth-safe-top:\s*var\(--native-safe-top\)/)
    expect(nativeCss).toMatch(/\.native-app \.native-auth-page\s*\{[^}]*padding-top:\s*var\(--native-auth-safe-top\)/)
    expect(nativeCss).toContain('.native-app .native-auth-page .native-route-back')
  })

  it('maps native auth surfaces and controls to adaptive dark tokens', () => {
    expect(cssRule('.dark .native-app .native-auth-surface')).toMatch(/background:\s*var\(--native-page\)/)
    expect(nativeCss).toMatch(/\.dark \.native-app \.native-auth-surface input[^{]*\{[^}]*background:\s*var\(--native-elevated\)/)
    expect(nativeCss).toMatch(/\.dark \.native-app \.native-auth-surface \[class\*="text-\[hsl\(30,15%,"\][^{]*\{[^}]*color:\s*var\(--native-text\)/)
    expect(nativeCss).toMatch(/\.dark \.native-app \.native-auth-surface \[class\*="text-\[hsl\(30,10%,"\][^{]*\{[^}]*color:\s*var\(--native-muted\)/)
    expect(cssRule('.native-auth-error')).toMatch(/background:\s*hsl\(0,\s*86%,\s*97%\)/)
    expect(cssRule('.dark .native-app .native-auth-error')).toMatch(/background:\s*var\(--native-urgent-surface\)/)
    expect(cssRule('.dark .native-app .native-auth-error')).toMatch(/color:\s*var\(--native-urgent-text\)/)
  })

  it('uses the semantic error surface for every auth error state', () => {
    renderNative(<ResetPasswordPage />, '/reset-password')
    expect(screen.getByRole('alert')).toHaveClass('native-auth-error')

    for (const file of ['LoginPage.tsx', 'RegisterPage.tsx', 'ForgotPasswordPage.tsx', 'ResetPasswordPage.tsx']) {
      const source = readFileSync(`src/pages/${file}`, 'utf8')
      expect(source).toContain('native-auth-error')
      expect(source).not.toContain("backgroundColor: 'hsl(0, 86%, 97%)'")
    }
  })
})
