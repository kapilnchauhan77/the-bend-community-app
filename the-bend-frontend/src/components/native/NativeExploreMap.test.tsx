import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useState, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NativeExploreMap } from './NativeExploreMap'

vi.mock('react-leaflet', () => ({
  MapContainer: ({ center, children }: { center: [number, number]; children: ReactNode }) => <div data-testid="map-container" data-center={center.join(',')}>{children}</div>,
  Marker: ({ eventHandlers, children }: { eventHandlers?: { click?: () => void }; children: ReactNode }) => <div><button type="button" onClick={eventHandlers?.click}>Marker</button>{children}</div>,
  Popup: ({ children }: { children: ReactNode }) => <div role="region" aria-label="Marker popup">{children}</div>,
  TileLayer: ({ attribution }: { attribution: string }) => <div>{attribution}</div>,
}))

const business = { id: 'b1', kind: 'business' as const, label: 'Farm', title: 'Westmoreland Farm', supportingText: 'Main Street', thumbnailUrl: null, targetPath: '/business/b1', coordinates: { latitude: 40, longitude: -79 }, urgent: false, distanceMiles: 2.4 }
afterEach(() => cleanup())

describe('NativeExploreMap', () => {
  it('shows a business marker preview before opening details', () => {
    const onOpen = vi.fn()
    function Wrapper() { const [selectedId, setSelectedId] = useState<string | null>(null); return <NativeExploreMap businesses={[business]} userCoordinates={null} selectedId={selectedId} onSelect={setSelectedId} onOpen={onOpen} /> }
    render(<Wrapper />)
    fireEvent.click(screen.getAllByRole('button', { name: /Westmoreland Farm/i })[0])
    expect(screen.getByText(/OpenStreetMap contributors/)).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Marker popup' })).toHaveTextContent('Westmoreland Farm')
    expect(screen.getByRole('region', { name: 'Marker popup' })).toHaveTextContent('Farm')
    expect(screen.getByRole('region', { name: 'Marker popup' })).toHaveTextContent('Main Street')
    expect(screen.getByRole('region', { name: 'Marker popup' })).toHaveTextContent('2.4 mi from you')
    expect(screen.getByRole('dialog')).toHaveTextContent('Farm')
    expect(onOpen).not.toHaveBeenCalled()
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Open details/i }))
    expect(onOpen).toHaveBeenCalledWith('/business/b1')
  })

  it('centers on the user when available and otherwise the first eligible business', () => {
    const { rerender } = render(<NativeExploreMap businesses={[business]} userCoordinates={{ latitude: 12, longitude: -34 }} selectedId={null} onSelect={vi.fn()} onOpen={vi.fn()} />)
    expect(screen.getAllByTestId('map-container')[0]).toHaveAttribute('data-center', '12,-34')
    rerender(<NativeExploreMap businesses={[business]} userCoordinates={null} selectedId={null} onSelect={vi.fn()} onOpen={vi.fn()} />)
    expect(screen.getByTestId('map-container')).toHaveAttribute('data-center', '40,-79')
  })

  it('treats selectedId as controlled and exposes Open details inside the marker popup', () => {
    const onOpen = vi.fn()
    const { rerender } = render(<NativeExploreMap businesses={[business]} userCoordinates={null} selectedId={null} onSelect={vi.fn()} onOpen={onOpen} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Marker' })[0])
    expect(screen.getAllByRole('button', { name: 'Open details' }).length).toBeGreaterThan(0)
    fireEvent.click(screen.getAllByRole('button', { name: 'Open details' })[0])
    expect(onOpen).toHaveBeenCalledWith('/business/b1')
    rerender(<NativeExploreMap businesses={[business]} userCoordinates={null} selectedId={null} onSelect={vi.fn()} onOpen={onOpen} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
