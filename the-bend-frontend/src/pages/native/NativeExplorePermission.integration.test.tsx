import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import NativeExplorePage from './NativeExplorePage'

const platform = {
  network: { getStatus: vi.fn(), addListener: vi.fn() },
  location: { getForegroundPosition: vi.fn() },
  cache: { put: vi.fn(), get: vi.fn(), remove: vi.fn(), clear: vi.fn(), stats: vi.fn() },
}

vi.mock('@/platform/createPlatformServices', () => ({ usePlatformServices: () => platform }))
vi.mock('@/services/listingApi', () => ({ listingApi: { browse: vi.fn(), getOpportunities: vi.fn() } }))
vi.mock('@/services/eventApi', () => ({ eventApi: { list: vi.fn() } }))
vi.mock('@/services/shopApi', () => ({ shopApi: { directory: vi.fn(), getShop: vi.fn() } }))
vi.mock('@/components/native/NativeExploreMap', () => ({ default: () => <div data-testid="lazy-map">Map</div> }))

import { listingApi } from '@/services/listingApi'
import { eventApi } from '@/services/eventApi'
import { shopApi } from '@/services/shopApi'

const deferred = <T,>() => {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

const farm = {
  id: 'farm-1', business_type: 'Farm', name: 'Westmoreland Farm', address: 'Main Street',
  status: 'active', latitude: 40, longitude: -79, avatar_url: null,
}
const emptyPage = { data: { items: [] } }

function Probe() {
  const location = useLocation()
  return <output data-testid="integration-location">{location.pathname}{location.search}</output>
}

function renderExplore(initialEntry = '/explore?type=businesses') {
  return render(<MemoryRouter initialEntries={[initialEntry]}><NativeExplorePage /><Probe /></MemoryRouter>)
}

beforeEach(() => {
  vi.clearAllMocks()
  platform.network.getStatus.mockResolvedValue('online')
  platform.network.addListener.mockResolvedValue({ remove: vi.fn().mockResolvedValue(undefined) })
  platform.cache.get.mockResolvedValue(null)
  platform.cache.put.mockResolvedValue(undefined)
  vi.mocked(listingApi.browse).mockResolvedValue(emptyPage as never)
  vi.mocked(listingApi.getOpportunities).mockResolvedValue(emptyPage as never)
  vi.mocked(eventApi.list).mockResolvedValue(emptyPage as never)
  vi.mocked(shopApi.directory).mockResolvedValue({ data: { items: [farm] } } as never)
  vi.mocked(shopApi.getShop).mockResolvedValue({ data: farm } as never)
})

afterEach(() => cleanup())

describe('NativeExplorePage production-path permission integration', () => {
  it.each([
    ['denied', { code: 'PERMISSION_DENIED', message: 'permission denied' }, true],
    ['unavailable', { code: 'TIMEOUT', message: 'service unavailable' }, true],
    ['cancelled', { code: 'ERR_CANCELED', message: 'cancelled' }, false],
  ] as const)('keeps the real business result and canonical URL after %s', async (_label, error, primer) => {
    const request = deferred<{ latitude: number; longitude: number; accuracy: number }>()
    platform.location.getForegroundPosition.mockReturnValueOnce(request.promise)
    renderExplore()
    await screen.findByRole('button', { name: 'Farm' })
    fireEvent.click(screen.getByRole('button', { name: 'Near me' }))
    expect(platform.location.getForegroundPosition).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('integration-location')).not.toHaveTextContent('near=true')
    expect(screen.getByRole('button', { name: 'Farm' })).toBeInTheDocument()
    await act(async () => { request.reject(error); await Promise.resolve() })
    await waitFor(() => expect(screen.getByTestId('integration-location')).not.toHaveTextContent('near=true'))
    expect(platform.location.getForegroundPosition).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Farm' })).toBeInTheDocument()
    if (primer) {
      expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Continue across Westmoreland' })).toBeInTheDocument()
    } else {
      expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Continue across Westmoreland' })).not.toBeInTheDocument()
    }
  })

  it('retries a real denied request once, and Continue does not request again', async () => {
    platform.location.getForegroundPosition
      .mockRejectedValueOnce({ code: 'PERMISSION_DENIED', message: 'denied' })
      .mockRejectedValueOnce({ code: 'PERMISSION_DENIED', message: 'denied again' })
    renderExplore()
    await screen.findByRole('button', { name: 'Farm' })
    fireEvent.click(screen.getByRole('button', { name: 'Near me' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument())
    expect(platform.location.getForegroundPosition).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(platform.location.getForegroundPosition).toHaveBeenCalledTimes(2))
    fireEvent.click(screen.getByRole('button', { name: 'Continue across Westmoreland' }))
    expect(platform.location.getForegroundPosition).toHaveBeenCalledTimes(2)
    expect(screen.getByTestId('integration-location')).not.toHaveTextContent('near=true')
    expect(screen.getByRole('button', { name: 'Farm' })).toBeInTheDocument()
  })

  it('does not request location while an eligible real map renders, then requests once on Use my location', async () => {
    renderExplore('/explore?mode=map')
    await screen.findByTestId('lazy-map')
    expect(platform.location.getForegroundPosition).toHaveBeenCalledTimes(0)
    fireEvent.click(screen.getByRole('button', { name: 'Use my location' }))
    await waitFor(() => expect(platform.location.getForegroundPosition).toHaveBeenCalledTimes(1))
  })

  it('keeps location calls at zero through real search, type, category, map, and hydration actions', async () => {
    renderExplore()
    await screen.findByRole('button', { name: 'Farm' })
    const search = screen.getByRole('searchbox')
    fireEvent.change(search, { target: { value: 'farm' } })
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 350)) })
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
    await screen.findByRole('button', { name: 'Farm' })
    fireEvent.click(screen.getByRole('tab', { name: 'Listings' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Businesses' }))
    await screen.findByRole('button', { name: 'Farm' })
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Farm', exact: true }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Map' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Map' }))
    expect(platform.location.getForegroundPosition).toHaveBeenCalledTimes(0)
  })

  it('clears a stale Near URL without requesting location and retains the real list', async () => {
    renderExplore('/explore?type=businesses&near=true')
    await screen.findByRole('button', { name: 'Farm' })
    expect(platform.location.getForegroundPosition).toHaveBeenCalledTimes(0)
    expect(screen.getByTestId('integration-location')).not.toHaveTextContent('near=true')
  })

  it('does not restore an old Businesses Near URL when the pending request changes type', async () => {
    const request = deferred<{ latitude: number; longitude: number; accuracy: number }>()
    platform.location.getForegroundPosition.mockReturnValueOnce(request.promise)
    renderExplore('/explore?q=old&type=businesses&category=Farm')
    await screen.findByRole('button', { name: 'Farm' })
    fireEvent.click(screen.getByRole('button', { name: 'Near me' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Events' }))
    await waitFor(() => expect(screen.getByTestId('integration-location')).toHaveTextContent('type=events'))
    await act(async () => { request.resolve({ latitude: 40, longitude: -79, accuracy: 5 }); await Promise.resolve() })
    await waitFor(() => expect(screen.getByTestId('integration-location')).toHaveTextContent('type=events'))
    expect(screen.getByTestId('integration-location')).not.toHaveTextContent('near=true')
    expect(platform.location.getForegroundPosition).toHaveBeenCalledTimes(1)
  })

  it('applies a pending Near grant to the current Businesses query without losing its refinements', async () => {
    const request = deferred<{ latitude: number; longitude: number; accuracy: number }>()
    platform.location.getForegroundPosition.mockReturnValueOnce(request.promise)
    renderExplore('/explore?type=businesses')
    await screen.findByRole('button', { name: 'Farm' })
    fireEvent.click(screen.getByRole('button', { name: 'Near me' }))
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Farm', exact: true }))
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'new' } })
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 350)) })
    await waitFor(() => expect(screen.getByTestId('integration-location')).toHaveTextContent('q=new'))
    await act(async () => { request.resolve({ latitude: 40, longitude: -79, accuracy: 5 }); await Promise.resolve() })
    await waitFor(() => expect(screen.getByTestId('integration-location')).toHaveTextContent('near=true'))
    expect(screen.getByTestId('integration-location')).toHaveTextContent('q=new')
    expect(screen.getByTestId('integration-location')).toHaveTextContent('category=Farm')
    expect(platform.location.getForegroundPosition).toHaveBeenCalledTimes(1)
  })
})
