import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LoginPage from './LoginPage'

const { login, setAuth } = vi.hoisted(() => ({ login: vi.fn(), setAuth: vi.fn(async () => undefined) }))
vi.mock('@/services/authApi', () => ({ authApi: { login } }))
vi.mock('@/stores/authStore', () => ({ useAuthStore: () => ({ setAuth }) }))

describe('LoginPage', () => {
  afterEach(() => document.body.innerHTML = '')
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: vi.fn(() => '/messages?thread=abc'), setItem: vi.fn(), removeItem: vi.fn() } })
  })

  it('retains a stored destination after failed login and clears it once after success', async () => {
    login.mockRejectedValueOnce(new Error('bad credentials')).mockResolvedValueOnce({ data: { access_token: 'a', refresh_token: 'r', user: { id: 'u', name: 'A', email: 'a', role: 'individual' }, shop: null } })
    render(<MemoryRouter initialEntries={['/login']}><LoginPage /></MemoryRouter>)
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@example.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Log In' }))
    await waitFor(() => expect(screen.getByText(/invalid email or password/i)).toBeInTheDocument())
    expect((globalThis.localStorage.getItem as ReturnType<typeof vi.fn>)).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Log In' }))
    await waitFor(() => expect(setAuth).toHaveBeenCalled())
    expect(globalThis.localStorage.removeItem).toHaveBeenCalledTimes(2)
  })

  it('falls back from malicious state to the validated stored destination', () => {
    render(<MemoryRouter initialEntries={[{ pathname: '/login', state: { from: { pathname: '/admin/users' } } }]}><LoginPage /></MemoryRouter>)
    expect(globalThis.localStorage.removeItem).not.toHaveBeenCalled()
  })

  it('marks the login surface so the native shell can remove phantom viewport overflow', () => {
    const { container } = render(<MemoryRouter initialEntries={['/login']}><LoginPage /></MemoryRouter>)
    expect(container.firstElementChild).toHaveClass('native-auth-page')
  })

  it('uses account-neutral login copy', () => {
    render(<MemoryRouter initialEntries={['/login']}><LoginPage /></MemoryRouter>)
    expect(screen.getByText('Sign in to your account')).toBeInTheDocument()
    expect(screen.queryByText('Sign in to your business account')).not.toBeInTheDocument()
  })

  it('clears a typed Create continuation exactly once after successful login', async () => {
    const getItem = vi.fn((key: string) => key === 'native_pending_post_path' ? '/create?type=offer' : 'offer-listing')
    const removeItem = vi.fn()
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem, setItem: vi.fn(), removeItem } })
    login.mockResolvedValueOnce({ data: { access_token: 'a', refresh_token: 'r', user: { id: 'u', name: 'A', email: 'a', role: 'individual' }, shop: null } })
    render(<MemoryRouter initialEntries={['/login']}><LoginPage /></MemoryRouter>)
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@example.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Log In' }))
    await waitFor(() => expect(setAuth).toHaveBeenCalled())
    expect(removeItem).toHaveBeenCalledTimes(2)
    expect(removeItem).toHaveBeenNthCalledWith(1, 'native_pending_post_path')
    expect(removeItem).toHaveBeenNthCalledWith(2, 'native_pending_create_action')
  })
})
