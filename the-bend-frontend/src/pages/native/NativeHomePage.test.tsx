import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NativeHomePage } from './NativeHomePage'

type SectionFixture = { status: string; data: unknown[]; source: string; cachedAt: string | null; retry: ReturnType<typeof vi.fn> }
const homeState: Record<string, SectionFixture> = { urgent: { status: 'success', data: [], source: 'network', cachedAt: null, retry: vi.fn() }, upcoming: { status: 'success', data: [], source: 'network', cachedAt: null, retry: vi.fn() }, opportunities: { status: 'success', data: [], source: 'network', cachedAt: null, retry: vi.fn() }, highlights: { status: 'success', data: [], source: 'network', cachedAt: null, retry: vi.fn() }, partners: { status: 'success', data: [], source: 'network', cachedAt: null, retry: vi.fn() } }
vi.mock('@/hooks/useNativeHome', () => ({ useNativeHome: () => homeState }))
const registerRootScroll = vi.fn()
vi.mock('@/components/layout/NativeAppShell', () => ({ useNativeAppShell: () => ({ registerRootScroll, scrollRootToTop: vi.fn() }) }))
const authState = { isAuthenticated: false }
vi.mock('@/stores/authStore', () => ({ useAuthStore: () => authState }))
const navigate = vi.fn()
vi.mock('react-router-dom', async () => { const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom'); return { ...actual, useNavigate: () => navigate } })
const { pendingIntent } = vi.hoisted(() => ({ pendingIntent: vi.fn() }))
vi.mock('@/auth/pendingDestination', () => ({ setPendingIntent: pendingIntent }))

describe('NativeHomePage', () => {
  afterEach(() => { cleanup(); navigate.mockClear(); pendingIntent.mockClear(); registerRootScroll.mockClear(); Object.values(homeState).forEach((section) => { section.status = 'success'; section.data = []; section.source = 'network'; section.cachedAt = null; section.retry = vi.fn() }) })
  it('renders the compact ordered dashboard and transfers search to Explore', () => {
    render(<MemoryRouter><NativeHomePage /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: /what’s happening nearby/i })).toBeInTheDocument()
    expect(screen.getByText(/needs, opportunities, events, and neighbors—all in one place/i)).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: /search westmoreland/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Offer' })).toBeInTheDocument()
    fireEvent.change(screen.getByRole('searchbox', { name: /search westmoreland/i }), { target: { value: 'generator' } })
    fireEvent.submit(screen.getByRole('search'))
    expect(navigate).toHaveBeenCalledWith('/explore?q=generator')
  })
  it('renders four icon quick actions in the approved order', () => {
    render(<MemoryRouter><NativeHomePage /></MemoryRouter>)
    const actions = screen.getByRole('navigation', { name: 'Quick actions' })
    expect(actions.querySelectorAll('button')).toHaveLength(4)
    expect(actions.querySelectorAll('svg')).toHaveLength(4)
    expect(actions).toHaveTextContent('OfferFindVolunteerEvents')
  })

  it('keeps the compact header and actions before urgent content', () => {
    render(<MemoryRouter><NativeHomePage /></MemoryRouter>)
    const nodes = [screen.getByLabelText('The Bend Community'), screen.getByRole('heading', { name: /what’s happening nearby/i }), screen.getByRole('searchbox'), screen.getByRole('button', { name: 'Offer' }), screen.getByRole('button', { name: 'Find' }), screen.getByRole('button', { name: 'Volunteer' }), screen.getByRole('button', { name: 'Events' }), screen.getByRole('heading', { name: /urgent needs/i })]
    nodes.slice(1).forEach((node, index) => expect(nodes[index]!.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy())
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

  it('renders populated sections in exact order with lazy media and all See all destinations', () => {
    const item = { id: 'u1', kind: 'listing', label: 'Urgent', title: 'Generator', supportingText: 'Need', thumbnailUrl: '/generator.jpg', targetPath: '/listing/u1', coordinates: null, urgent: true }
    homeState.urgent.data = [item]; homeState.upcoming.data = [{ ...item, id: 'e1', kind: 'event', title: 'Town hall', urgent: false }]; homeState.opportunities.data = [{ ...item, id: 'v1', kind: 'volunteer', title: 'Food drive', urgent: false }]
    const { container } = render(<MemoryRouter><NativeHomePage /></MemoryRouter>)
    const headings = [...container.querySelectorAll('h2')].map((node) => node.textContent?.replace(/\s*\(\d+\)/, ''))
    expect(headings).toEqual(['Urgent needs', 'Happening soon', 'Opportunities', 'Community highlights', 'Partners'])
    expect(screen.getAllByRole('img')[0]).toHaveAttribute('loading', 'lazy')
    const seeAll = screen.getAllByRole('button', { name: 'See all' }); fireEvent.click(seeAll[0]!); fireEvent.click(seeAll[1]!); fireEvent.click(seeAll[2]!)
    expect(navigate).toHaveBeenCalledWith('/explore?type=listings&urgency=urgent'); expect(navigate).toHaveBeenCalledWith('/explore?type=events'); expect(navigate).toHaveBeenCalledWith('/explore?type=volunteer')
  })

  it('renders section-local loading, empty, error retry, and cached freshness states', () => {
    homeState.urgent.status = 'loading'; homeState.upcoming.status = 'success'; homeState.upcoming.source = 'cache'; homeState.upcoming.cachedAt = '2026-01-01T00:00:00.000Z'; homeState.opportunities.status = 'error'; homeState.opportunities.retry = vi.fn(); homeState.highlights.status = 'empty'
    render(<MemoryRouter><NativeHomePage /></MemoryRouter>)
    expect(document.querySelectorAll('.native-skeleton').length).toBeGreaterThan(0); expect(screen.getByText(/no results/i)).toBeInTheDocument(); fireEvent.click(screen.getByRole('button', { name: /retry/i })); expect(homeState.opportunities.retry).toHaveBeenCalledOnce(); expect(screen.getAllByRole('status').some((node) => node.textContent?.includes('Showing saved content'))).toBe(true)
  })

  it('routes every quick action and stores the guest Offer continuation', () => {
    render(<MemoryRouter><NativeHomePage /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Offer' })); fireEvent.click(screen.getByRole('button', { name: 'Find' })); fireEvent.click(screen.getByRole('button', { name: 'Volunteer' })); fireEvent.click(screen.getByRole('button', { name: 'Events' }))
    expect(pendingIntent).toHaveBeenCalledWith({ destination: '/create?type=offer', action: 'offer-listing' }); expect(navigate).toHaveBeenCalledWith('/login'); expect(navigate).toHaveBeenCalledWith('/explore?type=listings'); expect(navigate).toHaveBeenCalledWith('/explore?type=volunteer'); expect(navigate).toHaveBeenCalledWith('/explore?type=events')
  })
})
