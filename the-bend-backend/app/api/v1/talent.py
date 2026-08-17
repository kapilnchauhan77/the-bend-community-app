from uuid import UUID, uuid4
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.permissions import (
    get_current_tenant,
    get_current_user,
    get_current_user_optional,
)
from app.core.privacy import mask_phone, mask_email
from app.models.enums import UserRole
from app.models.tenant import Tenant
from app.models.talent import Talent
from app.models.user import User
from app.services.talent_service import TalentService
from app.schemas.talent import TalentCreate, TalentInquiryCreate, TalentUpdate

router = APIRouter(prefix="/talent", tags=["Talent"])


def get_service(db: AsyncSession = Depends(get_db)):
    return TalentService(db)


def _serialize_talent(t: Talent, *, is_authed: bool) -> dict:
    return {
        "id": str(t.id),
        "name": t.name,
        "phone": mask_phone(t.phone, is_authed) if t.phone else None,
        "email": mask_email(t.email, is_authed) if t.email else None,
        "category": t.category,
        "skills": t.skills,
        "available_time": t.available_time,
        "rate": float(t.rate) if t.rate is not None else None,
        "rate_unit": t.rate_unit,
        "photo_url": t.photo_url,
        "user_id": str(t.user_id) if t.user_id else None,
        "created_at": str(t.created_at),
    }


@router.post("")
async def register_talent(
    request: Request,
    db: AsyncSession = Depends(get_db),
    service: TalentService = Depends(get_service),
    tenant: Tenant | None = Depends(get_current_tenant),
    current_user: User | None = Depends(get_current_user_optional),
):
    """Create a talent profile.

    - Anonymous (no auth): full TalentCreate validation, including the
      "phone OR email required" rule.
    - Authed: idempotent on (tenant_id, user_id). If the user already has a
      Talent row in this tenant, return it. Otherwise create one with
      user_id=current_user.id and relaxed contact-field requirements.
    """
    service.tenant_id = tenant.id if tenant else None
    raw = await request.body()
    payload = await request.json() if raw else {}

    if current_user is None:
        data = TalentCreate(**payload)
        from app.services.content_moderation_service import ContentModerationService
        ContentModerationService().validate_public_text({"name": data.name, "skills": data.skills, "available_time": data.available_time, "category": data.category})
        t = await service.register(data)
        return _serialize_talent(t, is_authed=False)

    update = TalentUpdate(**payload)
    from app.services.content_moderation_service import ContentModerationService
    ContentModerationService().validate_public_text({"name": update.name, "skills": update.skills, "available_time": update.available_time, "category": update.category})
    missing = [
        n for n, v in (
            ("name", update.name),
            ("category", update.category),
            ("skills", update.skills),
            ("available_time", update.available_time),
            ("rate", update.rate),
        ) if v is None or (isinstance(v, str) and not v.strip())
    ]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Missing required fields: {', '.join(missing)}",
        )

    existing_query = select(Talent).where(Talent.user_id == current_user.id)
    if service.tenant_id:
        existing_query = existing_query.where(Talent.tenant_id == service.tenant_id)
    result = await db.execute(existing_query)
    existing = result.scalar_one_or_none()
    if existing:
        return _serialize_talent(existing, is_authed=True)

    row = Talent(
        id=uuid4(),
        name=update.name,
        phone=update.phone,
        email=update.email,
        category=update.category,
        skills=update.skills,
        available_time=update.available_time,
        rate=update.rate,
        rate_unit=update.rate_unit or "hr",
        photo_url=update.photo_url,
        tenant_id=service.tenant_id,
        user_id=current_user.id,
    )
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return _serialize_talent(row, is_authed=True)


@router.get("")
async def list_talent(
    category: str | None = Query(None),
    cursor: str | None = Query(None),
    limit: int = Query(20, le=50),
    service: TalentService = Depends(get_service),
    tenant: Tenant | None = Depends(get_current_tenant),
    current_user: User | None = Depends(get_current_user_optional),
):
    service.tenant_id = tenant.id if tenant else None
    result = await service.list_talent(category, cursor, limit, current_user.id if current_user else None)
    is_authed = current_user is not None
    items = [{
        "id": str(t.id),
        "name": t.name,
        "phone": mask_phone(t.phone, is_authed) if t.phone else None,
        "email": mask_email(t.email, is_authed) if t.email else None,
        "category": t.category,
        "skills": t.skills,
        "available_time": t.available_time,
        "rate": float(t.rate) if t.rate is not None else None,
        "rate_unit": t.rate_unit,
        "photo_url": t.photo_url,
        "user_id": str(t.user_id) if t.user_id else None,
        "created_at": str(t.created_at),
    } for t in result.items]
    return {"items": items, "next_cursor": result.next_cursor, "has_more": result.has_more}


@router.post("/{talent_id}/inquiries")
async def create_inquiry(
    talent_id: UUID,
    data: TalentInquiryCreate,
    service: TalentService = Depends(get_service),
):
    return await service.create_inquiry(talent_id, data)


def _can_manage(current_user: User, row: Talent, tenant: Tenant | None) -> bool:
    tenant_id = tenant.id if tenant else None
    if row.user_id and current_user.id == row.user_id:
        return True
    if current_user.role == UserRole.COMMUNITY_ADMIN:
        if tenant_id is None or row.tenant_id == tenant_id:
            return True
    return False


@router.put("/{talent_id}")
async def update_talent(
    talent_id: UUID,
    data: TalentUpdate,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant | None = Depends(get_current_tenant),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Talent).where(Talent.id == talent_id))
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Talent not found")
    if not _can_manage(current_user, row, tenant):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed")

    updates = data.model_dump(exclude_unset=True)
    from app.services.content_moderation_service import ContentModerationService
    ContentModerationService().validate_public_text({"name": updates.get("name"), "skills": updates.get("skills"), "available_time": updates.get("available_time"), "category": updates.get("category")})
    for key, value in updates.items():
        setattr(row, key, value)
    await db.flush()
    await db.refresh(row)
    return _serialize_talent(row, is_authed=True)


@router.delete("/{talent_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_talent(
    talent_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant | None = Depends(get_current_tenant),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Talent).where(Talent.id == talent_id))
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Talent not found")
    if not _can_manage(current_user, row, tenant):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed")
    await db.delete(row)
    await db.flush()
    return None
