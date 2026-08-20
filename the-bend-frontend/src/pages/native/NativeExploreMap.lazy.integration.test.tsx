import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import NativeExplorePage from './NativeExplorePage'

const harness = vi.hoisted(() => ({
  evaluated: false,
  fixture: { groups: [{ kind: 'business', heading: 'Businesses', state: { status: 'loading', data: [], source: 'network', cachedAt: null, error: null, retry: vi.fn() } }], typed: null, mapBusinesses: [], userCoordinates: null, online: false, location: { status: 'idle' }, requestLocation: vi.fn() },
}))

vi.mock('@/hooks/useNativeExplore', () => ({ useNativeExplore: () => harness.fixture }))
vi.mock('@/components/native/NativeExploreMap', () => {
  harness.evaluated = true
  return { default: () => <div data-testid="lazy-map-sentinel">Lazy map rendered</div> }
})

beforeEach(() => { harness.evaluated = false; harness.fixture.online = false; harness.fixture.mapBusinesses = [] })
afterEach(() => cleanup())

describe('NativeExplorePage lazy map boundary', () => {
  it('defers module evaluation until an eligible online Map is selected, then unmounts on List', async () => {
    const { rerender } = render(<MemoryRouter initialEntries={['/explore?mode=map']}><NativeExplorePage /></MemoryRouter>)
    expect(harness.evaluated).toBe(false)
    expect(screen.queryByTestId('lazy-map-sentinel')).not.toBeInTheDocument()

    harness.fixture.online = true
    rerender(<MemoryRouter initialEntries={['/explore?mode=map']}><NativeExplorePage /></MemoryRouter>)
    expect(harness.evaluated).toBe(false)
    expect(screen.queryByTestId('lazy-map-sentinel')).not.toBeInTheDocument()

    const mapBusiness = { id: 'map-1', kind: 'business', label: 'Farm', title: 'Map Farm', supportingText: 'Main Street', thumbnailUrl: null, mediaFit: 'contain', targetPath: '/business/map-1', coordinates: { latitude: 40, longitude: -79 }, urgent: false, distanceMiles: null }
    harness.fixture.groups[0].state.status = 'success'
    harness.fixture.groups[0].state.data = [mapBusiness]
    harness.fixture.mapBusinesses = [mapBusiness]
    rerender(<MemoryRouter initialEntries={['/explore?mode=map']}><NativeExplorePage /></MemoryRouter>)
    await act(async () => { await vi.dynamicImportSettled() })
    expect(await screen.findByTestId('lazy-map-sentinel')).toBeInTheDocument()
    expect(harness.evaluated).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'List' }))
    expect(screen.queryByTestId('lazy-map-sentinel')).not.toBeInTheDocument()
  })

  it('keeps the map module unevaluated while map availability is pending', () => {
    render(<MemoryRouter initialEntries={['/explore?mode=map']}><NativeExplorePage /></MemoryRouter>)
    expect(harness.evaluated).toBe(false)
    expect(screen.queryByTestId('lazy-map-sentinel')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Map' })).not.toBeInTheDocument()
  })
})
