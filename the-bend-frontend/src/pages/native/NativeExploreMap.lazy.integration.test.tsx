import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import NativeExplorePage from './NativeExplorePage'

const harness = vi.hoisted(() => ({
  evaluated: false,
  fixture: { groups: [], typed: null, mapBusinesses: [], userCoordinates: null, online: false, location: { status: 'idle' }, requestLocation: vi.fn() },
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

    harness.fixture.mapBusinesses = [{ id: 'map-1', kind: 'business', label: 'Farm', title: 'Map Farm', supportingText: 'Main Street', thumbnailUrl: null, targetPath: '/business/map-1', coordinates: { latitude: 40, longitude: -79 }, urgent: false, distanceMiles: null }]
    rerender(<MemoryRouter initialEntries={['/explore?mode=map']}><NativeExplorePage /></MemoryRouter>)
    expect(await screen.findByTestId('lazy-map-sentinel')).toBeInTheDocument()
    expect(harness.evaluated).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'List' }))
    expect(screen.queryByTestId('lazy-map-sentinel')).not.toBeInTheDocument()
  })
})
