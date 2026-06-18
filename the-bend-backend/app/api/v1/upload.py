from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import uuid4

from app.api.deps import get_db
from app.core.permissions import Permission, get_current_user
from app.models.user import User
from app.models.guideline import Guideline
from app.services.file_service import (
    ALLOWED_AUDIO_MIME_TYPES,
    ALLOWED_IMAGE_MIME_TYPES,
    ALLOWED_MEDIA_MIME_TYPES,
    ALLOWED_VIDEO_MIME_TYPES,
    FileService,
)
from sqlalchemy import select, update

router = APIRouter(prefix="/upload", tags=["Upload"])

file_service = FileService()


@router.post("/images")
async def upload_images(
    files: list[UploadFile] = File(...),
    current_user: User = Depends(get_current_user),
):
    # Any signed-in user can upload listing images (individuals post via
    # the same form as shop_admins; the listing service still gates who
    # may create listings by category).
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


@router.post("/photo")
async def upload_public_photo(
    file: UploadFile = File(...),
):
    """Upload a photo for talent/volunteer profiles (no auth required)."""
    service = FileService()
    result = await service.upload_images([file])
    if not result:
        raise HTTPException(status_code=400, detail="Upload failed")
    return {"photo_url": result[0]["url"]}


@router.post("/media")
async def upload_media(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """Unified upload endpoint for short videos, photos, OR voice notes.

    Auto-detects type from the Content-Type header. Images run through the
    same Pillow pipeline as /upload/images (full + _thumb). Videos are
    saved verbatim with a generated poster JPEG. Audio is saved verbatim
    with no poster (just a duration probe). The response shape is the
    same for all three so the frontend can treat messenger media uniformly:

        { "url": "...", "thumbnail_url": "..." | null,
          "type": "image" | "video" | "audio",
          "duration_ms": <int, audio + video only> }
    """
    # Strip MIME parameters before matching. Browser MediaRecorder reports
    # codec-qualified types like "audio/webm;codecs=opus" and
    # "video/webm;codecs=vp8,opus"; our allow-lists key on the base type, so
    # comparing the full string would 415 every recorded voice note / video.
    content_type = (file.content_type or "").lower().split(";")[0].strip()

    if content_type not in ALLOWED_MEDIA_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported media type: {file.content_type or 'unknown'}",
        )

    if content_type in ALLOWED_IMAGE_MIME_TYPES:
        # Image pipeline expects a list; reuse it so behavior matches
        # /upload/images exactly (EXIF strip, 1600px cap, _thumb sibling).
        results = await file_service.upload_images([file])
        if not results:
            raise HTTPException(status_code=400, detail="Upload failed")
        first = results[0]
        return {
            "url": first["url"],
            "thumbnail_url": first["thumbnail_url"],
            "type": "image",
        }

    if content_type in ALLOWED_VIDEO_MIME_TYPES:
        # Video branch. upload_video handles size + duration + poster.
        result = await file_service.upload_video(file)
        return {
            "url": result["url"],
            "thumbnail_url": result["thumbnail_url"],
            "type": "video",
            "duration_ms": result["duration_ms"],
        }

    # Audio branch (voice notes). No thumbnail — there's no frame to render.
    assert content_type in ALLOWED_AUDIO_MIME_TYPES
    result = await file_service.upload_audio(file)
    return {
        "url": result["url"],
        "thumbnail_url": None,
        "type": "audio",
        "duration_ms": result["duration_ms"],
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
