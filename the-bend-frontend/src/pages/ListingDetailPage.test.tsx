import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { ListingDetail } from '@/types'
import ListingDetailPage from './ListingDetailPage'

const runOnline = vi.fn(async () => { throw new Error('OFFLINE_ACTION_UNAVAILABLE') })

vi.mock('@/hooks/useOnlineMutation', () => ({ useOnlineMutation: () => ({ online: false, ready: true, run: runOnline }) }))
vi.mock('@/hooks/useCachedPublicContent', () => ({ useCachedPublicContent: () => ({ data: listing, source: 'cache', cachedAt: '2026-08-18T00:00:00Z', refresh: vi.fn() }) }))
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

describe('ListingDetailPage offline actions', () => {
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
