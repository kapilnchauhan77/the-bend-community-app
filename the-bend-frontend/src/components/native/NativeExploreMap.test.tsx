import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { useState, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NativeExploreMap, nativeBusinessMarkerIcon } from './NativeExploreMap'

const mapHarness = vi.hoisted(() => ({ setView: vi.fn(), getZoom: vi.fn(() => 11) }))

vi.mock('react-leaflet', () => ({
  MapContainer: ({ center, children, ...props }: { center: [number, number]; children: ReactNode; role?: string; 'aria-label'?: string }) => <div data-testid="map-container" data-center={center.join(',')} {...props}>{children}</div>,
  Marker: ({ eventHandlers, children, alt, title }: { eventHandlers?: { click?: () => void }; children: ReactNode; alt?: string; title?: string }) => <div><button type="button" aria-label={alt} title={title} onClick={eventHandlers?.click}>{alt ?? 'Marker'}</button>{children}</div>,
  Popup: ({ children }: { children: ReactNode }) => <div role="region" aria-label="Marker popup">{children}</div>,
  TileLayer: ({ attribution }: { attribution: string }) => <div>{attribution}</div>,
  useMap: () => mapHarness,
}))

const business = { id: 'b1', kind: 'business' as const, label: 'Farm', title: 'Westmoreland Farm', supportingText: 'Main Street', thumbnailUrl: null, mediaFit: 'contain' as const, targetPath: '/business/b1', coordinates: { latitude: 40, longitude: -79 }, urgent: false, distanceMiles: 2.4 }
const nativeCss = readFileSync('src/styles/native.css', 'utf8')
afterEach(() => cleanup())

describe('NativeExploreMap', () => {
  it('exposes a labelled business map and named business controls', () => {
    render(<NativeExploreMap businesses={[business]} userCoordinates={null} selectedId={null} onSelect={vi.fn()} onOpen={vi.fn()} />)
    expect(screen.getByRole('region', { name: 'Business map' })).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Westmoreland Farm' }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: 'Show Westmoreland Farm on map' })).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Westmoreland Farm' }))
    expect(screen.getByRole('button', { name: 'Open Westmoreland Farm details' })).toBeInTheDocument()
  })

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
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Open Westmoreland Farm details' }))
    expect(onOpen).toHaveBeenCalledWith('/business/b1')
  })

  it('centers on the user when available and otherwise the first eligible business', () => {
    const { rerender } = render(<NativeExploreMap businesses={[business]} userCoordinates={null} selectedId={null} onSelect={vi.fn()} onOpen={vi.fn()} />)
    expect(screen.getByTestId('map-container')).toHaveAttribute('data-center', '40,-79')
    rerender(<NativeExploreMap businesses={[business]} userCoordinates={{ latitude: 12, longitude: -34 }} selectedId={null} onSelect={vi.fn()} onOpen={vi.fn()} />)
    expect(screen.getByTestId('map-container')).toHaveAttribute('data-center', '12,-34')
    expect(mapHarness.setView).toHaveBeenCalledWith([12, -34], 11)
  })

  it('keeps map business selectors from shrinking into vertical text columns', () => {
    const style = document.createElement('style')
    style.textContent = nativeCss
    document.head.append(style)
    const businesses = ['Inn at Montross', 'Leedstown’s Plants & Produce', 'ProLine Group', 'Stewart Electrical Services', 'Westmoreland County Economic Development']
      .map((title, index) => ({ ...business, id: `b${index + 1}`, title }))

    try {
      const { container } = render(<div className="native-app"><NativeExploreMap businesses={businesses} userCoordinates={null} selectedId={null} onSelect={vi.fn()} onOpen={vi.fn()} /></div>)
      const selectorRow = container.querySelector('.native-map-marker-list')
      const selectorButtons = [...(selectorRow?.querySelectorAll('button') ?? [])]

      expect(getComputedStyle(selectorRow!).overflowX).toBe('auto')
      expect(selectorButtons).toHaveLength(5)
      expect(selectorButtons.map((button) => getComputedStyle(button).flexShrink)).toEqual(['0', '0', '0', '0', '0'])
    } finally {
      style.remove()
    }
  })

  it('keeps Leaflet marker and zoom targets at least 44 points', () => {
    expect(nativeBusinessMarkerIcon.options.iconSize).toEqual([44, 44])
    expect(nativeCss).toMatch(/\.native-app\s+\.leaflet-control-zoom\s+a\s*\{[^}]*min-width:\s*44px/i)
    expect(nativeCss).toMatch(/\.native-app\s+\.leaflet-control-zoom\s+a\s*\{[^}]*min-height:\s*44px/i)
  })

  it('treats selectedId as controlled and exposes Open details inside the marker popup', () => {
    const onOpen = vi.fn()
    const { rerender } = render(<NativeExploreMap businesses={[business]} userCoordinates={null} selectedId={null} onSelect={vi.fn()} onOpen={onOpen} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Westmoreland Farm' })[0])
    expect(screen.getAllByRole('button', { name: 'Open Westmoreland Farm details' }).length).toBeGreaterThan(0)
    fireEvent.click(screen.getAllByRole('button', { name: 'Open Westmoreland Farm details' })[0])
    expect(onOpen).toHaveBeenCalledWith('/business/b1')
    rerender(<NativeExploreMap businesses={[business]} userCoordinates={null} selectedId={null} onSelect={vi.fn()} onOpen={onOpen} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
