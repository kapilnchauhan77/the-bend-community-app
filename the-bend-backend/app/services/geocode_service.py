"""Best-effort address geocoding via OpenStreetMap Nominatim.

Nominatim usage policy notes:
  - A real, identifying User-Agent header is REQUIRED (we send TheBendCommunity/1.0).
  - Max 1 request/second. Fine for write-time geocoding (one shop at a time);
    the backfill script (app/scripts/geocode_shops.py) must sleep 1.1s between calls.

Geocoding is ALWAYS best-effort: any network error, timeout, bad response, or
empty result returns None. Callers must never fail the request when this returns None.
"""
from __future__ import annotations

import logging
import math

import httpx

logger = logging.getLogger(__name__)

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "TheBendCommunity/1.0 (admin@bend.community)"
_TIMEOUT_SECONDS = 5.0

EARTH_RADIUS_MILES = 3958.7613


async def geocode_address(address: str) -> tuple[float, float] | None:
    """Geocode a free-form address into (latitude, longitude).

    Returns None on any failure or empty result. Never raises.
    """
    if not address or not address.strip():
        return None

    params = {"q": address, "format": "json", "limit": 1}
    headers = {"User-Agent": USER_AGENT}

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT_SECONDS) as client:
            response = await client.get(NOMINATIM_URL, params=params, headers=headers)
            response.raise_for_status()
            results = response.json()
    except Exception as exc:  # noqa: BLE001 - geocoding is always best-effort
        logger.warning("Geocoding failed for address %r: %s", address, exc)
        return None

    if not results or not isinstance(results, list):
        return None

    try:
        first = results[0]
        return float(first["lat"]), float(first["lon"])
    except (KeyError, IndexError, TypeError, ValueError) as exc:
        logger.warning("Unexpected geocoding response for address %r: %s", address, exc)
        return None


def haversine_miles(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance between two lat/lng points, in statute miles."""
    rlat1, rlon1, rlat2, rlon2 = map(math.radians, (lat1, lon1, lat2, lon2))
    dlat = rlat2 - rlat1
    dlon = rlon2 - rlon1
    a = math.sin(dlat / 2) ** 2 + math.cos(rlat1) * math.cos(rlat2) * math.sin(dlon / 2) ** 2
    c = 2 * math.asin(math.sqrt(a))
    return EARTH_RADIUS_MILES * c
