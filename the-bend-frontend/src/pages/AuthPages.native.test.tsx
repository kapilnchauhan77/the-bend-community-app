import { readFileSync } from 'node:fs'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import LoginPage from './LoginPage'
import RegisterPage from './RegisterPage'
import ForgotPasswordPage from './ForgotPasswordPage'
import ResetPasswordPage from './ResetPasswordPage'
import { NativePresentationProvider } from '@/components/layout/NativePresentationContext'

vi.mock('@/services/authApi', () => ({ authApi: { login: vi.fn(), register: vi.fn(), forgotPassword: vi.fn(), resetPassword: vi.fn() } }))
vi.mock('@/stores/authStore', () => ({ useAuthStore: () => ({ setAuth: vi.fn() }) }))

const nativeCss = readFileSync('src/styles/native.css', 'utf8')
const cssRule = (selector: string) => {
  return nativeCss.split('}').find((chunk) => chunk.includes(selector) && chunk.includes('{'))?.split('{').slice(1).join('{') ?? ''
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

  it('exposes stable native auth control classes', () => {
    renderNative(<LoginPage />, '/login')
    expect(screen.getByText('Forgot password?')).toHaveClass('native-auth-inline-action')
    expect(screen.getByRole('button', { name: 'Show password' })).toHaveClass('native-auth-password-toggle')
    cleanup()
    renderNative(<RegisterPage />, '/register')
    expect(screen.getByRole('link', { name: 'View' })).toHaveClass('native-auth-guideline-action')
    expect(screen.getByRole('link', { name: 'community guidelines' })).toHaveClass('native-auth-guideline-action')
    expect(screen.getByRole('checkbox')).toHaveClass('native-auth-consent-control')
    cleanup()
    renderNative(<ResetPasswordPage />, '/reset-password?token=test')
    const toggles = Array.from(document.querySelectorAll('.native-auth-password-toggle'))
    expect(toggles).toHaveLength(2)
    expect(toggles.every((button) => button instanceof HTMLButtonElement)).toBe(true)
  })

  it('defines native auth touch geometry and focus outlines', () => {
    for (const selector of ['.native-auth-password-toggle', '.native-auth-inline-action', '.native-auth-guideline-action', '.native-auth-consent-control']) {
      const rule = cssRule(`.native-app ${selector}`)
      expect(rule).toMatch(/min-width:\s*44px/)
      expect(rule).toMatch(/min-height:\s*44px/)
      expect(nativeCss).toContain(`.native-app ${selector}:focus-visible`)
      expect(nativeCss).toContain('outline: 3px solid var(--native-focus)')
    }
  })
})
