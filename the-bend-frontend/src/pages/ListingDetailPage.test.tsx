import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ListingDetail } from '@/types'
import ListingDetailPage from './ListingDetailPage'

const runOnline = vi.fn(async () => { throw new Error('OFFLINE_ACTION_UNAVAILABLE') })
const cachedRefresh = vi.fn(() => Promise.resolve())
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
vi.mock('@/stores/authStore', () => ({ useAuthStore: () => ({ isAuthenticated: true, shop: null, user: { id: 'viewer', role: 'individual' } }) }))
vi.mock('@/components/layout/PageLayout', () => ({ PageLayout: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock('@/components/features/messages/ShareToMessageButton', () => ({ ShareToMessageButton: () => null }))
vi.mock('@/components/shared/ShareButton', () => ({ ShareButton: () => null }))

const listing: ListingDetail = {
  id: 'l1', title: 'Oak desk', description: 'A sturdy oak desk', type: 'offer', category: 'equipment', urgency: 'normal',
  is_free: true, status: 'active', interest_count: 0, views_count: 1, images: [], created_at: '2026-08-18T00:00:00Z',
  viewer_has_interest: false, viewer_has_saved: false, posted_by: null,
  shop: { id: 's1', name: 'Workshop', business_type: 'maker', contact_phone: '123' },
}

beforeEach(() => {
  cachedRefresh.mockClear()
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
})
