from uuid import UUID, uuid4
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.permissions import (
    get_current_tenant,
    get_current_user,
    get_current_user_optional,
)
from app.models.enums import UserRole
from app.models.tenant import Tenant
from app.models.user import User
from app.models.volunteer import Volunteer
from app.services.volunteer_service import VolunteerService
from app.schemas.volunteer import VolunteerCreate, VolunteerUpdate

router = APIRouter(prefix="/volunteers", tags=["Volunteers"])


def _validation_detail(exc: ValidationError) -> list[dict]:
    return [{"loc": error.get("loc", ()), "msg": error.get("msg", "Invalid value"), "type": error.get("type", "value_error")} for error in exc.errors()]


def get_service(db: AsyncSession = Depends(get_db)):
    return VolunteerService(db)


def _serialize_volunteer(
    v: Volunteer,
    *,
    viewer: User | None = None,
    reveal_contact: bool = False,
) -> dict:
    is_owner = viewer is not None and v.user_id is not None and viewer.id == v.user_id
    can_see_phone = reveal_contact or is_owner or bool(getattr(v, "show_phone", False))
    can_see_email = reveal_contact or is_owner or bool(getattr(v, "show_email", False))
    return {
        "id": str(v.id),
        "name": v.name,
        "phone": v.phone if v.phone and can_see_phone else None,
        "email": v.email if v.email and can_see_email else None,
        "show_phone": bool(getattr(v, "show_phone", False)),
        "show_email": bool(getattr(v, "show_email", False)),
        "skills": v.skills,
        "about_me": v.about_me,
        "available_time": v.available_time,
        "photo_url": v.photo_url,
        "user_id": str(v.user_id) if v.user_id else None,
        "created_at": str(v.created_at),
    }


@router.post("")
async def enroll_volunteer(
    request: Request,
    db: AsyncSession = Depends(get_db),
    service: VolunteerService = Depends(get_service),
    tenant: Tenant | None = Depends(get_current_tenant),
    current_user: User | None = Depends(get_current_user_optional),
):
    """Create a volunteer profile.

    - Anonymous (no auth): full VolunteerCreate validation, including the
      "phone OR email required" rule.
    - Authed: idempotent on (tenant_id, user_id). If the user already has a
      Volunteer row in this tenant, return it. Otherwise create one with
      user_id=current_user.id and relaxed contact-field requirements.
    """
    service.tenant_id = tenant.id if tenant else None
    raw = await request.body()
    payload = await request.json() if raw else {}

    if current_user is None:
        # Strict validation for anonymous posts.
        try:
            data = VolunteerCreate(**payload)
        except ValidationError as exc:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=_validation_detail(exc)) from exc
        has_reachable_phone = data.show_phone and bool(data.phone and data.phone.strip())
        has_reachable_email = data.show_email and bool(data.email and data.email.strip())
        if not (has_reachable_phone or has_reachable_email):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="At least one contact field must be public",
            )
        v = await service.enroll(data)
        return _serialize_volunteer(v, viewer=current_user, reveal_contact=True)

    # Authed path: contact fields optional. Reject empty name/skills/time only.
    try:
        update = VolunteerUpdate(**payload)
    except ValidationError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=_validation_detail(exc)) from exc
    if not update.name or not update.skills or not update.available_time:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="name, skills, and available_time are required",
        )

    # Idempotency on (tenant_id, user_id) — return existing row if present.
    existing_query = select(Volunteer).where(Volunteer.user_id == current_user.id)
    if service.tenant_id:
        existing_query = existing_query.where(Volunteer.tenant_id == service.tenant_id)
    result = await db.execute(existing_query)
    existing = result.scalar_one_or_none()
    if existing:
        return _serialize_volunteer(existing, viewer=current_user)

    row = Volunteer(
        id=uuid4(),
        name=update.name,
        phone=update.phone,
        email=update.email,
        show_phone=update.show_phone,
        show_email=update.show_email,
        skills=update.skills,
        available_time=update.available_time,
        photo_url=update.photo_url,
        about_me=update.about_me,
        tenant_id=service.tenant_id,
        user_id=current_user.id,
    )
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return _serialize_volunteer(row, viewer=current_user)


@router.get("")
async def list_volunteers(
    cursor: str | None = Query(None),
    limit: int = Query(20, le=50),
    service: VolunteerService = Depends(get_service),
    tenant: Tenant | None = Depends(get_current_tenant),
    current_user: User | None = Depends(get_current_user_optional),
):
    service.tenant_id = tenant.id if tenant else None
    result = await service.list_volunteers(cursor, limit)
    items = [_serialize_volunteer(v, viewer=current_user) for v in result.items]
    return {"items": items, "next_cursor": result.next_cursor, "has_more": result.has_more}


def _can_manage(current_user: User, row: Volunteer, tenant: Tenant | None) -> bool:
    """Owner OR community admin (within the same tenant) can edit/delete."""
    tenant_id = tenant.id if tenant else None
    if row.user_id and current_user.id == row.user_id:
        return True
    if current_user.role == UserRole.COMMUNITY_ADMIN:
        # Community admins are tenant-scoped; only allow within-tenant.
        if tenant_id is None or row.tenant_id == tenant_id:
            return True
    return False


@router.put("/{volunteer_id}")
async def update_volunteer(
    volunteer_id: UUID,
    data: VolunteerUpdate,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant | None = Depends(get_current_tenant),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Volunteer).where(Volunteer.id == volunteer_id))
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Volunteer not found")
    if not _can_manage(current_user, row, tenant):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed")

    updates = data.model_dump(exclude_unset=True)
    is_owner = row.user_id is not None and current_user.id == row.user_id
    if not is_owner and {"show_phone", "show_email"}.intersection(updates):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the volunteer owner can change contact visibility",
        )
    for key, value in updates.items():
        setattr(row, key, value)
    await db.flush()
    await db.refresh(row)
    return _serialize_volunteer(row, viewer=current_user)


@router.delete("/{volunteer_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_volunteer(
    volunteer_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant | None = Depends(get_current_tenant),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Volunteer).where(Volunteer.id == volunteer_id))
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Volunteer not found")
    if not _can_manage(current_user, row, tenant):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed")
    await db.delete(row)
    await db.flush()
    return None
