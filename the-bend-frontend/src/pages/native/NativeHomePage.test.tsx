import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NativeHomePage } from './NativeHomePage'

vi.mock('@/hooks/useNativeHome', () => ({ useNativeHome: () => ({
  urgent: { status: 'success', data: [], source: 'network', cachedAt: null, error: null, retry: vi.fn() },
  upcoming: { status: 'success', data: [], source: 'network', cachedAt: null, error: null, retry: vi.fn() },
  opportunities: { status: 'success', data: [], source: 'network', cachedAt: null, error: null, retry: vi.fn() },
  highlights: { status: 'success', data: [], source: 'network', cachedAt: null, error: null, retry: vi.fn() },
  partners: { status: 'success', data: [], source: 'network', cachedAt: null, error: null, retry: vi.fn() },
}) }))
const registerRootScroll = vi.fn()
vi.mock('@/components/layout/NativeAppShell', () => ({ useNativeAppShell: () => ({ registerRootScroll, scrollRootToTop: vi.fn() }) }))
const authState = { isAuthenticated: false }
vi.mock('@/stores/authStore', () => ({ useAuthStore: () => authState }))
const navigate = vi.fn()
vi.mock('react-router-dom', async () => { const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom'); return { ...actual, useNavigate: () => navigate } })

describe('NativeHomePage', () => {
  afterEach(() => { cleanup(); navigate.mockClear() })
  it('renders the compact ordered dashboard and transfers search to Explore', () => {
    render(<MemoryRouter><NativeHomePage /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: /around westmoreland/i })).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: /search westmoreland/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Offer' })).toBeInTheDocument()
    fireEvent.change(screen.getByRole('searchbox', { name: /search westmoreland/i }), { target: { value: 'generator' } })
    fireEvent.submit(screen.getByRole('search'))
    expect(navigate).toHaveBeenCalledWith('/explore?q=generator')
  })

  it('registers the Home root scroll and includes the partner destination', () => {
    render(<MemoryRouter><NativeHomePage /></MemoryRouter>)
    expect(screen.getByRole('link', { name: /partner with us/i })).toHaveAttribute('data-path', '/advertise')
  })

  it('shows guest account entry and signed-in notification/account entries', () => {
    const { rerender } = render(<MemoryRouter><NativeHomePage /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: /account/i }))
    expect(navigate).toHaveBeenCalledWith('/login')
    authState.isAuthenticated = true
    rerender(<MemoryRouter><NativeHomePage /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: /notifications/i }))
    fireEvent.click(screen.getByRole('button', { name: /account/i }))
    expect(navigate).toHaveBeenCalledWith('/notifications')
    expect(navigate).toHaveBeenCalledWith('/you')
    authState.isAuthenticated = false
  })

  it('registers and unregisters the Home scroll root', () => {
    const { unmount } = render(<MemoryRouter><NativeHomePage /></MemoryRouter>)
    expect(registerRootScroll).toHaveBeenCalledWith('home', expect.any(HTMLDivElement))
    unmount()
    expect(registerRootScroll).toHaveBeenLastCalledWith('home', null)
    registerRootScroll.mockClear()
  })

  it('renders lazy discovery media and one h1 without a decorative hero', () => {
    expect(() => render(<MemoryRouter><NativeHomePage /></MemoryRouter>)).not.toThrow()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(document.querySelector('[data-decorative-hero]')).toBeNull()
  })
})
