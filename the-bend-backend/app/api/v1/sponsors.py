from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import get_db
from app.models.sponsor import Sponsor

router = APIRouter(prefix="/sponsors", tags=["Sponsors"])


@router.get("")
async def list_sponsors(
    placement: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    query = select(Sponsor).where(Sponsor.is_active == True).order_by(Sponsor.sort_order, Sponsor.name)
    if placement:
        query = query.where(Sponsor.placement == placement)
    result = await db.execute(query)
    sponsors = result.scalars().all()
    return {
        "items": [{
            "id": str(s.id),
            "name": s.name,
            "description": s.description,
            "logo_url": s.logo_url,
            "banner_url": s.banner_url,
            "website_url": s.website_url,
            "placement": s.placement,
        } for s in sponsors]
    }
