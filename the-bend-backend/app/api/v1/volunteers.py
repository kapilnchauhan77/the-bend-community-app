from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.permissions import get_current_tenant
from app.models.tenant import Tenant
from app.services.volunteer_service import VolunteerService
from app.schemas.volunteer import VolunteerCreate

router = APIRouter(prefix="/volunteers", tags=["Volunteers"])


def get_service(db: AsyncSession = Depends(get_db)):
    return VolunteerService(db)


@router.post("")
async def enroll_volunteer(
    data: VolunteerCreate,
    service: VolunteerService = Depends(get_service),
    tenant: Tenant | None = Depends(get_current_tenant),
):
    service.tenant_id = tenant.id if tenant else None
    v = await service.enroll(data)
    return {"id": str(v.id), "name": v.name}


@router.get("")
async def list_volunteers(
    cursor: str | None = Query(None),
    limit: int = Query(20, le=50),
    service: VolunteerService = Depends(get_service),
    tenant: Tenant | None = Depends(get_current_tenant),
):
    service.tenant_id = tenant.id if tenant else None
    result = await service.list_volunteers(cursor, limit)
    items = [{
        "id": str(v.id),
        "name": v.name,
        "phone": v.phone,
        "email": v.email,
        "skills": v.skills,
        "available_time": v.available_time,
        "photo_url": v.photo_url,
        "created_at": str(v.created_at),
    } for v in result.items]
    return {"items": items, "next_cursor": result.next_cursor, "has_more": result.has_more}
