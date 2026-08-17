import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCachedPublicContent } from './useCachedPublicContent'

const cache = { put: vi.fn(), get: vi.fn(), remove: vi.fn(), clear: vi.fn(), stats: vi.fn() }
let status: 'online' | 'offline' = 'online'
let listener: ((next: 'online' | 'offline') => void) | undefined
const network = {
  getStatus: vi.fn(() => Promise.resolve(status)),
  addListener: vi.fn(async (handler: (next: 'online' | 'offline') => void) => { listener = handler; return { remove: vi.fn() } }),
}

vi.mock('@/platform/createPlatformServices', () => ({
  usePlatformServices: () => ({
    cache,
    network,
  }),
}))

vi.mock('./useNativeLifecycle', () => ({ useNativeLifecycle: () => undefined }))

describe('useCachedPublicContent', () => {
  beforeEach(() => {
    status = 'online'
    listener = undefined
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
})
