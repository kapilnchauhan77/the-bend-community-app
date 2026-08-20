import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useNativeExplore } from './useNativeExplore'
import { shopApi } from '@/services/shopApi'
import { listingApi } from '@/services/listingApi'
import { eventApi } from '@/services/eventApi'
import { benderApi } from '@/services/benderApi'

const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>((res) => { resolve = res }); return { promise, resolve } }
const shop = (id: string, coordinates: { latitude: number; longitude: number } | null = null) => ({ id, business_type: 'Farm', name: `Farm ${id}`, address: 'Main', status: 'active', latitude: coordinates?.latitude ?? null, longitude: coordinates?.longitude ?? null })
const query = { q: '', type: 'businesses' as const, category: null, urgency: null, sort: null, mode: 'list' as const, near: true }
const platform = { network: { getStatus: vi.fn(), addListener: vi.fn() }, location: { getForegroundPosition: vi.fn() }, cache: { put: vi.fn(), get: vi.fn() } }

vi.mock('@/platform/createPlatformServices', () => ({ usePlatformServices: () => platform }))
vi.mock('@/services/listingApi', () => ({ listingApi: { browse: vi.fn(), getOpportunities: vi.fn() } }))
vi.mock('@/services/eventApi', () => ({ eventApi: { list: vi.fn() } }))
vi.mock('@/services/benderApi', () => ({ benderApi: { listPosts: vi.fn() } }))
vi.mock('@/services/shopApi', () => ({ shopApi: { directory: vi.fn(), getShop: vi.fn() } }))

beforeEach(() => {
  vi.clearAllMocks()
  platform.network.getStatus.mockResolvedValue('online')
  platform.network.addListener.mockResolvedValue({ remove: vi.fn().mockResolvedValue(undefined) })
  platform.cache.get.mockResolvedValue(null)
  platform.cache.put.mockResolvedValue(undefined)
  platform.location.getForegroundPosition.mockResolvedValue({ latitude: 40, longitude: -79 })
  vi.mocked(listingApi.browse).mockResolvedValue({ data: { items: [] } } as never)
  vi.mocked(listingApi.getOpportunities).mockResolvedValue({ data: { items: [] } } as never)
  vi.mocked(eventApi.list).mockResolvedValue({ data: { items: [] } } as never)
  vi.mocked(benderApi.listPosts).mockResolvedValue({ data: { items: [], has_more: false } } as never)
  vi.mocked(shopApi.getShop).mockResolvedValue({ data: shop('detail') } as never)
})
afterEach(() => cleanup())

describe('useNativeExplore Near ordering integration', () => {
  it('sorts coordinate-bearing businesses by Haversine distance and keeps missing coordinates in stable server order', async () => {
    vi.mocked(shopApi.directory).mockResolvedValue({ data: { items: [shop('far', { latitude: 41, longitude: -79 }), shop('missing'), shop('near', { latitude: 40.1, longitude: -79 }), shop('missing-2'), shop('same', { latitude: 40.1, longitude: -79 })] } } as never)
    const { result } = renderHook(() => useNativeExplore(query), { reactStrictMode: false })
    await act(async () => { await result.current.requestLocation() })
    await waitFor(() => expect(result.current.typed?.state.status).toBe('success'))
    expect(result.current.typed?.state.data.map((item) => item.id)).toEqual(['near', 'same', 'far', 'missing', 'missing-2'])
  })

  it('re-sorts the aggregate after loadMore without changing the server cursor', async () => {
    const first = [shop('first', { latitude: 40.8, longitude: -79 })]
    const second = [shop('second', { latitude: 40.05, longitude: -79 }), shop('tail')]
    vi.mocked(shopApi.directory).mockResolvedValueOnce({ data: { items: first, has_more: true, next_cursor: 'cursor-1' } } as never).mockResolvedValueOnce({ data: { items: second, has_more: false, next_cursor: null } } as never)
    const { result } = renderHook(() => useNativeExplore(query), { reactStrictMode: false })
    await act(async () => { await result.current.requestLocation() })
    await waitFor(() => expect(result.current.typed?.hasMore).toBe(true))
    await act(async () => { await result.current.typed?.loadMore() })
    expect(shopApi.directory.mock.calls.map(([params]) => (params as { cursor?: string }).cursor)).toEqual([undefined, 'cursor-1'])
    expect(result.current.typed?.state.data.map((item) => item.id)).toEqual(['second', 'first', 'tail'])
  })

  it('re-sorts after late valid hydration without refetching the directory', async () => {
    const details = new Map<string, ReturnType<typeof deferred<{ data: ReturnType<typeof shop> }>>>([['late-far', deferred()], ['late-near', deferred()]])
    vi.mocked(shopApi.directory).mockResolvedValue({ data: { items: [shop('late-far'), shop('late-near')] } } as never)
    vi.mocked(shopApi.getShop).mockImplementation((id) => details.get(String(id))!.promise as never)
    const { result } = renderHook(() => useNativeExplore(query), { reactStrictMode: false })
    await waitFor(() => expect(shopApi.getShop).toHaveBeenCalledTimes(2))
    await act(async () => { await result.current.requestLocation() })
    details.get('late-far')!.resolve({ data: shop('late-far', { latitude: 41, longitude: -79 }) })
    details.get('late-near')!.resolve({ data: shop('late-near', { latitude: 40.05, longitude: -79 }) })
    await waitFor(() => expect(result.current.typed?.state.data.map((item) => item.id)).toEqual(['late-near', 'late-far']))
    expect(shopApi.directory).toHaveBeenCalledTimes(1)
  })
})
