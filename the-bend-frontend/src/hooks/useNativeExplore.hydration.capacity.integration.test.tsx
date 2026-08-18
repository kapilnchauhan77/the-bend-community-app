import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useNativeExplore } from './useNativeExplore'
import { shopApi } from '@/services/shopApi'
import { listingApi } from '@/services/listingApi'
import { eventApi } from '@/services/eventApi'

const deferred = <T,>() => { let resolve!: (value: T) => void; let reject!: (reason: unknown) => void; const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej }); return { promise, resolve, reject } }
const shop = (id: string, coordinates: { latitude: number; longitude: number } | null = null) => ({ id, business_type: 'Farm', name: `Farm ${id}`, address: 'Main', status: 'active', latitude: coordinates?.latitude ?? null, longitude: coordinates?.longitude ?? null })
const platform = { network: { getStatus: vi.fn(), addListener: vi.fn() }, location: { getForegroundPosition: vi.fn() }, cache: { put: vi.fn(), get: vi.fn() } }
let handler: ((status: 'online' | 'offline') => void) | null = null
vi.mock('@/platform/createPlatformServices', () => ({ usePlatformServices: () => platform }))
vi.mock('@/services/listingApi', () => ({ listingApi: { browse: vi.fn(), getOpportunities: vi.fn() } }))
vi.mock('@/services/eventApi', () => ({ eventApi: { list: vi.fn() } }))
vi.mock('@/services/shopApi', () => ({ shopApi: { directory: vi.fn(), getShop: vi.fn() } }))
const typedQuery = { q: '', type: 'businesses' as const, category: null, urgency: null, sort: null, mode: 'list' as const, near: false }
const allQuery = { ...typedQuery, type: 'all' as const }

beforeEach(() => { vi.clearAllMocks(); handler = null; platform.network.getStatus.mockResolvedValue('online'); platform.network.addListener.mockImplementation(async (fn: (status: 'online' | 'offline') => void) => { handler = fn; return { remove: vi.fn().mockResolvedValue(undefined) } }); platform.cache.get.mockResolvedValue(null); platform.cache.put.mockResolvedValue(undefined); vi.mocked(listingApi.browse).mockResolvedValue({ data: { items: [] } } as never); vi.mocked(listingApi.getOpportunities).mockResolvedValue({ data: { items: [] } } as never); vi.mocked(eventApi.list).mockResolvedValue({ data: { items: [] } } as never) })
afterEach(() => cleanup())

describe('useNativeExplore hydration capacity integration', () => {
  it('hydrates only the first five All businesses', async () => {
    const items = Array.from({ length: 10 }, (_, index) => shop(`all-${index}`))
    vi.mocked(shopApi.directory).mockResolvedValue({ data: { items } } as never)
    vi.mocked(shopApi.getShop).mockResolvedValue({ data: shop('detail', { latitude: 40, longitude: -79 }) } as never)
    renderHook(() => useNativeExplore(allQuery), { reactStrictMode: false })
    await waitFor(() => expect(shopApi.getShop).toHaveBeenCalledTimes(5))
    expect(shopApi.getShop.mock.calls.map(([id]) => id)).toEqual(['all-0', 'all-1', 'all-2', 'all-3', 'all-4'])
  })

  it('hydrates only the first twenty typed Businesses', async () => {
    const items = Array.from({ length: 25 }, (_, index) => shop(`typed-${index}`))
    vi.mocked(shopApi.directory).mockResolvedValue({ data: { items } } as never)
    vi.mocked(shopApi.getShop).mockResolvedValue({ data: shop('detail', { latitude: 40, longitude: -79 }) } as never)
    renderHook(() => useNativeExplore(typedQuery), { reactStrictMode: false })
    await waitFor(() => expect(shopApi.getShop).toHaveBeenCalledTimes(20))
    expect(shopApi.getShop.mock.calls.map(([id]) => id)).toEqual(Array.from({ length: 20 }, (_, index) => `typed-${index}`))
  })

  it('keeps real hydration concurrency at four while progressing all twenty candidates', async () => {
    const items = Array.from({ length: 20 }, (_, index) => shop(`pending-${index}`)); const pending = items.map(() => deferred<{ data: ReturnType<typeof shop> }>()); let active = 0; let maximum = 0
    vi.mocked(shopApi.directory).mockResolvedValue({ data: { items } } as never)
    vi.mocked(shopApi.getShop).mockImplementation((id) => { const index = Number(String(id).split('-')[1]); active += 1; maximum = Math.max(maximum, active); const request = pending[index].promise; void request.finally(() => { active -= 1 }); return request as never })
    renderHook(() => useNativeExplore(typedQuery), { reactStrictMode: false })
    await waitFor(() => expect(shopApi.getShop).toHaveBeenCalledTimes(4))
    for (let index = 0; index < 20; index += 1) { pending[index].resolve({ data: shop(`pending-${index}`, { latitude: 40, longitude: -79 }) }); await waitFor(() => expect(shopApi.getShop).toHaveBeenCalledTimes(Math.min(index + 5, 20))) }
    expect(maximum).toBeLessThanOrEqual(4)
  })

  it('does not exceed four active details across an old-to-new context transition', async () => {
    const oldItems = Array.from({ length: 4 }, (_, index) => shop(`old-${index}`)); const newItems = Array.from({ length: 4 }, (_, index) => shop(`new-${index}`)); const requests = new Map<string, ReturnType<typeof deferred<{ data: ReturnType<typeof shop> }>>>(); let active = 0; let maximum = 0
    vi.mocked(shopApi.directory).mockResolvedValueOnce({ data: { items: oldItems } } as never).mockResolvedValue({ data: { items: newItems } } as never)
    vi.mocked(shopApi.getShop).mockImplementation((id) => { const request = deferred<{ data: ReturnType<typeof shop> }>(); requests.set(id, request); active += 1; maximum = Math.max(maximum, active); void request.promise.finally(() => { active -= 1 }); return request.promise as never })
    const { result, rerender } = renderHook(({ q }) => useNativeExplore({ ...typedQuery, q }), { initialProps: { q: 'old' }, reactStrictMode: false })
    await waitFor(() => expect(shopApi.getShop).toHaveBeenCalledTimes(4))
    rerender({ q: 'new' })
    await act(async () => { await Promise.resolve() })
    expect(shopApi.getShop.mock.calls.filter(([id]) => String(id).startsWith('new-'))).toHaveLength(0)
    requests.get('old-0')?.resolve({ data: shop('old-0', { latitude: 40, longitude: -79 }) })
    await waitFor(() => expect(shopApi.getShop.mock.calls.filter(([id]) => String(id).startsWith('new-')).length).toBe(1))
    expect(maximum).toBeLessThanOrEqual(4)
    for (const [id, request] of requests) if (String(id).startsWith('old-')) request.resolve({ data: shop(String(id), { latitude: 40, longitude: -79 }) })
    await waitFor(() => expect(shopApi.getShop.mock.calls.filter(([id]) => String(id).startsWith('new-'))).toHaveLength(4))
    for (const [id, request] of requests) if (String(id).startsWith('new-')) request.resolve({ data: shop(String(id), { latitude: 41, longitude: -80 }) })
    await waitFor(() => expect(result.current.mapBusinesses.map((item) => item.id).sort()).toEqual(['new-0', 'new-1', 'new-2', 'new-3']))
  })

  it('ignores invalid and failed details while valid siblings continue hydrating', async () => {
    const items = [shop('nan'), shop('bad'), shop('failed'), shop('valid')]
    vi.mocked(shopApi.directory).mockResolvedValue({ data: { items } } as never)
    vi.mocked(shopApi.getShop).mockImplementation(async (id) => { if (id === 'nan') return { data: { ...shop(id), latitude: Number.NaN, longitude: -79 } } as never; if (id === 'bad') return { data: { ...shop(id), latitude: 91, longitude: -79 } } as never; if (id === 'failed') throw new Error('failed'); return { data: shop(id, { latitude: 40, longitude: -79 }) } as never })
    const { result } = renderHook(() => useNativeExplore(typedQuery), { reactStrictMode: false })
    await waitFor(() => expect(result.current.mapBusinesses.map((item) => item.id)).toEqual(['valid']))
    expect(shopApi.getShop).toHaveBeenCalledTimes(4)
  })

  it('skips public-coordinate businesses and all non-business result kinds', async () => {
    const coordinateBusiness = shop('public', { latitude: 40, longitude: -79 }); vi.mocked(shopApi.directory).mockResolvedValue({ data: { items: [coordinateBusiness] } } as never); vi.mocked(shopApi.getShop).mockResolvedValue({ data: shop('unexpected', { latitude: 40, longitude: -79 }) } as never)
    const { result } = renderHook(() => useNativeExplore(typedQuery), { reactStrictMode: false })
    await act(async () => { await Promise.resolve() })
    expect(shopApi.getShop).not.toHaveBeenCalled()
    expect(result.current.mapBusinesses.map((item) => item.id)).toEqual(['public'])
    vi.mocked(eventApi.list).mockResolvedValue({ data: { items: [{ id: 'event-1', title: 'Event', category: 'community', start_date: '2026-12-01T12:00:00Z', location: 'Main' }] } } as never)
    const events = renderHook(() => useNativeExplore({ ...typedQuery, type: 'events' }), { reactStrictMode: false })
    await waitFor(() => expect(events.result.current.typed?.state.status).toBe('success'))
    expect(shopApi.getShop).not.toHaveBeenCalled()
    expect(handler).toBeTypeOf('function')
  })

  it('does not duplicate pool-queued IDs when typed retry is requested repeatedly', async () => {
    const items = Array.from({ length: 20 }, (_, index) => shop(`queued-${index}`)); const first = items.slice(0, 4).map(() => deferred<{ data: ReturnType<typeof shop> }>()); const calls = new Map<string, number>()
    vi.mocked(shopApi.directory).mockResolvedValue({ data: { items } } as never)
    vi.mocked(shopApi.getShop).mockImplementation((id) => { calls.set(String(id), (calls.get(String(id)) ?? 0) + 1); const index = Number(String(id).split('-')[1]); return (index < 4 ? first[index].promise : Promise.resolve({ data: shop(String(id), { latitude: 40, longitude: -79 }) })) as never })
    platform.network.getStatus.mockResolvedValue('online')
    const { result } = renderHook(() => useNativeExplore(typedQuery), { reactStrictMode: false })
    await waitFor(() => expect(shopApi.getShop).toHaveBeenCalledTimes(4))
    await act(async () => { void result.current.typed?.state.retry(); void result.current.typed?.state.retry(); void result.current.typed?.state.retry(); await Promise.resolve() })
    first.forEach((request, index) => request.resolve({ data: shop(`queued-${index}`, { latitude: 40, longitude: -79 }) }))
    await waitFor(() => expect(shopApi.getShop).toHaveBeenCalledTimes(20))
    expect([...calls.values()].every((count) => count === 1)).toBe(true)
  })
})
