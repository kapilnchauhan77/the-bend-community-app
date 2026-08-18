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
    await waitFor(() => { expect(listingApi.browse).toHaveBeenCalled(); expect(shopApi.directory).toHaveBeenCalled(); expect(eventApi.list).toHaveBeenCalled(); expect(listingApi.getOpportunities).toHaveBeenCalled() })
    expect(listingApi.browse).toHaveBeenCalledWith({ limit: 5 }); expect(shopApi.directory).toHaveBeenCalledWith({ limit: 5 }); expect(eventApi.list).toHaveBeenCalledWith({ limit: 5 }); expect(listingApi.getOpportunities).toHaveBeenCalledWith({ limit: 5 })
    await act(async () => { listingRequest.resolve({ data: { items: [] } }); businessRequest.resolve({ data: { items: [] } }); eventRequest.resolve({ data: { items: [] } }); volunteerRequest.resolve({ data: { items: [] } }) }); await waitFor(() => expect(result.current.groups.every((group) => group.state.status === 'empty')).toBe(true))
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
})
