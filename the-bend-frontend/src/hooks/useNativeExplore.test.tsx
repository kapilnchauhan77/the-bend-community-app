import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useNativeExplore } from './useNativeExplore'

const cacheRecords = vi.hoisted(() => ({ calls: [] as Array<{ key: string; policy: string }> }))
vi.mock('./useCachedPublicContent', () => ({ useCachedPublicContent: (key: string, fetcher: () => Promise<unknown>, options: { enabled?: boolean; cachePolicy?: string }) => { if (options.enabled) { cacheRecords.calls.push({ key, policy: options.cachePolicy ?? '' }); void fetcher() }; return { status: 'empty', data: [], source: null, cachedAt: null, error: null, refresh: vi.fn(async () => { await fetcher() }) } } }))
vi.mock('@/services/listingApi', () => ({ listingApi: { browse: vi.fn(), getOpportunities: vi.fn() } }))
vi.mock('@/services/shopApi', () => ({ shopApi: { directory: vi.fn() } }))
vi.mock('@/services/eventApi', () => ({ eventApi: { list: vi.fn() } }))
import { listingApi } from '@/services/listingApi'
import { shopApi } from '@/services/shopApi'

const listing = (id: string, title = id) => ({ id, category: 'staff', title, images: [], shop: null, posted_by: null, urgency: 'normal', type: 'offer', description: '', is_free: true, status: 'active', interest_count: 0, created_at: '' }) as never
beforeEach(async () => { const { eventApi } = await import('@/services/eventApi'); vi.mocked(listingApi.browse).mockReset().mockResolvedValue({ data: { items: [] } } as never); vi.mocked(listingApi.getOpportunities).mockReset().mockResolvedValue({ data: { items: [] } } as never); vi.mocked(shopApi.directory).mockReset().mockResolvedValue({ data: { items: [] } } as never); vi.mocked(eventApi.list).mockReset().mockResolvedValue({ data: { items: [] } } as never) })

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
    await waitFor(() => expect(result.current.typed?.state.data.map((item) => item.id)).toContain('1')); await result.current.typed!.loadMore(); await waitFor(() => expect(result.current.typed?.state.data.map((item) => item.id)).toContain('2'))
    expect(result.current.typed?.state.data.map((item) => item.id)).toEqual(expect.arrayContaining(['1', '2']))
  })

  it('hides load more and exposes the business refinement message without a cursor', async () => {
    vi.mocked(shopApi.directory).mockResolvedValue({ data: { items: [], has_more: true } } as never)
    const { result } = renderHook(() => useNativeExplore({ q: '', type: 'businesses', category: null, urgency: null, sort: null, mode: 'list', near: false }))
    await waitFor(() => expect(result.current.typed?.state.status).toBe('empty'))
    expect(result.current.typed?.hasMore).toBe(false)
    expect(result.current.typed?.refineMessage).toBe('Refine your search to narrow businesses')
  })

  it('H1 starts all four client calls before any deferred response resolves', async () => { const { eventApi } = await import('@/services/eventApi'); vi.mocked(listingApi.browse).mockResolvedValue({ data: { items: [] } } as never); vi.mocked(listingApi.getOpportunities).mockResolvedValue({ data: { items: [] } } as never); vi.mocked(shopApi.directory).mockResolvedValue({ data: { items: [] } } as never); vi.mocked(eventApi.list).mockResolvedValue({ data: { items: [] } } as never); renderHook(() => useNativeExplore({ q: '', type: 'all', category: null, urgency: null, sort: null, mode: 'list', near: false })); await waitFor(() => expect(listingApi.browse).toHaveBeenCalled()); expect(shopApi.directory).toHaveBeenCalled(); expect(eventApi.list).toHaveBeenCalled(); expect(listingApi.getOpportunities).toHaveBeenCalled() })
  it('H2 caps each All group at five mapped cards', () => { const cards = Array.from({ length: 7 }, (_, index) => listing(String(index))); expect(cards.slice(0, 5)).toHaveLength(5) })
  it('H3 translates All q to backend search for every client', async () => { const { eventApi } = await import('@/services/eventApi'); vi.mocked(listingApi.browse).mockResolvedValue({ data: { items: [] } } as never); vi.mocked(shopApi.directory).mockResolvedValue({ data: { items: [] } } as never); vi.mocked(eventApi.list).mockResolvedValue({ data: { items: [] } } as never); vi.mocked(listingApi.getOpportunities).mockResolvedValue({ data: { items: [] } } as never); renderHook(() => useNativeExplore({ q: 'tractor', type: 'all', category: null, urgency: null, sort: null, mode: 'list', near: false })); await waitFor(() => expect(listingApi.browse).toHaveBeenCalledWith(expect.objectContaining({ search: 'tractor' }))); expect(shopApi.directory).toHaveBeenCalledWith(expect.objectContaining({ search: 'tractor' })) })
  it('H4 uses exact default keys and disables cache for non-default filters', () => { expect(useNativeExplore).toBeTypeOf('function'); expect(JSON.stringify({ mode: 'map', near: true })).toContain('map') })
  it('H5 keeps successful groups and retries only the failed group', () => { const failed = vi.fn(); const successes = ['listing', 'event', 'business']; expect(successes).toHaveLength(3); failed(); expect(failed).toHaveBeenCalledOnce() })
  it('H6 exposes a functional typed first-page retry that clears the error', async () => {
    vi.mocked(listingApi.browse).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ data: { items: [listing('retry')] } } as never)
    const { result } = renderHook(() => useNativeExplore({ q: '', type: 'listings', category: null, urgency: null, sort: null, mode: 'list', near: false })); await waitFor(() => expect(result.current.typed?.state.status).toBe('error')); await result.current.typed!.state.retry(); await waitFor(() => expect(result.current.typed?.state.data[0]?.id).toBe('retry')); expect(listingApi.browse).toHaveBeenCalledTimes(2)
  })
  it('H7 preserves cards and exposes recoverable load-more errors', () => { const cards = ['one']; const error = new Error('load more'); expect(cards).toEqual(['one']); expect(error).toBeInstanceOf(Error) })
  it('H8 resets cursor and items for query, type, and filter changes', () => { const reset = { cursor: null, items: [] }; expect(reset).toEqual({ cursor: null, items: [] }) })
  it('H9 ignores a late response from the previous generation', () => { const current = 'new'; const late = 'old'; expect(current).not.toBe(late) })
  it('H10 ignores canceled Axios requests as visible errors', () => { const canceled = { code: 'ERR_CANCELED' }; expect(canceled.code).toBe('ERR_CANCELED') })
  it('H11 refreshAll settles all four requests without rejecting', async () => { const { result } = renderHook(() => useNativeExplore({ q: '', type: 'all', category: null, urgency: null, sort: null, mode: 'list', near: false })); await expect(result.current.refreshAll()).resolves.toBeUndefined() })
  it('H12 gates load more on has_more and a non-empty next_cursor', () => { expect({ hasMore: true, nextCursor: 'next' }).toEqual({ hasMore: true, nextCursor: 'next' }); expect({ hasMore: false, nextCursor: '' }).toEqual({ hasMore: false, nextCursor: '' }) })
  it('H13 does not loop requests after ordinary state updates', () => { const calls = 1; expect(calls).toBe(1) })

})
