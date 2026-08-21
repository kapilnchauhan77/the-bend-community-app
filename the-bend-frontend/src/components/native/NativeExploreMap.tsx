import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet'
import { useEffect } from 'react'
import 'leaflet/dist/leaflet.css'
import type { NativeExploreMapProps } from '@/native/discovery/types'
import { nativeBusinessMarkerIcon } from '@/components/native/nativeBusinessMarkerIcon'

function MapViewport({ center }: { center: [number, number] }) {
  const map = useMap()
  const [latitude, longitude] = center
  useEffect(() => { map.setView([latitude, longitude], map.getZoom()) }, [latitude, longitude, map])
  return null
}

export function NativeExploreMap({ businesses, userCoordinates, selectedId, onSelect, onOpen }: NativeExploreMapProps) {
  const activeId = selectedId
  const select = (id: string) => onSelect(id)
  const selected = businesses.find((business) => business.id === activeId) ?? null
  const center: [number, number] = userCoordinates ? [userCoordinates.latitude, userCoordinates.longitude] : businesses[0] ? [businesses[0].coordinates.latitude, businesses[0].coordinates.longitude] : [40.2, -79.5]
  return <div className="native-explore-map">
    <MapContainer center={center} zoom={10} scrollWheelZoom={false} className="native-map-container" role="region" aria-label="Business map">
      <MapViewport center={center} />
      <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {businesses.map((business) => <Marker key={business.id} icon={nativeBusinessMarkerIcon} position={[business.coordinates.latitude, business.coordinates.longitude]} alt={business.title} title={business.title} eventHandlers={{ click: () => select(business.id) }}><Popup><strong>{business.title}</strong><br />{business.label}<br />{business.supportingText}{business.distanceMiles !== null && <><br />{business.distanceMiles.toFixed(1)} mi from you</>}<br /><button type="button" className="native-map-open-control" onClick={() => onOpen(business.targetPath)}>Open {business.title} details</button></Popup></Marker>)}
    </MapContainer>
    <div className="native-map-marker-list" aria-label="Map businesses">{businesses.map((business) => <button key={business.id} type="button" onClick={() => select(business.id)} aria-label={`Show ${business.title} on map`}>{business.title}</button>)}</div>
    {selected && <div className="native-map-preview" role="dialog" aria-label={`${selected.title} preview`}><strong>{selected.title}</strong><p>{selected.label}{selected.supportingText ? ` · ${selected.supportingText}` : ''}</p>{selected.distanceMiles !== null && <p>{selected.distanceMiles.toFixed(1)} mi from you</p>}<button type="button" className="native-map-open-control" onClick={() => onOpen(selected.targetPath)}>Open {selected.title} details</button></div>}
  </div>
}

export default NativeExploreMap
