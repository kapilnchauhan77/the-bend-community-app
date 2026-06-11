import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { LatLngBoundsExpression } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import api from '@/services/api';
import { businessTypeLabel } from '@/lib/businessTypes';

// Fix Leaflet's default marker icons under Vite/bundlers (asset URLs).
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});

const PRIMARY = 'hsl(160, 25%, 24%)';
const BRONZE = 'hsl(35, 45%, 42%)';
const BORDER = 'hsl(35, 18%, 84%)';

interface MapBusiness {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  avatar_url: string | null;
  address: string | null;
}

interface Endorser {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  avatar_url: string | null;
  business_type: string;
  address: string | null;
  distance_miles: number;
}

interface EndorsementMapResponse {
  center: MapBusiness;
  endorsers: Endorser[];
}

interface EndorsementMapProps {
  shopId: string;
  shopName: string;
}

// Distinct center marker: primary-green pin with a white star.
const centerIcon = L.divIcon({
  className: '',
  html: `
    <div style="
      position: relative;
      width: 30px;
      height: 30px;
      border-radius: 9999px;
      background: ${PRIMARY};
      border: 3px solid #fff;
      box-shadow: 0 2px 6px rgba(0,0,0,0.35);
      display: flex;
      align-items: center;
      justify-content: center;
    ">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
        <path d="M12 2l2.95 5.98 6.6.96-4.78 4.66 1.13 6.57L12 17.02l-5.9 3.11 1.13-6.57L2.45 8.94l6.6-.96L12 2z"/>
      </svg>
    </div>
  `,
  iconSize: [30, 30],
  iconAnchor: [15, 15],
  popupAnchor: [0, -15],
});

// Inner helper that fits the map to all pins once, capping zoom.
function FitBounds({ bounds }: { bounds: LatLngBoundsExpression }) {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
  }, [map, bounds]);
  return null;
}

export default function EndorsementMap({ shopId, shopName }: EndorsementMapProps) {
  const [data, setData] = useState<EndorsementMapResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    api
      .get<EndorsementMapResponse>(`/shops/${shopId}/endorsement-map`)
      .then((res) => {
        if (active) setData(res.data);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [shopId]);

  // Render nothing until we have meaningful data to show.
  if (failed || !data) return null;

  const { center, endorsers } = data;
  if (center.latitude == null || center.longitude == null) return null;
  if (endorsers.length === 0) return null;

  const centerLat = center.latitude;
  const centerLng = center.longitude;

  const bounds: LatLngBoundsExpression = [
    [centerLat, centerLng],
    ...endorsers.map((e) => [e.latitude, e.longitude] as [number, number]),
  ];

  return (
    <div className="mb-8">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-8 h-[2px]" style={{ backgroundColor: BRONZE }} />
        <h2 className="text-xl font-bold font-serif text-[hsl(30,15%,18%)] tracking-wide">
          Local Supporters
        </h2>
        <span className="text-xs text-[hsl(30,10%,55%)] bg-[hsl(35,15%,90%)] px-2 py-0.5 rounded-full font-medium">
          {endorsers.length}
        </span>
      </div>
      <p className="text-sm text-[hsl(30,10%,48%)] mb-4 pl-11">
        Businesses within 50 miles that endorse {shopName}.
      </p>

      <div
        className="overflow-hidden rounded-lg border"
        style={{ borderColor: BORDER, height: 320 }}
      >
        <MapContainer
          center={[centerLat, centerLng]}
          zoom={11}
          scrollWheelZoom={false}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FitBounds bounds={bounds} />

          <Marker position={[centerLat, centerLng]} icon={centerIcon}>
            <Popup>
              <span className="font-semibold text-[hsl(30,15%,18%)]">{center.name}</span>
              {center.address && (
                <span className="block text-[hsl(30,10%,45%)]">{center.address}</span>
              )}
            </Popup>
          </Marker>

          {endorsers.map((e) => (
            <Marker key={e.id} position={[e.latitude, e.longitude]}>
              <Popup>
                <Link
                  to={`/business/${e.id}`}
                  className="font-semibold text-[hsl(160,25%,24%)] hover:underline"
                >
                  {e.name}
                </Link>
                <span className="block text-[hsl(30,10%,45%)]">
                  {businessTypeLabel(e.business_type)}
                </span>
                {e.address && (
                  <span className="block text-[hsl(30,10%,45%)]">{e.address}</span>
                )}
                <span className="block text-[hsl(35,45%,35%)] font-medium mt-0.5">
                  {e.distance_miles.toFixed(1)} mi away
                </span>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}
