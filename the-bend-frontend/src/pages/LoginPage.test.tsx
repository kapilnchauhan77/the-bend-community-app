import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LoginPage from './LoginPage'

const { login, setAuth } = vi.hoisted(() => ({ login: vi.fn(), setAuth: vi.fn(async () => undefined) }))
vi.mock('@/services/authApi', () => ({ authApi: { login } }))
vi.mock('@/stores/authStore', () => ({ useAuthStore: () => ({ setAuth }) }))

describe('LoginPage pending destination handling', () => {
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
    expect(globalThis.localStorage.removeItem).toHaveBeenCalledTimes(1)
  })

  it('falls back from malicious state to the validated stored destination', () => {
    render(<MemoryRouter initialEntries={[{ pathname: '/login', state: { from: { pathname: '/admin/users' } } }]}><LoginPage /></MemoryRouter>)
    expect(globalThis.localStorage.removeItem).not.toHaveBeenCalled()
  })
})
