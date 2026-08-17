import { useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import { usePlatformServices } from '@/platform/createPlatformServices';
import { PermissionPrimer } from '@/components/native/PermissionPrimer';

// Fix Leaflet's default marker icons under Vite/bundlers (asset URLs).
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});

const BORDER = 'hsl(35, 18%, 84%)';

// Virginia fallback view when no pin exists yet.
const FALLBACK_CENTER: [number, number] = [37.5, -78.5];
const FALLBACK_ZOOM = 7;
const PIN_ZOOM = 14;

interface LocationPinEditorProps {
  lat: number | null;
  lng: number | null;
  onChange: (lat: number, lng: number) => void;
}

// Captures map clicks so a first-time user can drop a pin anywhere.
function ClickToPlace({ onChange }: { onChange: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onChange(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function LocationPinEditor({ lat, lng, onChange }: LocationPinEditorProps) {
  const services = usePlatformServices();
  const [locationConfirmed, setLocationConfirmed] = useState(false);
  const hasPin = lat != null && lng != null;
  const markerRef = useRef<L.Marker | null>(null);

  const center: [number, number] = hasPin ? [lat as number, lng as number] : FALLBACK_CENTER;
  const zoom = hasPin ? PIN_ZOOM : FALLBACK_ZOOM;

  // Stable dragend handler that reads the marker's final position.
  const dragHandlers = useMemo(
    () => ({
      dragend() {
        const marker = markerRef.current;
        if (!marker) return;
        const pos = marker.getLatLng();
        onChange(pos.lat, pos.lng);
      },
    }),
    [onChange],
  );

  return (
    <div className="space-y-1.5">
      {!locationConfirmed && <PermissionPrimer title="Use your current location" description="Your location is requested only after you choose to use it." onConfirm={async () => { setLocationConfirmed(true); try { const position = await services.location.getForegroundPosition(); onChange(position.latitude, position.longitude); } catch { setLocationConfirmed(false); } }} />}
      <div
        className="overflow-hidden rounded-lg border"
        style={{ borderColor: BORDER, height: 260 }}
      >
        <MapContainer
          center={center}
          zoom={zoom}
          scrollWheelZoom={false}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {!hasPin && <ClickToPlace onChange={onChange} />}
          {hasPin && (
            <Marker
              position={[lat as number, lng as number]}
              draggable
              eventHandlers={dragHandlers}
              ref={markerRef}
            />
          )}
        </MapContainer>
      </div>
      <p className="text-[11px] text-gray-400">
        Drag the pin (or click the map) to fine-tune your location.
      </p>
    </div>
  );
}
