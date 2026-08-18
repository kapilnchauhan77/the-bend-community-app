import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCachedPublicContent } from './useCachedPublicContent'

const cache = { put: vi.fn(), get: vi.fn(), remove: vi.fn(), clear: vi.fn(), stats: vi.fn() }
let status: 'online' | 'offline' = 'online'
let listener: ((next: 'online' | 'offline') => void) | undefined
let lifecycleRefresh: (() => Promise<void>) | undefined
let removeListener = vi.fn()
const network = {
  getStatus: vi.fn(() => Promise.resolve(status)),
  addListener: vi.fn(async (handler: (next: 'online' | 'offline') => void) => { listener = handler; return { remove: removeListener } }),
}
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done }); return { promise, resolve } }

vi.mock('@/platform/createPlatformServices', () => ({
  usePlatformServices: () => ({
    cache,
    network,
  }),
}))

vi.mock('./useNativeLifecycle', () => ({ useNativeLifecycle: (refresh: () => Promise<void>) => { lifecycleRefresh = refresh } }))

describe('useCachedPublicContent', () => {
  beforeEach(() => {
    status = 'online'
    listener = undefined
    lifecycleRefresh = undefined
    removeListener = vi.fn().mockResolvedValue(undefined)
    vi.clearAllMocks()
    cache.get.mockResolvedValue(null)
    cache.put.mockResolvedValue(undefined)
  })

  it('coalesces concurrent refreshes into one authoritative request', async () => {
    let resolve!: (value: { id: string }) => void
    const fetcher = vi.fn(() => new Promise<{ id: string }>((done) => { resolve = done }))
    const { result } = renderHook(() => useCachedPublicContent('listing:1', fetcher))

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))
    await act(async () => { void result.current.refresh(); void result.current.refresh() })
    expect(fetcher).toHaveBeenCalledTimes(1)
    await act(async () => { resolve({ id: 'new' }) })
    await waitFor(() => expect(result.current.data).toEqual({ id: 'new' }))
  })

  it('does not let an older request overwrite a later refresh', async () => {
    const resolvers: Array<(value: { id: string }) => void> = []
    const fetcher = vi.fn(() => new Promise<{ id: string }>((done) => resolvers.push(done)))
    const { result } = renderHook(() => useCachedPublicContent('listing:1', fetcher))

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))
    await act(async () => { resolvers[0]!({ id: 'first' }) })
    await waitFor(() => expect(result.current.data).toEqual({ id: 'first' }))
    await act(async () => { void result.current.refresh() })
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2))
    await act(async () => { resolvers[1]!({ id: 'second' }) })
    await waitFor(() => expect(result.current.data).toEqual({ id: 'second' }))
  })

  it('uses cache while offline and refreshes once after reconnect', async () => {
    status = 'offline'
    cache.get.mockResolvedValue({ key: 'listing:1', kind: 'listing', entityId: '1', cachedAt: '2026-01-01T00:00:00.000Z', payload: { id: 'cached' }, imagePath: null, sizeBytes: 16 })
    const fetcher = vi.fn().mockResolvedValue({ id: 'fresh' })
    const { result } = renderHook(() => useCachedPublicContent('listing:1', fetcher))

    await waitFor(() => expect(result.current.data).toEqual({ id: 'cached' }))
    expect(fetcher).not.toHaveBeenCalled()
    status = 'online'
    await act(async () => { listener?.('online') })
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(result.current.data).toEqual({ id: 'fresh' }))
  })

  it('stops listener-triggered work and state changes after unmount', async () => {
    const fetcher = vi.fn().mockResolvedValue({ id: 'fresh' })
    const { unmount } = renderHook(() => useCachedPublicContent('listing:1', fetcher))
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))
    unmount()
    await waitFor(() => expect(removeListener).toHaveBeenCalledTimes(1))
    await act(async () => { listener?.('online') })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('makes the lifecycle refresh callback inert after unmount', async () => {
    const fetcher = vi.fn().mockResolvedValue({ id: 'fresh' })
    const { unmount } = renderHook(() => useCachedPublicContent('listing:1', fetcher))
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))
    const refreshAfterUnmount = lifecycleRefresh
    unmount()
    vi.clearAllMocks()

    await act(async () => { await refreshAfterUnmount?.() })

    expect(network.getStatus).not.toHaveBeenCalled()
    expect(fetcher).not.toHaveBeenCalled()
    expect(cache.get).not.toHaveBeenCalled()
    expect(cache.put).not.toHaveBeenCalled()
  })

  it('writes each successful request to its own cache key even if the visible key changes', async () => {
    const first = deferred<{ id: string }>()
    const second = deferred<{ id: string }>()
    const firstFetcher = vi.fn(() => first.promise)
    const secondFetcher = vi.fn(() => second.promise)
    const { result, rerender } = renderHook(
      ({ key, fetcher }) => useCachedPublicContent(key, fetcher),
      { initialProps: { key: 'listing:1', fetcher: firstFetcher } },
    )
    await waitFor(() => expect(firstFetcher).toHaveBeenCalledTimes(1))
    rerender({ key: 'listing:2', fetcher: secondFetcher })
    await waitFor(() => expect(secondFetcher).toHaveBeenCalledTimes(1))

    await act(async () => { first.resolve({ id: 'first' }); await first.promise })
    await act(async () => { second.resolve({ id: 'second' }); await second.promise })
    await waitFor(() => expect(result.current.data).toEqual({ id: 'second' }))
    expect(cache.put.mock.calls.map(([entry]) => entry.key)).toEqual(['listing:1', 'listing:2'])
    expect(cache.put).toHaveBeenCalledTimes(2)
  })

  it('exposes loading and network error states', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('network failed'))
    const { result } = renderHook(() => useCachedPublicContent('listing:error', fetcher))
    expect(result.current).toMatchObject({ status: 'loading', data: null, error: null })
    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.error?.message).toBe('network failed')
  })

  it('uses a valid cache fallback with explicit success source', async () => {
    status = 'offline'
    cache.get.mockResolvedValue({ key: 'listing:cached', kind: 'listing', entityId: 'cached', cachedAt: '2026-01-01T00:00:00.000Z', payload: { id: 'cached' }, imagePath: null, sizeBytes: 16 })
    const { result } = renderHook(() => useCachedPublicContent('listing:cached', vi.fn()))
    await waitFor(() => expect(result.current).toMatchObject({ status: 'success', source: 'cache', data: { id: 'cached' } }))
  })

  it('resets visible state when the key changes and retry clears an error', async () => {
    const second = deferred<{ id: string }>()
    const fetcher = vi.fn().mockRejectedValueOnce(new Error('failed')).mockReturnValueOnce(second.promise)
    const { result, rerender } = renderHook(({ key }) => useCachedPublicContent(key, fetcher), { initialProps: { key: 'listing:1' } })
    await waitFor(() => expect(result.current.status).toBe('error'))
    rerender({ key: 'listing:2' })
    await waitFor(() => expect(result.current).toMatchObject({ status: 'loading', data: null, error: null }))
    await act(async () => { second.resolve({ id: 'fresh' }); await second.promise })
    await waitFor(() => expect(result.current).toMatchObject({ status: 'success', data: { id: 'fresh' }, error: null }))
  })
})
