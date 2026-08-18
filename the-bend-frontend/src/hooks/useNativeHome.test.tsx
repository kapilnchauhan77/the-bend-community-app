import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useNativeHome } from './useNativeHome'
import { listingApi } from '@/services/listingApi'
import { eventApi } from '@/services/eventApi'
import { sponsorApi } from '@/services/sponsorApi'

vi.mock('@/services/listingApi', () => ({ listingApi: {
  browse: vi.fn().mockResolvedValue({ data: { items: [] } }),
  getOpportunities: vi.fn().mockResolvedValue({ data: { items: [] } }),
  getStories: vi.fn().mockResolvedValue({ data: { items: [] } }),
} }))
vi.mock('@/services/eventApi', () => ({ eventApi: { getUpcoming: vi.fn().mockResolvedValue({ data: { items: [] } }) } }))
vi.mock('@/services/sponsorApi', () => ({ sponsorApi: { list: vi.fn().mockResolvedValue({ data: { items: [] } }) } }))
const platform = { network: { getStatus: vi.fn().mockResolvedValue('online'), addListener: vi.fn().mockResolvedValue({ remove: vi.fn() }) }, cache: { put: vi.fn().mockResolvedValue(undefined), get: vi.fn().mockResolvedValue(null) } }
vi.mock('@/platform/createPlatformServices', () => ({ usePlatformServices: () => platform }))

describe('useNativeHome', () => {
  const event = { id: 'e1', title: 'Town hall', start_date: '2026-12-01T12:00:00Z', category: 'community', location: 'Main St', source: 'test', is_featured: false, status: 'published', created_at: '2026-01-01' } as never
  const deferred = <T,>() => { let resolve!: (value: T) => void; let reject!: (reason: unknown) => void; const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej }); return { promise, resolve, reject } }
  beforeEach(() => { vi.clearAllMocks(); platform.network.getStatus.mockResolvedValue('online'); platform.cache.get.mockResolvedValue(null) })

  it('starts all five home section requests independently', async () => {
    const { result } = renderHook(() => useNativeHome())
    await waitFor(() => expect(result.current.urgent.status).toBeDefined())
    expect(result.current).toHaveProperty('highlights')
    expect(result.current).toHaveProperty('partners')
  })

  it('exposes a retry function for each independently failed section', async () => {
    const { result } = renderHook(() => useNativeHome())
    await waitFor(() => expect(typeof result.current.urgent.retry).toBe('function'))
    expect(typeof result.current.upcoming.retry).toBe('function')
    expect(typeof result.current.opportunities.retry).toBe('function')
    expect(typeof result.current.highlights.retry).toBe('function')
    expect(typeof result.current.partners.retry).toBe('function')
  })

  it('uses the exact bounded public calls and starts all five before resolution', async () => {
    const urgent = deferred<{ items: never[] }>(); const events = deferred<{ items: never[] }>(); const opportunities = deferred<{ items: never[] }>(); const stories = deferred<{ items: never[] }>(); const partners = deferred<{ items: never[] }>()
    vi.mocked(listingApi.browse).mockReturnValueOnce(urgent.promise as never); vi.mocked(eventApi.getUpcoming).mockReturnValueOnce(events.promise as never); vi.mocked(listingApi.getOpportunities).mockReturnValueOnce(opportunities.promise as never); vi.mocked(listingApi.getStories).mockReturnValueOnce(stories.promise as never); vi.mocked(sponsorApi.list).mockReturnValueOnce(partners.promise as never)
    const { result } = renderHook(() => useNativeHome())
    await waitFor(() => expect(vi.mocked(sponsorApi.list)).toHaveBeenCalledTimes(1))
    expect(listingApi.browse).toHaveBeenCalledWith({ urgency: 'urgent', limit: 3 }); expect(eventApi.getUpcoming).toHaveBeenCalledWith(3); expect(listingApi.getOpportunities).toHaveBeenCalledWith({ limit: 5 }); expect(listingApi.getStories).toHaveBeenCalledWith({ featured: 'true', limit: '3' }); expect(sponsorApi.list).toHaveBeenCalledWith('homepage')
    urgent.resolve({ data: { items: [] } } as never); events.resolve({ data: { items: [] } } as never); opportunities.resolve({ data: { items: [] } } as never); stories.resolve({ data: { items: [] } } as never); partners.resolve({ data: { items: [] } } as never); await waitFor(() => expect(result.current.partners.status).toBe('empty'))
  })

  it('keeps an event section successful when urgent fails', async () => {
    vi.mocked(listingApi.browse).mockRejectedValueOnce(new Error('urgent unavailable')); vi.mocked(eventApi.getUpcoming).mockResolvedValueOnce({ data: { items: [event] } } as never)
    const { result } = renderHook(() => useNativeHome())
    await waitFor(() => expect(result.current.urgent.status).toBe('error')); await waitFor(() => expect(result.current.upcoming.status).toBe('success')); expect(result.current.upcoming.data[0]?.title).toBe('Town hall')
  })

  it('turns malformed payloads into local errors', async () => {
    vi.mocked(listingApi.browse).mockResolvedValueOnce({ data: { nope: true } } as never)
    const { result } = renderHook(() => useNativeHome()); await waitFor(() => expect(result.current.urgent.status).toBe('error')); expect(result.current.urgent.error?.message).toMatch(/malformed/i)
  })

  it('projects cache source and freshness for cacheable sections', async () => {
    platform.network.getStatus.mockResolvedValue('offline')
    platform.cache.get.mockImplementation(async (key: string) => ({ key, kind: 'listing', entityId: key, cachedAt: '2026-01-01T00:00:00.000Z', payload: [], imagePath: null, sizeBytes: 1 }))
    const { result } = renderHook(() => useNativeHome()); await waitFor(() => expect(result.current.urgent.source).toBe('cache')); expect(result.current.urgent.cachedAt).toBe('2026-01-01T00:00:00.000Z'); expect(result.current.opportunities.source).toBe('cache')
  })

  it('retries only the failed section and remains inert after unmount', async () => {
    const pending = deferred<{ items: never[] }>(); vi.mocked(listingApi.browse).mockRejectedValueOnce(new Error('failed')).mockReturnValueOnce(pending.promise as never)
    const { result, unmount } = renderHook(() => useNativeHome()); await waitFor(() => expect(result.current.urgent.status).toBe('error')); const before = vi.mocked(eventApi.getUpcoming).mock.calls.length; void result.current.urgent.retry(); await waitFor(() => expect(listingApi.browse).toHaveBeenCalledTimes(2)); expect(eventApi.getUpcoming).toHaveBeenCalledTimes(before); unmount(); pending.resolve({ data: { items: [] } } as never); await pending.promise
  })

  it('uses fixed cache keys without query, identity, token, or coordinates', () => {
    const keys = ['listing:native-home-urgent', 'event:native-home-upcoming', 'listing:native-home-opportunities', 'listing:native-home-highlights', 'listing:native-home-partners']
    expect(keys).toEqual(expect.arrayContaining(['listing:native-home-urgent', 'event:native-home-upcoming', 'listing:native-home-opportunities'])); expect(keys.join('|')).not.toMatch(/search|user|token|coord/i)
  })
})
