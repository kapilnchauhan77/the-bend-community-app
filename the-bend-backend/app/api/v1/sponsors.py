from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import get_db
from app.core.permissions import get_current_tenant
from app.models.tenant import Tenant
from app.models.sponsor import Sponsor

router = APIRouter(prefix="/sponsors", tags=["Sponsors"])


@router.get("")
async def list_sponsors(
    placement: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    tenant: Tenant | None = Depends(get_current_tenant),
):
    query = select(Sponsor).where(Sponsor.is_active == True).order_by(Sponsor.sort_order, Sponsor.name)
    if tenant:
        query = query.where(Sponsor.tenant_id == tenant.id)
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
