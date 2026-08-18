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
    const { result, unmount } = renderHook(() => useNativeExplore(query), { reactStrictMode: false })
    unmount()
    const lateHandler = networkHandler
    registration.resolve({ remove: removeListener })
    await act(async () => { await Promise.resolve() })
    const onlineAfterUnmount = result.current.online
    const mapBusinessesAfterUnmount = result.current.mapBusinesses
    const detailCallsAfterUnmount = vi.mocked(shopApi.getShop).mock.calls.length
    lateHandler?.('online')
    await act(async () => { await Promise.resolve() })
    expect(removeListener).toHaveBeenCalledTimes(1)
    expect(result.current.online).toBe(onlineAfterUnmount)
    expect(result.current.mapBusinesses).toBe(mapBusinessesAfterUnmount)
    expect(vi.mocked(shopApi.getShop).mock.calls.length).toBe(detailCallsAfterUnmount)
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

  it('does not duplicate an in-flight typed hydration request during retry', async () => {
    const secondDirectory = deferred<{ data: { items: ReturnType<typeof shop>[] } }>()
    const pendingDetail = deferred<{ data: ReturnType<typeof shop> }>()
    vi.mocked(shopApi.directory)
      .mockResolvedValueOnce({ data: { items: [shop('pending')] } } as never)
      .mockReturnValueOnce(secondDirectory.promise as never)
    vi.mocked(shopApi.getShop).mockReturnValueOnce(pendingDetail.promise as never)
    platform.network.getStatus.mockResolvedValue('online')
    const { result } = renderHook(() => useNativeExplore(query), { reactStrictMode: false })
    await waitFor(() => expect(shopApi.getShop).toHaveBeenCalledTimes(1))
    await act(async () => { void result.current.typed?.state.retry(); await Promise.resolve() })
    await waitFor(() => expect(shopApi.directory.mock.calls.length).toBeGreaterThanOrEqual(2))
    secondDirectory.resolve({ data: { items: [shop('pending')] } })
    await act(async () => { await Promise.resolve() })
    expect(vi.mocked(shopApi.getShop).mock.calls.map(([id]) => id)).toEqual(['pending'])
    pendingDetail.resolve({ data: { ...shop('pending'), latitude: 40, longitude: -79 } })
    await waitFor(() => expect(result.current.mapBusinesses).toHaveLength(1))
  })

  it('invalidates a retry context on immediate unmount before a late detail resolves', async () => {
    const pendingDetail = deferred<{ data: ReturnType<typeof shop> }>()
    vi.mocked(shopApi.getShop).mockReturnValueOnce(pendingDetail.promise as never)
    platform.network.getStatus.mockResolvedValue('online')
    const { result, unmount } = renderHook(() => useNativeExplore(query), { reactStrictMode: false })
    await waitFor(() => expect(shopApi.getShop).toHaveBeenCalledTimes(1))
    await act(async () => { await result.current.typed?.state.retry() })
    unmount()
    pendingDetail.resolve({ data: { ...shop('pending'), latitude: 40, longitude: -79 } })
    await act(async () => { await Promise.resolve() })
    expect(result.current.mapBusinesses).toHaveLength(0)
  })

  it('ignores retry results after a query context change and hydrates only current IDs', async () => {
    const oldDetail = deferred<{ data: ReturnType<typeof shop> }>()
    vi.mocked(shopApi.directory).mockResolvedValueOnce({ data: { items: [shop('old')] } } as never).mockResolvedValue({ data: { items: [shop('new')] } } as never)
    vi.mocked(shopApi.getShop).mockReturnValueOnce(oldDetail.promise as never).mockResolvedValue({ data: { ...shop('new'), latitude: 41, longitude: -80 } } as never)
    platform.network.getStatus.mockResolvedValue('online')
    const { result, rerender } = renderHook(({ q }) => useNativeExplore({ ...query, q }), { initialProps: { q: 'old' }, reactStrictMode: false })
    await waitFor(() => expect(shopApi.getShop).toHaveBeenCalledTimes(1))
    await act(async () => { await result.current.typed?.state.retry() })
    rerender({ q: 'new' })
    oldDetail.resolve({ data: { ...shop('old'), latitude: 40, longitude: -79 } })
    await waitFor(() => expect(shopApi.directory.mock.calls.length).toBeGreaterThanOrEqual(2))
    await waitFor(() => expect(shopApi.getShop.mock.calls.some(([id]) => id === 'new')).toBe(true))
    await waitFor(() => expect(result.current.mapBusinesses.map((item) => item.id)).toEqual(['new']))
  })

  it('ignores a retry result while offline and retries once after returning online', async () => {
    const pendingDetail = deferred<{ data: ReturnType<typeof shop> }>()
    vi.mocked(shopApi.getShop).mockReturnValueOnce(pendingDetail.promise as never).mockResolvedValueOnce({ data: { ...shop('one'), latitude: 40, longitude: -79 } } as never)
    platform.network.getStatus.mockResolvedValue('online')
    const { result } = renderHook(() => useNativeExplore(query), { reactStrictMode: false })
    await waitFor(() => expect(shopApi.getShop).toHaveBeenCalledTimes(1))
    act(() => networkHandler?.('offline'))
    pendingDetail.resolve({ data: { ...shop('one'), latitude: 40, longitude: -79 } })
    await act(async () => { await Promise.resolve() })
    expect(result.current.mapBusinesses).toHaveLength(0)
    act(() => networkHandler?.('online'))
    await waitFor(() => expect(shopApi.getShop).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(result.current.mapBusinesses).toHaveLength(1))
  })

  it('coalesces repeated retries behind one in-flight ID', async () => {
    const pendingDetail = deferred<{ data: ReturnType<typeof shop> }>()
    vi.mocked(shopApi.getShop).mockReturnValueOnce(pendingDetail.promise as never).mockResolvedValueOnce({ data: { ...shop('one'), latitude: 40, longitude: -79 } } as never)
    platform.network.getStatus.mockResolvedValue('online')
    const { result } = renderHook(() => useNativeExplore(query), { reactStrictMode: false })
    await waitFor(() => expect(shopApi.getShop).toHaveBeenCalledTimes(1))
    await act(async () => { void result.current.typed?.state.retry(); void result.current.typed?.state.retry(); await Promise.resolve() })
    expect(shopApi.getShop).toHaveBeenCalledTimes(1)
    pendingDetail.resolve({ data: { ...shop('one'), latitude: 40, longitude: -79 } })
    await waitFor(() => expect(result.current.mapBusinesses).toHaveLength(1))
    expect(shopApi.getShop).toHaveBeenCalledTimes(1)
  })

  it('shares an in-flight detail across overlapping contexts for the same visible ID', async () => {
    const sharedDetail = deferred<{ data: ReturnType<typeof shop> }>()
    vi.mocked(shopApi.directory).mockResolvedValueOnce({ data: { items: [shop('shared')] } } as never).mockResolvedValue({ data: { items: [shop('shared'), shop('current')] } } as never)
    vi.mocked(shopApi.getShop).mockReturnValueOnce(sharedDetail.promise as never).mockResolvedValue({ data: { ...shop('current'), latitude: 41, longitude: -80 } } as never)
    platform.network.getStatus.mockResolvedValue('online')
    const { result, rerender } = renderHook(({ q }) => useNativeExplore({ ...query, q }), { initialProps: { q: 'A' }, reactStrictMode: false })
    await waitFor(() => expect(shopApi.getShop).toHaveBeenCalledTimes(1))
    rerender({ q: 'B' })
    await waitFor(() => expect(shopApi.directory.mock.calls.length).toBeGreaterThanOrEqual(2))
    expect(shopApi.getShop.mock.calls.map(([id]) => id).filter((id) => id === 'shared')).toEqual(['shared'])
    sharedDetail.resolve({ data: { ...shop('shared'), latitude: 40, longitude: -79 } })
    await waitFor(() => expect(result.current.mapBusinesses.map((item) => item.id).sort()).toEqual(['current', 'shared']))
    expect(shopApi.getShop.mock.calls.map(([id]) => id).filter((id) => id === 'shared')).toEqual(['shared'])
  })

  it('retires old shared detail work across offline epochs before accepting the fresh result', async () => {
    const oldDetail = deferred<{ data: ReturnType<typeof shop> }>()
    const newDetail = deferred<{ data: ReturnType<typeof shop> }>()
    const signals: Array<AbortSignal | undefined> = []
    vi.mocked(shopApi.getShop).mockImplementation((id, options) => { signals.push(options?.signal); return (signals.length === 1 ? oldDetail.promise : newDetail.promise) as never })
    platform.network.getStatus.mockResolvedValue('online')
    const { result } = renderHook(() => useNativeExplore(query), { reactStrictMode: false })
    await waitFor(() => expect(shopApi.getShop).toHaveBeenCalledTimes(1))
    act(() => networkHandler?.('offline'))
    act(() => networkHandler?.('online'))
    await waitFor(() => expect(shopApi.getShop).toHaveBeenCalledTimes(2))
    expect(signals[0]).not.toBe(signals[1])
    oldDetail.resolve({ data: { ...shop('one'), latitude: 40, longitude: -79 } })
    await act(async () => { await Promise.resolve() })
    expect(result.current.mapBusinesses).toHaveLength(0)
    newDetail.resolve({ data: { ...shop('one'), latitude: 41, longitude: -80 } })
    await waitFor(() => expect(result.current.mapBusinesses).toHaveLength(1))
    expect(result.current.mapBusinesses[0]?.coordinates).toEqual({ latitude: 41, longitude: -80 })
  })
})
