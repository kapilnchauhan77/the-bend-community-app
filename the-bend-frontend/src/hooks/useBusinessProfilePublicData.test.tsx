import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Shop } from '@/types'
import { useBusinessProfilePublicData } from './useBusinessProfilePublicData'

let cachedData: Shop | null = null
let primaryFetcher: (() => Promise<Shop>) | undefined
const getShop = vi.fn()
const getShopListings = vi.fn()
const getEndorsements = vi.fn()
const listForShop = vi.fn()
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done }); return { promise, resolve } }

vi.mock('./useCachedPublicContent', () => ({
  useCachedPublicContent: (_key: string, fetcher: () => Promise<Shop>) => {
    primaryFetcher = fetcher
    return { data: cachedData, source: cachedData ? 'cache' : null, cachedAt: null, refresh: vi.fn() }
  },
}))
vi.mock('@/services/shopApi', () => ({ shopApi: {
  getShop: (...args: unknown[]) => getShop(...args),
  getShopListings: (...args: unknown[]) => getShopListings(...args),
  getEndorsements: (...args: unknown[]) => getEndorsements(...args),
} }))
vi.mock('@/services/discountCodeApi', () => ({ discountCodeApi: { listForShop: (...args: unknown[]) => listForShop(...args) } }))

const shop = (id: string, name = id): Shop => ({ id, name, business_type: 'retail', status: 'active' })

describe('useBusinessProfilePublicData', () => {
  beforeEach(() => {
    cachedData = null
    primaryFetcher = undefined
    vi.clearAllMocks()
    getShopListings.mockResolvedValue({ data: { items: [] } })
    getEndorsements.mockResolvedValue({ data: { items: [], count: 0 } })
    listForShop.mockResolvedValue({ data: [] })
  })

  it('keeps one authoritative primary fetcher and does not reload related data on cache-to-network transitions', async () => {
    getShop.mockResolvedValue({ data: shop('s1', 'Fresh') })
    cachedData = shop('s1', 'Cached')
    const { result, rerender } = renderHook(() => useBusinessProfilePublicData('s1'))
    await expect(primaryFetcher?.()).resolves.toEqual(shop('s1', 'Fresh'))
    await waitFor(() => expect(result.current.relatedLoading).toBe(false))
    expect(getShop).toHaveBeenCalledTimes(1)
    expect(getShopListings).toHaveBeenCalledTimes(1)
    expect(getEndorsements).toHaveBeenCalledTimes(1)
    expect(listForShop).toHaveBeenCalledTimes(1)

    cachedData = shop('s1', 'Fresh')
    rerender()
    expect(result.current.shopData?.name).toBe('Fresh')
    expect(getShopListings).toHaveBeenCalledTimes(1)
    expect(getEndorsements).toHaveBeenCalledTimes(1)
    expect(listForShop).toHaveBeenCalledTimes(1)
  })

  it('ignores late related responses from the previous shop', async () => {
    const oldListings = deferred<{ data: { items: Array<{ id: string }> } }>()
    const oldEndorsements = deferred<{ data: { items: Array<{ id: string }>; count: number } }>()
    getShopListings.mockReturnValueOnce(oldListings.promise)
    getEndorsements.mockReturnValueOnce(oldEndorsements.promise)
    listForShop.mockResolvedValueOnce({ data: [] })
    cachedData = shop('old')
    const { result, rerender } = renderHook(({ id }) => useBusinessProfilePublicData(id), { initialProps: { id: 'old' } })

    cachedData = shop('new')
    getShopListings.mockResolvedValueOnce({ data: { items: [{ id: 'new-listing' }] } })
    getEndorsements.mockResolvedValueOnce({ data: { items: [{ id: 'new-endorsement' }], count: 1 } })
    listForShop.mockResolvedValueOnce({ data: [{ id: 'new-discount' }] })
    rerender({ id: 'new' })
    await waitFor(() => expect(result.current.listings.map((item) => item.id)).toEqual(['new-listing']))

    await act(async () => {
      oldListings.resolve({ data: { items: [{ id: 'old-listing' }] } })
      oldEndorsements.resolve({ data: { items: [{ id: 'old-endorsement' }], count: 1 } })
      await Promise.all([oldListings.promise, oldEndorsements.promise])
    })
    expect(result.current.shopData?.id).toBe('new')
    expect(result.current.listings.map((item) => item.id)).toEqual(['new-listing'])
    expect(result.current.endorsements.map((item) => item.id)).toEqual(['new-endorsement'])
    expect(result.current.discountCodes.map((item) => item.id)).toEqual(['new-discount'])
  })
})
