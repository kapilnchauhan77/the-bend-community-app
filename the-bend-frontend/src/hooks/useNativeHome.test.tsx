import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useNativeHome } from './useNativeHome'

vi.mock('@/services/listingApi', () => ({ listingApi: {
  browse: vi.fn().mockResolvedValue({ data: { items: [] } }),
  getOpportunities: vi.fn().mockResolvedValue({ data: { items: [] } }),
  getStories: vi.fn().mockResolvedValue({ data: { items: [] } }),
} }))
vi.mock('@/services/eventApi', () => ({ eventApi: { getUpcoming: vi.fn().mockResolvedValue({ data: { items: [] } }) } }))
vi.mock('@/services/sponsorApi', () => ({ sponsorApi: { list: vi.fn().mockResolvedValue({ data: { items: [] } }) } }))
vi.mock('@/platform/createPlatformServices', () => ({ usePlatformServices: () => ({ network: { getStatus: vi.fn().mockResolvedValue('online'), addListener: vi.fn().mockResolvedValue({ remove: vi.fn() }) }, cache: { put: vi.fn().mockResolvedValue(undefined), get: vi.fn().mockResolvedValue(null) } }) }))

describe('useNativeHome', () => {
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
})
