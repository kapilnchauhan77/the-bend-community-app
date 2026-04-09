from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.services.volunteer_service import VolunteerService
from app.schemas.volunteer import VolunteerCreate

router = APIRouter(prefix="/volunteers", tags=["Volunteers"])


def get_service(db: AsyncSession = Depends(get_db)):
    return VolunteerService(db)


@router.post("")
async def enroll_volunteer(data: VolunteerCreate, service: VolunteerService = Depends(get_service)):
    v = await service.enroll(data)
    return {"id": str(v.id), "name": v.name}


@router.get("")
async def list_volunteers(
    cursor: str | None = Query(None),
    limit: int = Query(20, le=50),
    service: VolunteerService = Depends(get_service),
):
    result = await service.list_volunteers(cursor, limit)
    items = [{
        "id": str(v.id),
        "name": v.name,
        "phone": v.phone,
        "skills": v.skills,
        "available_time": v.available_time,
        "created_at": str(v.created_at),
    } for v in result.items]
    return {"items": items, "next_cursor": result.next_cursor, "has_more": result.has_more}
