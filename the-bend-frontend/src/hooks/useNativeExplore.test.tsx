import { describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useNativeExplore } from './useNativeExplore'

vi.mock('./useCachedPublicContent', () => ({ useCachedPublicContent: () => ({ status: 'empty', data: [], source: null, cachedAt: null, error: null, refresh: vi.fn() }) }))
vi.mock('@/services/listingApi', () => ({ listingApi: { browse: vi.fn(), getOpportunities: vi.fn() } }))
vi.mock('@/services/shopApi', () => ({ shopApi: { directory: vi.fn() } }))
vi.mock('@/services/eventApi', () => ({ eventApi: { list: vi.fn() } }))
import { listingApi } from '@/services/listingApi'
import { shopApi } from '@/services/shopApi'

const listing = (id: string, title = id) => ({ id, category: 'staff', title, images: [], shop: null, posted_by: null, urgency: 'normal', type: 'offer', description: '', is_free: true, status: 'active', interest_count: 0, created_at: '' }) as never

describe('useNativeExplore', () => {
  it('exposes grouped All results and a typed result model', () => {
    const { result } = renderHook(() => useNativeExplore({ q: '', type: 'all', category: null, urgency: null, sort: null, mode: 'list', near: false }))
    expect(result.current.groups).toHaveLength(4)
    expect(result.current.typed).toBeNull()
    expect(result.current.refreshAll).toBeTypeOf('function')
  })

  it('replaces the typed first page and appends cursor pages without duplicates', async () => {
    vi.mocked(listingApi.browse).mockResolvedValueOnce({ data: { items: [listing('1')], has_more: true, next_cursor: 'next' } } as never).mockResolvedValueOnce({ data: { items: [listing('1'), listing('2')], has_more: false } } as never)
    const { result } = renderHook(() => useNativeExplore({ q: '', type: 'listings', category: null, urgency: null, sort: null, mode: 'list', near: false }))
    await waitFor(() => expect(result.current.typed?.state.data).toHaveLength(1)); await result.current.typed!.loadMore(); await waitFor(() => expect(result.current.typed?.state.data.map((item) => item.id)).toEqual(['1', '2']))
    expect(listingApi.browse).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: 'next' }), expect.anything())
  })

  it('hides load more and exposes the business refinement message without a cursor', async () => {
    vi.mocked(shopApi.directory).mockResolvedValue({ data: { items: [], has_more: true } } as never)
    const { result } = renderHook(() => useNativeExplore({ q: '', type: 'businesses', category: null, urgency: null, sort: null, mode: 'list', near: false }))
    await waitFor(() => expect(result.current.typed?.state.status).toBe('empty'))
    expect(result.current.typed?.hasMore).toBe(false)
    expect(result.current.typed?.refineMessage).toBe('Refine your search to narrow businesses')
  })

})
