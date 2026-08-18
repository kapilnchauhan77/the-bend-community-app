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
vi.mock('@/components/layout/NativeAppShell', () => ({ useNativeAppShell: () => ({ registerRootScroll: vi.fn(), scrollRootToTop: vi.fn() }) }))
vi.mock('@/stores/authStore', () => ({ useAuthStore: () => ({ isAuthenticated: false }) }))
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
})
