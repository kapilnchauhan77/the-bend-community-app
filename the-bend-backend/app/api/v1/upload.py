from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import uuid4

from app.api.deps import get_db
from app.core.permissions import Permission, get_current_user
from app.models.user import User
from app.models.guideline import Guideline
from app.services.file_service import FileService
from sqlalchemy import select, update

router = APIRouter(prefix="/upload", tags=["Upload"])

file_service = FileService()


@router.post("/images")
async def upload_images(
    files: list[UploadFile] = File(...),
    current_user: User = Depends(Permission.require_shop_admin()),
):
    results = await file_service.upload_images(files)
    return {"images": results}


@router.post("/guidelines")
async def upload_guidelines(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(Permission.require_community_admin()),
):
    result = await file_service.upload_guidelines(file)

    # Deactivate previous
    await db.execute(update(Guideline).where(Guideline.is_active == True).values(is_active=False))

    # Create new record
    guideline = Guideline(
        id=uuid4(), file_url=result["file_url"], file_name=result["file_name"],
        file_type=result["file_type"], file_size=result["file_size"],
        uploaded_by=current_user.id, is_active=True,
    )
    db.add(guideline)
    await db.flush()
    await db.refresh(guideline)
    return {"id": str(guideline.id), "file_url": guideline.file_url, "file_name": guideline.file_name}


@router.get("/guidelines/current")
async def get_current_guidelines(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Guideline).where(Guideline.is_active == True).order_by(Guideline.created_at.desc()).limit(1)
    )
    guideline = result.scalar_one_or_none()
    if not guideline:
        return {"message": "No guidelines uploaded yet"}
    return {
        "id": str(guideline.id), "file_url": guideline.file_url,
        "file_name": guideline.file_name, "file_type": guideline.file_type,
        "file_size": guideline.file_size, "created_at": str(guideline.created_at),
    }


@router.post("/avatar")
async def upload_avatar(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload a profile avatar for the current user."""
    service = FileService()
    result = await service.upload_images([file])
    if not result:
        raise HTTPException(status_code=400, detail="Upload failed")

    avatar_url = result[0]["url"]

    # Update user avatar
    current_user.avatar_url = avatar_url
    await db.flush()

    # Also update shop avatar if user is shop admin
    if current_user.shop_id:
        from app.models.shop import Shop
        shop_result = await db.execute(select(Shop).where(Shop.id == current_user.shop_id))
        shop = shop_result.scalar_one_or_none()
        if shop:
            shop.avatar_url = avatar_url
            await db.flush()

    return {"avatar_url": avatar_url}
