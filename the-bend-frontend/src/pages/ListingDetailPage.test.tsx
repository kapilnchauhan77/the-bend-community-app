import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ListingDetail } from '@/types'
import ListingDetailPage from './ListingDetailPage'

const runOnline = vi.fn(async () => { throw new Error('OFFLINE_ACTION_UNAVAILABLE') })
const cachedRefresh = vi.fn(() => Promise.resolve())
const listForUser = vi.hoisted(() => vi.fn(() => Promise.resolve({ data: [] })))
const nativePresentation = vi.hoisted(() => ({ value: false }))
const authState = vi.hoisted(() => ({
  isAuthenticated: true,
  shop: null as { id: string } | null,
  user: { id: 'viewer', role: 'individual' },
}))
let cachedState: {
  data: ListingDetail | null
  source: 'cache' | 'network' | null
  cachedAt: string | null
  status: 'loading' | 'success' | 'empty' | 'error'
  error: Error | null
  refresh: typeof cachedRefresh
}

vi.mock('@/hooks/useOnlineMutation', () => ({ useOnlineMutation: () => ({ online: false, ready: true, run: runOnline }) }))
vi.mock('@/hooks/useCachedPublicContent', () => ({ useCachedPublicContent: () => cachedState }))
vi.mock('@/stores/authStore', () => ({ useAuthStore: () => authState }))
vi.mock('@/components/layout/NativePresentationContext', () => ({ useNativePresentation: () => nativePresentation.value }))
vi.mock('@/components/layout/PageLayout', () => ({ PageLayout: ({ children, embeddedClassName }: { children: React.ReactNode; embeddedClassName?: string }) => <div className={embeddedClassName}>{children}</div> }))
vi.mock('@/components/features/messages/ShareToMessageButton', () => ({ ShareToMessageButton: () => null }))
vi.mock('@/components/shared/ShareButton', () => ({ ShareButton: () => null }))
vi.mock('@/services/discountCodeApi', () => ({ discountCodeApi: { listForUser, markUsed: vi.fn() } }))

const listing: ListingDetail = {
  id: 'l1', title: 'Oak desk', description: 'A sturdy oak desk', type: 'offer', category: 'equipment', urgency: 'normal',
  is_free: true, status: 'active', interest_count: 0, views_count: 1, images: [], created_at: '2026-08-18T00:00:00Z',
  viewer_has_interest: false, viewer_has_saved: false, posted_by: null,
  shop: { id: 's1', name: 'Workshop', business_type: 'maker', contact_phone: '123' },
}

const listingWithImages = (id: string, title: string, urls: string[]): ListingDetail => ({
  ...listing,
  id,
  title,
  images: urls.map((url) => ({ url, thumbnail_url: null })),
})

beforeEach(() => {
  cachedRefresh.mockClear()
  listForUser.mockReset()
  listForUser.mockResolvedValue({ data: [] })
  nativePresentation.value = false
  authState.shop = null
  cachedState = {
    data: listing,
    source: 'cache',
    cachedAt: '2026-08-18T00:00:00Z',
    status: 'success',
    error: null,
    refresh: cachedRefresh,
  }
})
afterEach(cleanup)

describe('ListingDetailPage offline actions', () => {
  it('exposes the adaptive native detail surface', async () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/listings/l1']}>
        <Routes><Route path="/listings/:id" element={<ListingDetailPage />} /></Routes>
      </MemoryRouter>,
    )
    await screen.findByRole('heading', { name: 'Oak desk' })
    expect(container.querySelector('.native-themed-page.native-listing-detail-page')).toBeInTheDocument()
  })

  it('marks owner confirmation portals for native dark theming', async () => {
    nativePresentation.value = true
    authState.shop = { id: 's1' }
    render(
      <MemoryRouter initialEntries={['/listings/l1']}>
        <Routes><Route path="/listings/:id" element={<ListingDetailPage />} /></Routes>
      </MemoryRouter>,
    )
    await screen.findByRole('heading', { name: 'Oak desk' })
    fireEvent.click(screen.getByRole('button', { name: 'Mark as Fulfilled' }))
    expect(await screen.findByRole('alertdialog')).toHaveClass('native-themed-dialog')
  })

  it('replaces a cold-cache fetch failure with a truthful retry state', () => {
    cachedState = { ...cachedState, data: null, source: null, cachedAt: null, status: 'error', error: new Error('network down') }
    render(
      <MemoryRouter initialEntries={['/listings/l1']}>
        <Routes><Route path="/listings/:id" element={<ListingDetailPage />} /></Routes>
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: 'Unable to load listing' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Listing not found' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry listing' }))
    expect(cachedRefresh).toHaveBeenCalledTimes(1)
  })

  it('keeps usable cached content visible during a refresh failure', async () => {
    cachedState = { ...cachedState, status: 'error', error: new Error('refresh failed') }
    render(
      <MemoryRouter initialEntries={['/listings/l1']}>
        <Routes><Route path="/listings/:id" element={<ListingDetailPage />} /></Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: 'Oak desk' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retry listing' })).not.toBeInTheDocument()
  })

  it('visibly surfaces the exact offline error for business messaging', async () => {
    render(
      <MemoryRouter initialEntries={['/listings/l1']}>
        <Routes><Route path="/listings/:id" element={<ListingDetailPage />} /></Routes>
      </MemoryRouter>,
    )
    await waitFor(() => expect(screen.getByRole('button', { name: 'Message Business' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Message Business' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('OFFLINE_ACTION_UNAVAILABLE'))
    expect(screen.getByText('Oak desk')).toBeInTheDocument()
  })

  it('clears the previous listing before a same-route id transition can reuse its carousel index', async () => {
    const first = listingWithImages('l1', 'Listing A', ['/a-1.jpg', '/a-2.jpg', '/a-3.jpg'])
    const second = listingWithImages('l2', 'Listing B', ['/b-1.jpg'])
    cachedState = { ...cachedState, data: first }
    function SwitchListing() {
      const navigate = useNavigate()
      return <button type="button" onClick={() => navigate('/listings/l2')}>Open B</button>
    }
    const view = render(
      <MemoryRouter initialEntries={['/listings/l1']}>
        <SwitchListing />
        <Routes><Route path="/listings/:id" element={<ListingDetailPage />} /></Routes>
      </MemoryRouter>,
    )
    await screen.findByRole('heading', { name: 'Listing A' })
    fireEvent.click(screen.getByRole('button', { name: /next image/i }))
    fireEvent.click(screen.getByRole('button', { name: /next image/i }))
    cachedState = { ...cachedState, data: first }
    fireEvent.click(screen.getByRole('button', { name: 'Open B' }))
    expect(screen.queryByRole('heading', { name: 'Listing A' })).not.toBeInTheDocument()
    cachedState = { ...cachedState, data: second }
    view.rerender(
      <MemoryRouter initialEntries={['/listings/l2']}>
        <SwitchListing />
        <Routes><Route path="/listings/:id" element={<ListingDetailPage />} /></Routes>
      </MemoryRouter>,
    )
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Listing B' })).toBeInTheDocument())
    expect(screen.getByRole('img', { name: 'Listing B' })).toHaveAttribute('src', '/b-1.jpg')
    expect(screen.queryByRole('button', { name: /next image/i })).not.toBeInTheDocument()
  })

  it('names image pagination targets while keeping the visual dots compact', async () => {
    cachedState = { ...cachedState, data: listingWithImages('l1', 'Listing A', ['/a-1.jpg', '/a-2.jpg', '/a-3.jpg']) }
    render(
      <MemoryRouter initialEntries={['/listings/l1']}>
        <Routes><Route path="/listings/:id" element={<ListingDetailPage />} /></Routes>
      </MemoryRouter>,
    )

    await screen.findByRole('heading', { name: 'Listing A' })
    const dots = [1, 2, 3].map((index) => screen.getByRole('button', { name: `Show image ${index} of 3` }))
    expect(dots[0]).toHaveAttribute('aria-current', 'true')
    expect(dots[1]).not.toHaveAttribute('aria-current')
    for (const dot of dots) {
      expect(dot).toHaveClass('native-listing-image-dot-control')
      expect(dot.querySelector('.native-listing-image-dot')).toBeInTheDocument()
    }
    fireEvent.click(dots[1])
    expect(dots[1]).toHaveAttribute('aria-current', 'true')
  })

  it('ignores discount codes that resolve after the listing id changes', async () => {
    let resolveFirst!: (value: { data: Array<Record<string, unknown>> }) => void
    const first = {
      ...listing,
      id: 'l1',
      title: 'Listing A',
      shop: null,
      posted_by: { id: 'user-a', name: 'Alice', avatar_url: null },
    }
    const second = {
      ...listing,
      id: 'l2',
      title: 'Listing B',
      shop: null,
      posted_by: { id: 'user-b', name: 'Blake', avatar_url: null },
    }
    const code = (id: string, value: string) => ({
      id,
      code: value,
      name: value,
      discount_type: 'percentage' as const,
      discount_value: 10,
      usage_count: 0,
      is_active: true,
      created_at: '2026-08-18T00:00:00Z',
    })
    listForUser.mockImplementation((userId: string) => {
      if (userId === 'user-a') return new Promise((resolve) => { resolveFirst = resolve }) as never
      return Promise.resolve({ data: [code('b-code', 'BONLY')] }) as never
    })
    cachedState = { ...cachedState, data: first }
    function SwitchListing() {
      const navigate = useNavigate()
      return <button type="button" onClick={() => navigate('/listings/l2')}>Open B</button>
    }
    render(
      <MemoryRouter initialEntries={['/listings/l1']}>
        <SwitchListing />
        <Routes><Route path="/listings/:id" element={<ListingDetailPage />} /></Routes>
      </MemoryRouter>,
    )
    await screen.findByRole('heading', { name: 'Listing A' })
    await waitFor(() => expect(listForUser).toHaveBeenCalledWith('user-a'))

    cachedState = { ...cachedState, data: second }
    fireEvent.click(screen.getByRole('button', { name: 'Open B' }))
    await screen.findByRole('heading', { name: 'Listing B' })
    expect((await screen.findAllByText('BONLY')).length).toBeGreaterThan(0)

    await act(async () => { resolveFirst({ data: [code('a-code', 'STALE-A')] }) })
    expect(screen.queryByText('STALE-A')).not.toBeInTheDocument()
    expect(screen.getAllByText('BONLY').length).toBeGreaterThan(0)
  })
})
