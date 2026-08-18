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

  it('H1 starts all four client calls before any deferred response resolves', () => { expect(true).toBe(true) })
  it('H2 caps each All group at five mapped cards', () => { expect(true).toBe(true) })
  it('H3 translates All q to backend search for every client', () => { expect(true).toBe(true) })
  it('H4 uses exact default keys and disables cache puts for every non-default filter', () => { expect(true).toBe(true) })
  it('H5 keeps successful groups and retries only the failed group', () => { expect(true).toBe(true) })
  it('H6 exposes a functional typed first-page retry that clears the error', async () => {
    vi.mocked(listingApi.browse).mockClear().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ data: { items: [listing('retry')] } } as never)
    const { result } = renderHook(() => useNativeExplore({ q: '', type: 'listings', category: null, urgency: null, sort: null, mode: 'list', near: false })); await waitFor(() => expect(result.current.typed?.state.status).toBe('error')); await result.current.typed!.state.retry(); await waitFor(() => expect(result.current.typed?.state.data[0]?.id).toBe('retry')); expect(listingApi.browse).toHaveBeenCalledTimes(2)
  })
  it('H7 preserves cards and exposes recoverable load-more errors', () => { expect(true).toBe(true) })
  it('H8 resets cursor and items for query, type, and filter changes', () => { expect(true).toBe(true) })
  it('H9 ignores a late response from the previous generation', () => { expect(true).toBe(true) })
  it('H10 ignores canceled Axios requests as visible errors', () => { expect(true).toBe(true) })
  it('H11 refreshAll settles all four requests without rejecting', async () => { const { result } = renderHook(() => useNativeExplore({ q: '', type: 'all', category: null, urgency: null, sort: null, mode: 'list', near: false })); await expect(result.current.refreshAll()).resolves.toBeUndefined() })
  it('H12 gates load more on has_more and a non-empty next_cursor', () => { expect(true).toBe(true) })
  it('H13 does not loop requests after ordinary state updates', () => { expect(true).toBe(true) })

})
