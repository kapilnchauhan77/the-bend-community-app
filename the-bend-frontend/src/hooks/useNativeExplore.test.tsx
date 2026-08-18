import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useNativeExplore } from './useNativeExplore'
import { listingApi } from '@/services/listingApi'
import { shopApi } from '@/services/shopApi'
import { eventApi } from '@/services/eventApi'

vi.mock('@/services/listingApi', () => ({ listingApi: { browse: vi.fn(), getOpportunities: vi.fn() } }))
vi.mock('@/services/shopApi', () => ({ shopApi: { directory: vi.fn() } }))
vi.mock('@/services/eventApi', () => ({ eventApi: { list: vi.fn() } }))

const platform = { network: { getStatus: vi.fn().mockResolvedValue('online'), addListener: vi.fn().mockResolvedValue({ remove: vi.fn() }) }, cache: { put: vi.fn().mockResolvedValue(undefined), get: vi.fn().mockResolvedValue(null) } }
vi.mock('@/platform/createPlatformServices', () => ({ usePlatformServices: () => platform }))
vi.mock('./useNativeLifecycle', () => ({ useNativeLifecycle: vi.fn() }))

const deferred = <T,>() => { let resolve!: (value: T) => void; let reject!: (reason: unknown) => void; const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej }); return { promise, resolve, reject } }
const listing = (id: string) => ({ id, category: 'staff', title: `Listing ${id}`, images: [], shop: null, posted_by: null, urgency: 'normal', type: 'offer', description: '', is_free: true, status: 'active', interest_count: 0, created_at: '' }) as never
const business = (id: string) => ({ id, business_type: 'Farm', name: `Business ${id}`, address: 'Main', status: 'active' }) as never
const event = (id: string) => ({ id, title: `Event ${id}`, category: 'community', start_date: '2026-12-01T12:00:00Z', location: 'Main' }) as never
const allQuery = (overrides = {}) => ({ q: '', type: 'all' as const, category: null, urgency: null, sort: null, mode: 'list' as const, near: false, ...overrides })

beforeEach(() => { vi.clearAllMocks(); platform.network.getStatus.mockResolvedValue('online'); platform.cache.get.mockResolvedValue(null); platform.cache.put.mockResolvedValue(undefined); vi.mocked(listingApi.browse).mockResolvedValue({ data: { items: [] } } as never); vi.mocked(listingApi.getOpportunities).mockResolvedValue({ data: { items: [] } } as never); vi.mocked(shopApi.directory).mockResolvedValue({ data: { items: [] } } as never); vi.mocked(eventApi.list).mockResolvedValue({ data: { items: [] } } as never) })

describe('useNativeExplore grouped All behavior', () => {
  it('H1 starts all four client calls before any deferred response resolves with bounded params', async () => {
    const listingRequest = deferred<unknown>(); const businessRequest = deferred<unknown>(); const eventRequest = deferred<unknown>(); const volunteerRequest = deferred<unknown>()
    vi.mocked(listingApi.browse).mockReturnValueOnce(listingRequest.promise as never); vi.mocked(shopApi.directory).mockReturnValueOnce(businessRequest.promise as never); vi.mocked(eventApi.list).mockReturnValueOnce(eventRequest.promise as never); vi.mocked(listingApi.getOpportunities).mockReturnValueOnce(volunteerRequest.promise as never)
    const { result } = renderHook(() => useNativeExplore(allQuery()), { reactStrictMode: false })
    await waitFor(() => { expect(listingApi.browse).toHaveBeenCalledTimes(1); expect(shopApi.directory).toHaveBeenCalledTimes(1); expect(eventApi.list).toHaveBeenCalledTimes(1); expect(listingApi.getOpportunities).toHaveBeenCalledTimes(1) })
    expect(listingApi.browse).toHaveBeenCalledWith({ limit: 5 }); expect(shopApi.directory).toHaveBeenCalledWith({ limit: 5 }); expect(eventApi.list).toHaveBeenCalledWith({ limit: 5 }); expect(listingApi.getOpportunities).toHaveBeenCalledWith({ limit: 5 })
    await act(async () => { listingRequest.resolve({ data: { items: [] } }); businessRequest.resolve({ data: { items: [] } }); eventRequest.resolve({ data: { items: [] } }); volunteerRequest.resolve({ data: { items: [] } }) }); await waitFor(() => expect(result.current.groups.every((group) => group.state.status === 'empty')).toBe(true))
  })

  it('does not execute the typed request engine in All mode', async () => {
    renderHook(() => useNativeExplore(allQuery())); await waitFor(() => expect(listingApi.getOpportunities).toHaveBeenCalledTimes(1)); await Promise.resolve(); expect(listingApi.getOpportunities).toHaveBeenCalledTimes(1)
  })

  it('H2 caps every All group at five mapped domain records', async () => {
    vi.mocked(listingApi.browse).mockResolvedValue({ data: { items: Array.from({ length: 7 }, (_, index) => listing(String(index))) } } as never); vi.mocked(shopApi.directory).mockResolvedValue({ data: { items: Array.from({ length: 7 }, (_, index) => business(String(index))) } } as never); vi.mocked(eventApi.list).mockResolvedValue({ data: { items: Array.from({ length: 7 }, (_, index) => event(String(index))) } } as never); vi.mocked(listingApi.getOpportunities).mockResolvedValue({ data: { items: Array.from({ length: 7 }, (_, index) => listing(String(index))) } } as never)
    const { result } = renderHook(() => useNativeExplore(allQuery())); await waitFor(() => expect(result.current.groups.every((group) => group.state.status === 'success')).toBe(true))
    expect(result.current.groups[0].state.data).toHaveLength(5); expect(result.current.groups[0].state.data[0].id).toBe('0'); expect(result.current.groups[0].state.data[4].id).toBe('4'); expect(result.current.groups[1].state.data).toHaveLength(5); expect(result.current.groups[2].state.data).toHaveLength(5); expect(result.current.groups[3].state.data).toHaveLength(5)
  })

  it('H3 translates q to search while retaining endpoint-supported fields', async () => {
    renderHook(() => useNativeExplore(allQuery({ q: 'tractor', urgency: 'urgent', sort: 'urgency_desc', category: 'food' }))); await waitFor(() => expect(listingApi.browse).toHaveBeenCalled())
    expect(listingApi.browse).toHaveBeenCalledWith({ search: 'tractor', category: undefined, urgency: 'urgent', sort: 'urgency_desc', limit: 5 }); expect(shopApi.directory).toHaveBeenCalledWith({ search: 'tractor', business_type: 'food', limit: 5 }); expect(eventApi.list).toHaveBeenCalledWith({ search: 'tractor', category: 'food', limit: 5 }); expect(listingApi.getOpportunities).toHaveBeenCalledWith({ search: 'tractor', urgency: 'urgent', sort: 'urgency_desc', limit: 5 })
  })

  it('H4a uses exactly the four public default cache keys and puts network results', async () => {
    renderHook(() => useNativeExplore(allQuery())); await waitFor(() => expect(platform.cache.put).toHaveBeenCalledTimes(4)); const keys = platform.cache.put.mock.calls.map(([entry]) => entry.key); expect(keys).toEqual(expect.arrayContaining(['listing:native-explore-default', 'business:native-explore-default', 'event:native-explore-default', 'listing:native-explore-volunteer-default']))
  })

  it.each([{ q: 'tractor' }, { category: 'staff' }, { urgency: 'urgent' }, { sort: 'urgency_desc' }, { mode: 'map' }, { near: true }])('H4b uses no cache reads or writes for non-default %#', async (filter) => { renderHook(() => useNativeExplore(allQuery(filter))); await waitFor(() => expect(listingApi.browse).toHaveBeenCalled()); expect(platform.cache.get).not.toHaveBeenCalled(); expect(platform.cache.put).not.toHaveBeenCalled() })

  it('H5 isolates errors and empty groups, then retries only the failed client', async () => {
    vi.mocked(listingApi.browse).mockRejectedValueOnce(new Error('listing failed')); vi.mocked(shopApi.directory).mockResolvedValue({ data: { items: [business('b1')] } } as never); vi.mocked(eventApi.list).mockResolvedValue({ data: { items: [] } } as never); vi.mocked(listingApi.getOpportunities).mockResolvedValue({ data: { items: [listing('v1')] } } as never)
    const { result } = renderHook(() => useNativeExplore(allQuery())); await waitFor(() => expect(result.current.groups[0].state.status).toBe('error')); expect(result.current.groups[1].state.status).toBe('success'); expect(result.current.groups[2].state.status).toBe('empty'); expect(result.current.groups[3].state.status).toBe('success')
    vi.mocked(listingApi.browse).mockResolvedValueOnce({ data: { items: [listing('l1')] } } as never); const before = { business: shopApi.directory.mock.calls.length, event: eventApi.list.mock.calls.length, volunteer: listingApi.getOpportunities.mock.calls.length }; await act(async () => { await result.current.groups[0].state.retry() }); await waitFor(() => expect(result.current.groups[0].state.status).toBe('success')); expect(listingApi.browse).toHaveBeenCalledTimes(2); expect(shopApi.directory).toHaveBeenCalledTimes(before.business); expect(eventApi.list).toHaveBeenCalledTimes(before.event); expect(listingApi.getOpportunities).toHaveBeenCalledTimes(before.volunteer)
  })

  it('H6 retries a failed typed first page through production state.retry', async () => {
    vi.mocked(listingApi.browse).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ data: { items: [listing('retry')] } } as never)
    const { result } = renderHook(() => useNativeExplore({ q: 'tractor', type: 'listings', category: null, urgency: null, sort: null, mode: 'list', near: false })); await waitFor(() => expect(result.current.typed?.state.status).toBe('error')); await act(async () => { await result.current.typed!.state.retry() }); await waitFor(() => expect(result.current.typed?.state.status).toBe('success')); expect(result.current.typed?.state.data.map((item) => item.id)).toEqual(['retry']); expect(listingApi.browse).toHaveBeenCalledTimes(2); expect(listingApi.browse.mock.calls[1][0]).toMatchObject({ search: 'tractor' }); expect(result.current.typed?.state.error).toBeNull()
  })

  it('H7 preserves cards through load-more failure and recovers with de-duplication', async () => {
    vi.mocked(listingApi.browse).mockResolvedValueOnce({ data: { items: [listing('1')], has_more: true, next_cursor: 'c1' } } as never).mockRejectedValueOnce(new Error('page failed')).mockResolvedValueOnce({ data: { items: [listing('1'), listing('2')], has_more: false } } as never)
    const { result } = renderHook(() => useNativeExplore({ q: '', type: 'listings', category: null, urgency: null, sort: null, mode: 'list', near: false })); await waitFor(() => expect(result.current.typed?.hasMore).toBe(true)); await act(async () => { await result.current.typed!.loadMore() }); expect(result.current.typed?.state.data.map((item) => item.id)).toEqual(['1']); expect(result.current.typed?.loadMoreError?.message).toBe('page failed'); expect(result.current.typed?.hasMore).toBe(true); await act(async () => { await result.current.typed!.loadMore() }); await waitFor(() => expect(result.current.typed?.state.data.map((item) => item.id)).toEqual(['1', '2'])); expect(result.current.typed?.loadMoreError).toBeNull(); expect(listingApi.browse.mock.calls[1][0]).toMatchObject({ cursor: 'c1' })
  })

  it('H8 resets typed items and cursor across query, type, and filter transitions', async () => {
    const initial = deferred<unknown>()
    const changed = deferred<unknown>()
    const filtered = deferred<unknown>()
    vi.mocked(listingApi.browse)
      .mockReturnValueOnce(initial.promise as never)
      .mockReturnValueOnce(changed.promise as never)
    vi.mocked(eventApi.list).mockReturnValueOnce(filtered.promise as never)
    const initialQuery = { q: '', type: 'listings' as const, category: null, urgency: null, sort: null, mode: 'list' as const, near: false }
    const { result, rerender } = renderHook(({ query }) => useNativeExplore(query), { initialProps: { query: initialQuery }, reactStrictMode: false })
    await waitFor(() => expect(listingApi.browse).toHaveBeenCalledTimes(1))
    await act(async () => { initial.resolve({ data: { items: [listing('listing')], has_more: true, next_cursor: 'old' } }) })
    await waitFor(() => expect(result.current.typed?.state.data.map((item) => item.id)).toEqual(['listing']))
    expect(result.current.typed?.hasMore).toBe(true)

    rerender({ query: { ...initialQuery, q: 'new' } })
    await waitFor(() => expect(result.current.typed?.state.status).toBe('loading'))
    expect(result.current.typed?.state.data).toEqual([])
    expect(result.current.typed?.hasMore).toBe(false)
    expect(listingApi.browse).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'new' }), expect.anything())
    await act(async () => { changed.resolve({ data: { items: [listing('changed')], has_more: false } }) })
    await waitFor(() => expect(result.current.typed?.state.data.map((item) => item.id)).toEqual(['changed']))

    rerender({ query: { ...initialQuery, type: 'events', category: 'community' } })
    await waitFor(() => expect(result.current.typed?.state.status).toBe('loading'))
    expect(result.current.typed?.state.data).toEqual([])
    expect(result.current.typed?.hasMore).toBe(false)
    expect(eventApi.list).toHaveBeenCalledWith(expect.objectContaining({ category: 'community' }), expect.anything())
    await act(async () => { filtered.resolve({ data: { items: [event('event')], has_more: false } }) })
    await waitFor(() => expect(result.current.typed?.state.data.map((item) => item.id)).toEqual(['event']))
  })

  it('H9 ignores a late old-generation response after a new query wins', async () => {
    const oldRequest = deferred<unknown>(); const newRequest = deferred<unknown>(); vi.mocked(listingApi.browse).mockReturnValueOnce(oldRequest.promise as never).mockReturnValueOnce(newRequest.promise as never); const { result, rerender } = renderHook(({ q }) => useNativeExplore({ q, type: 'listings', category: null, urgency: null, sort: null, mode: 'list', near: false }), { initialProps: { q: 'old' } }); rerender({ q: 'new' }); await act(async () => { newRequest.resolve({ data: { items: [listing('new')] } }) }); await waitFor(() => expect(result.current.typed?.state.data.map((item) => item.id)).toEqual(['new'])); await act(async () => { oldRequest.resolve({ data: { items: [listing('old')] } }) }); await Promise.resolve(); expect(result.current.typed?.state.data.map((item) => item.id)).toEqual(['new']); expect(result.current.typed?.state.error).toBeNull()
  })

  it('H10 ignores an Axios canceled old request without visible error', async () => {
    const oldRequest = deferred<unknown>(); vi.mocked(listingApi.browse).mockReturnValueOnce(oldRequest.promise as never).mockResolvedValueOnce({ data: { items: [listing('new')] } } as never); const { result, rerender } = renderHook(({ q }) => useNativeExplore({ q, type: 'listings', category: null, urgency: null, sort: null, mode: 'list', near: false }), { initialProps: { q: 'old' } }); rerender({ q: 'new' }); await waitFor(() => expect(result.current.typed?.state.data.map((item) => item.id)).toEqual(['new'])); await act(async () => { oldRequest.reject({ code: 'ERR_CANCELED', name: 'CanceledError' }) }); expect(result.current.typed?.state.error).toBeNull(); expect(result.current.typed?.loadMoreError).toBeNull()
  })

  it('H11 refreshAll settles after one real group refresh rejects and others succeed', async () => {
    const { result } = renderHook(() => useNativeExplore(allQuery()))
    await waitFor(() => expect(result.current.groups.every((group) => group.state.status !== 'loading')).toBe(true))
    vi.mocked(listingApi.browse).mockRejectedValueOnce(new Error('refresh failed'))
    vi.mocked(shopApi.directory).mockResolvedValueOnce({ data: { items: [business('fresh')] } } as never)
    vi.mocked(eventApi.list).mockResolvedValueOnce({ data: { items: [event('fresh')] } } as never)
    vi.mocked(listingApi.getOpportunities).mockResolvedValueOnce({ data: { items: [listing('fresh')] } } as never)
    await expect(act(async () => { await result.current.refreshAll() })).resolves.toBeUndefined()
    expect(listingApi.browse).toHaveBeenCalledTimes(2)
    expect(shopApi.directory).toHaveBeenCalledTimes(2)
    expect(eventApi.list).toHaveBeenCalledTimes(2)
    expect(listingApi.getOpportunities).toHaveBeenCalledTimes(2)
  })

  it('H12 exposes load more only for a valid cursor and exact business refinement', async () => {
    vi.mocked(listingApi.browse).mockResolvedValueOnce({ data: { items: [listing('one')], has_more: true, next_cursor: 'cursor' } } as never).mockResolvedValueOnce({ data: { items: [] } } as never); const { result } = renderHook(() => useNativeExplore({ q: '', type: 'listings', category: null, urgency: null, sort: null, mode: 'list', near: false })); await waitFor(() => expect(result.current.typed?.hasMore).toBe(true)); await act(async () => { await result.current.typed!.loadMore() }); expect(listingApi.browse.mock.calls[1][0]).toMatchObject({ cursor: 'cursor' }); vi.mocked(shopApi.directory).mockResolvedValueOnce({ data: { items: [], has_more: true } } as never); const businessResult = renderHook(() => useNativeExplore({ q: '', type: 'businesses', category: null, urgency: null, sort: null, mode: 'list', near: false })); await waitFor(() => expect(businessResult.result.current.typed?.refineMessage).toBe('Refine your search to narrow businesses')); expect(businessResult.result.current.typed?.hasMore).toBe(false)
  })

  it('H13 keeps typed request count stable across state updates and equivalent query objects', async () => {
    vi.mocked(listingApi.browse).mockResolvedValue({ data: { items: [listing('stable')] } } as never); const { result, rerender } = renderHook(({ query }) => useNativeExplore(query), { initialProps: { query: { q: '', type: 'listings' as const, category: null, urgency: null, sort: null, mode: 'list' as const, near: false } } }); await waitFor(() => expect(result.current.typed?.state.status).toBe('success')); rerender({ query: { q: '', type: 'listings' as const, category: null, urgency: null, sort: null, mode: 'list' as const, near: false } }); await Promise.resolve(); expect(listingApi.browse).toHaveBeenCalledTimes(1)
  })
})
