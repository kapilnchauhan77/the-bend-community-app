"""One-shot backfill: geocode shops that have an address but no coordinates.

Run inside the backend container:
    docker compose -f docker-compose.prod.yml exec backend python -m app.scripts.geocode_shops

Idempotent — only touches shops where address IS NOT NULL AND latitude IS NULL.
Respects Nominatim's 1 req/s policy by sleeping 1.1s between geocode calls.
Commits each shop individually so partial progress is preserved if interrupted.
"""
import asyncio

from sqlalchemy import select

from app.database import async_session
from app.models.shop import Shop
from app.services.geocode_service import geocode_address

SLEEP_SECONDS = 1.1


async def main() -> None:
    async with async_session() as session:
        result = await session.execute(
            select(Shop).where(Shop.address.isnot(None), Shop.latitude.is_(None))
        )
        shops = list(result.scalars().all())

        total = len(shops)
        geocoded = 0
        failed = 0
        print(f"Found {total} shop(s) needing geocoding.")

        for shop in shops:
            address = (shop.address or "").strip()
            if not address:
                continue

            coords = await geocode_address(address)
            if coords:
                shop.latitude, shop.longitude = coords
                await session.commit()
                geocoded += 1
                print(f"  OK   {shop.name!r}: {address} -> {coords[0]}, {coords[1]}")
            else:
                failed += 1
                print(f"  MISS {shop.name!r}: {address} (no result)")

            await asyncio.sleep(SLEEP_SECONDS)

        print(f"Done. Geocoded {geocoded}, missed {failed}, total {total}.")


if __name__ == "__main__":
    asyncio.run(main())
