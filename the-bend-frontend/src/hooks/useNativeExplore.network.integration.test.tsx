import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useNativeExplore } from './useNativeExplore'
import { shopApi } from '@/services/shopApi'

const deferred = <T,>() => {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

const platform = {
  network: { getStatus: vi.fn(), addListener: vi.fn() },
  location: { getForegroundPosition: vi.fn() },
  cache: { put: vi.fn(), get: vi.fn() },
}
let networkHandler: ((status: 'online' | 'offline') => void) | null = null
let removeListener: ReturnType<typeof vi.fn>

vi.mock('@/platform/createPlatformServices', () => ({ usePlatformServices: () => platform }))
vi.mock('@/services/listingApi', () => ({ listingApi: { browse: vi.fn(), getOpportunities: vi.fn() } }))
vi.mock('@/services/eventApi', () => ({ eventApi: { list: vi.fn() } }))
vi.mock('@/services/shopApi', () => ({ shopApi: { directory: vi.fn(), getShop: vi.fn() } }))

const shop = (id: string) => ({ id, business_type: 'Farm', name: `Farm ${id}`, address: 'Main', status: 'active', latitude: null, longitude: null })
const query = { q: '', type: 'businesses' as const, category: null, urgency: null, sort: null, mode: 'list' as const, near: false }

beforeEach(() => {
  vi.clearAllMocks()
  networkHandler = null
  removeListener = vi.fn().mockResolvedValue(undefined)
  platform.network.addListener.mockImplementation(async (handler: (status: 'online' | 'offline') => void) => { networkHandler = handler; return { remove: removeListener } })
  platform.cache.get.mockResolvedValue(null)
  platform.cache.put.mockResolvedValue(undefined)
  vi.mocked(shopApi.directory).mockResolvedValue({ data: { items: [shop('one')] } } as never)
  vi.mocked(shopApi.getShop).mockResolvedValue({ data: shop('one') } as never)
})

afterEach(() => cleanup())

describe('useNativeExplore network hydration integration', () => {
  it('keeps online unknown and performs no hydration while initial status is unresolved', async () => {
    const status = deferred<'online' | 'offline'>()
    platform.network.getStatus.mockImplementationOnce(() => status.promise).mockResolvedValue('online')
    const { result } = renderHook(() => useNativeExplore(query), { reactStrictMode: false })
    expect(result.current.online).toBeNull()
    expect(shopApi.getShop).not.toHaveBeenCalled()
    status.resolve('offline')
    await waitFor(() => expect(result.current.online).toBe(false))
    expect(shopApi.getShop).not.toHaveBeenCalled()
  })

  it('does not hydrate offline, invalidates late results, and retries the same visible ID after online', async () => {
    platform.network.getStatus.mockResolvedValue('online')
    const first = deferred<{ data: ReturnType<typeof shop> }>()
    const second = deferred<{ data: ReturnType<typeof shop> }>()
    vi.mocked(shopApi.getShop).mockReturnValueOnce(first.promise as never).mockReturnValueOnce(second.promise as never)
    const { result } = renderHook(() => useNativeExplore(query), { reactStrictMode: false })
    await waitFor(() => expect(shopApi.getShop).toHaveBeenCalledTimes(1))
    act(() => networkHandler?.('offline'))
    await act(async () => { first.resolve({ data: { ...shop('one'), latitude: 40, longitude: -79 } }); await Promise.resolve() })
    expect(result.current.mapBusinesses).toHaveLength(0)
    act(() => networkHandler?.('online'))
    await waitFor(() => expect(shopApi.getShop).toHaveBeenCalledTimes(2))
    await act(async () => { second.resolve({ data: { ...shop('one'), latitude: 40, longitude: -79 } }); await Promise.resolve() })
    await waitFor(() => expect(result.current.mapBusinesses).toHaveLength(1))
  })

  it('does not let a late initial status overwrite a newer listener event', async () => {
    const status = deferred<'online' | 'offline'>()
    platform.network.getStatus.mockImplementationOnce(() => status.promise).mockResolvedValue('online')
    const { result } = renderHook(() => useNativeExplore(query), { reactStrictMode: false })
    act(() => networkHandler?.('offline'))
    expect(result.current.online).toBe(false)
    status.resolve('online')
    await act(async () => { await Promise.resolve() })
    expect(result.current.online).toBe(false)
  })

  it('settles usable offline state when initial status rejects without an unhandled promise', async () => {
    platform.network.getStatus.mockRejectedValueOnce(new Error('status unavailable'))
    const { result } = renderHook(() => useNativeExplore(query), { reactStrictMode: false })
    await waitFor(() => expect(result.current.online).toBe(false))
    expect(shopApi.getShop).not.toHaveBeenCalled()
  })

  it('ignores listener registration rejection without an unhandled promise', async () => {
    platform.network.addListener.mockRejectedValueOnce(new Error('listener unavailable'))
    platform.network.getStatus.mockResolvedValue('online')
    const { result } = renderHook(() => useNativeExplore(query), { reactStrictMode: false })
    await waitFor(() => expect(result.current.online).toBe(true))
    expect(result.current.online).toBe(true)
  })

  it('ignores listener removal rejection during unmount without an unhandled promise', async () => {
    platform.network.getStatus.mockResolvedValue('offline')
    platform.network.addListener.mockImplementationOnce((handler: (status: 'online' | 'offline') => void) => { networkHandler = handler; return Promise.resolve({ remove: vi.fn().mockRejectedValue(new Error('remove unavailable')) }) })
    const { unmount } = renderHook(() => useNativeExplore(query), { reactStrictMode: false })
    unmount()
    await act(async () => { await Promise.resolve() })
  })

  it('removes a listener exactly once even when registration resolves after unmount', async () => {
    const registration = deferred<{ remove: () => Promise<void> }>()
    platform.network.addListener.mockImplementationOnce((handler: (status: 'online' | 'offline') => void) => { networkHandler = handler; return registration.promise })
    platform.network.getStatus.mockResolvedValue('offline')
    const { unmount } = renderHook(() => useNativeExplore(query), { reactStrictMode: false })
    unmount()
    const lateHandler = networkHandler
    registration.resolve({ remove: removeListener })
    await act(async () => { await Promise.resolve() })
    lateHandler?.('online')
    expect(removeListener).toHaveBeenCalledTimes(1)
  })

  it('refreshes failed hydration IDs without duplicating completed IDs', async () => {
    vi.mocked(shopApi.directory).mockResolvedValue({ data: { items: [shop('failed'), shop('complete')] } } as never)
    vi.mocked(shopApi.getShop)
      .mockRejectedValueOnce(new Error('failed'))
      .mockResolvedValueOnce({ data: { ...shop('complete'), latitude: 40, longitude: -79 } } as never)
      .mockResolvedValueOnce({ data: { ...shop('failed'), latitude: 41, longitude: -80 } } as never)
    platform.network.getStatus.mockResolvedValue('online')
    const { result } = renderHook(() => useNativeExplore({ ...query, type: 'all' }), { reactStrictMode: false })
    await waitFor(() => expect(shopApi.getShop).toHaveBeenCalledTimes(2))
    await act(async () => { await result.current.refreshAll() })
    await waitFor(() => expect(shopApi.getShop).toHaveBeenCalledTimes(3))
    expect(vi.mocked(shopApi.getShop).mock.calls.map(([id]) => id)).toEqual(['failed', 'complete', 'failed'])
  })

  it('retries failed typed hydration through the production typed retry without duplicating completed IDs', async () => {
    vi.mocked(shopApi.directory).mockResolvedValue({ data: { items: [shop('failed'), shop('complete')] } } as never)
    vi.mocked(shopApi.getShop)
      .mockRejectedValueOnce(new Error('failed'))
      .mockResolvedValueOnce({ data: { ...shop('complete'), latitude: 40, longitude: -79 } } as never)
      .mockResolvedValueOnce({ data: { ...shop('failed'), latitude: 41, longitude: -80 } } as never)
    platform.network.getStatus.mockResolvedValue('online')
    const { result } = renderHook(() => useNativeExplore(query), { reactStrictMode: false })
    await waitFor(() => expect(shopApi.getShop).toHaveBeenCalledTimes(2))
    await act(async () => { await result.current.typed?.state.retry() })
    await waitFor(() => expect(shopApi.getShop).toHaveBeenCalledTimes(3))
    expect(vi.mocked(shopApi.directory).mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(vi.mocked(shopApi.getShop).mock.calls.map(([id]) => id)).toEqual(['failed', 'complete', 'failed'])
  })
})
