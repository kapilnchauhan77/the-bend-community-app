import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { serializeNativeExploreQuery } from '@/native/discovery/queries'
import { shopApi } from '@/services/shopApi'
import { listingApi } from '@/services/listingApi'
import { eventApi } from '@/services/eventApi'
import { useNativeExplore } from './useNativeExplore'

const sentinel = { latitude: 12.345678, longitude: -98.765432 }
const shop = { id: 'privacy-shop', business_type: 'Farm', name: 'Private Coordinate Farm', address: 'Main', status: 'active', latitude: null, longitude: null }
const query = { q: '', type: 'businesses' as const, category: null, urgency: null, sort: null, mode: 'list' as const, near: false }
const platform = {
  network: { getStatus: vi.fn(), addListener: vi.fn() },
  location: { getForegroundPosition: vi.fn() },
  cache: { put: vi.fn(), get: vi.fn() },
  analytics: { capture: vi.fn() },
}
const storage = { setItem: vi.fn(), getItem: vi.fn(), removeItem: vi.fn() }

vi.mock('@/platform/createPlatformServices', () => ({ usePlatformServices: () => platform }))
vi.mock('@/services/listingApi', () => ({ listingApi: { browse: vi.fn(), getOpportunities: vi.fn() } }))
vi.mock('@/services/eventApi', () => ({ eventApi: { list: vi.fn() } }))
vi.mock('@/services/shopApi', () => ({ shopApi: { directory: vi.fn(), getShop: vi.fn() } }))

beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage })
  platform.network.getStatus.mockResolvedValue('online')
  platform.network.addListener.mockResolvedValue({ remove: vi.fn().mockResolvedValue(undefined) })
  platform.cache.get.mockResolvedValue(null)
  platform.cache.put.mockResolvedValue(undefined)
  platform.location.getForegroundPosition.mockResolvedValue(sentinel)
  vi.mocked(listingApi.browse).mockResolvedValue({ data: { items: [] } } as never)
  vi.mocked(listingApi.getOpportunities).mockResolvedValue({ data: { items: [] } } as never)
  vi.mocked(eventApi.list).mockResolvedValue({ data: { items: [] } } as never)
  vi.mocked(shopApi.directory).mockResolvedValue({ data: { items: [shop] } } as never)
  vi.mocked(shopApi.getShop).mockResolvedValue({ data: { ...shop, ...sentinel } } as never)
})
afterEach(() => cleanup())

describe('Native Explore coordinate privacy integration', () => {
  it('keeps granted and hydrated coordinates in component memory only', async () => {
    const { result } = renderHook(() => useNativeExplore(query), { reactStrictMode: false })
    await waitFor(() => expect(shopApi.getShop).toHaveBeenCalledWith('privacy-shop', expect.anything()))
    await act(async () => { await result.current.requestLocation() })
    await waitFor(() => expect(result.current.mapBusinesses[0]?.coordinates).toEqual(sentinel))

    const canonicalUrl = `/explore?${serializeNativeExploreQuery({ ...query, near: true })}`
    expect(canonicalUrl).toBe('/explore?type=businesses&near=true')
    expect(canonicalUrl).not.toContain(String(sentinel.latitude))
    const sinkValues = [...platform.cache.put.mock.calls, ...platform.analytics.capture.mock.calls, ...storage.setItem.mock.calls].flat()
    expect(JSON.stringify(sinkValues)).not.toContain(String(sentinel.latitude))
    expect(JSON.stringify(sinkValues)).not.toContain(String(sentinel.longitude))
    expect(storage.setItem.mock.calls.filter(([key]) => String(key).includes('pending')).length).toBe(0)
  })
})
