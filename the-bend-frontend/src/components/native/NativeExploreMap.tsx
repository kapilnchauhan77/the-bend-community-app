import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'
import type { NativeExploreMapProps } from '@/native/discovery/types'

L.Icon.Default.mergeOptions({ iconRetinaUrl: markerIcon2x, iconUrl: markerIcon, shadowUrl: markerShadow })

export function NativeExploreMap({ businesses, userCoordinates, selectedId, onSelect, onOpen }: NativeExploreMapProps) {
  const activeId = selectedId
  const select = (id: string) => onSelect(id)
  const selected = businesses.find((business) => business.id === activeId) ?? null
  return <div className="native-explore-map" aria-label="Business map">
    <MapContainer center={userCoordinates ? [userCoordinates.latitude, userCoordinates.longitude] : businesses[0] ? [businesses[0].coordinates.latitude, businesses[0].coordinates.longitude] : [40.2, -79.5]} zoom={10} scrollWheelZoom={false} className="native-map-container">
      <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {businesses.map((business) => <Marker key={business.id} position={[business.coordinates.latitude, business.coordinates.longitude]} eventHandlers={{ click: () => select(business.id) }}><Popup><strong>{business.title}</strong><br />{business.label}<br />{business.supportingText}{business.distanceMiles !== null && <><br />{business.distanceMiles.toFixed(1)} mi from you</>}<br /><button type="button" onClick={() => select(business.id)} aria-label={business.title}>Preview</button><button type="button" onClick={() => onOpen(business.targetPath)}>Open details</button></Popup></Marker>)}
    </MapContainer>
    <div className="native-map-marker-list" aria-label="Map businesses">{businesses.map((business) => <button key={business.id} type="button" onClick={() => select(business.id)} aria-label={business.title}>{business.title}</button>)}</div>
    {selected && <div className="native-map-preview" role="dialog" aria-label={`${selected.title} preview`}><strong>{selected.title}</strong><p>{selected.label}{selected.supportingText ? ` · ${selected.supportingText}` : ''}</p>{selected.distanceMiles !== null && <p>{selected.distanceMiles.toFixed(1)} mi from you</p>}<button type="button" onClick={() => onOpen(selected.targetPath)}>Open details</button></div>}
  </div>
}

export default NativeExploreMap
