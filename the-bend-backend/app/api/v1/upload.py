from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, status, Header, Request
from fastapi.responses import JSONResponse
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
from app.services.upload_idempotency_service import UploadIdempotencyService, UploadClaim, UploadIdempotencyUnavailable

router = APIRouter(prefix="/upload", tags=["Upload"])

file_service = FileService()
idempotency = UploadIdempotencyService()

async def _claim(endpoint: str, key: str | None, current_user: User | None, tenant: str | None = None, anonymous_client_id: str | None = None):
    if not isinstance(key, str):
        key = None
    if not key:
        return None
    if current_user is None:
        tenant_id, user_id = tenant or "public", anonymous_client_id
        if not user_id:
            raise HTTPException(status_code=400, detail="X-Anonymous-Client-ID is required with Idempotency-Key")
    else:
        tenant_id, user_id = getattr(current_user, "tenant_id", None) or "default", current_user.id
    try:
        claim = await idempotency.claim(tenant_id, user_id, endpoint, key)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except UploadIdempotencyUnavailable as exc:
        raise HTTPException(status_code=503, detail="UPLOAD_REPLAY_PROTECTION_UNAVAILABLE") from exc
    if claim.response is not None:
        return JSONResponse(claim.response)
    if claim.in_progress:
        raise HTTPException(status_code=409, detail="UPLOAD_IN_PROGRESS")
    return claim

async def _complete(claim: UploadClaim | None, response: dict):
    if claim:
        try:
            await idempotency.complete(claim.claim_key, response)
        except UploadIdempotencyUnavailable as exc:
            raise HTTPException(status_code=503, detail="UPLOAD_REPLAY_PROTECTION_UNAVAILABLE") from exc
    return response

async def _release(claim: UploadClaim | None):
    if claim:
        try: await idempotency.release(claim.claim_key)
        except UploadIdempotencyUnavailable: pass


@router.post("/images")
async def upload_images(
    files: list[UploadFile] = File(...),
    current_user: User = Depends(get_current_user),
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
    tenant: str | None = Header(None, alias="X-Tenant-Slug"),
):
    # Any signed-in user can upload listing images (individuals post via
    # the same form as shop_admins; the listing service still gates who
    # may create listings by category).
    claim = await _claim("/upload/images", idempotency_key, current_user)
    if isinstance(claim, JSONResponse): return claim
    try:
        results = await file_service.upload_images(files, claim.claim_key if claim else None)
        return await _complete(claim, {"images": results})
    except Exception:
        await _release(claim); raise


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
    request: Request = None,
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
    anonymous_client_id: str | None = Header(None, alias="X-Anonymous-Client-ID"),
):
    """Upload a photo for talent/volunteer profiles (no auth required)."""
    trusted_tenant = getattr(getattr(request, "state", None), "tenant", None)
    tenant_id = getattr(trusted_tenant, "id", None) or "public"
    claim = await _claim("/upload/photo", idempotency_key, None, str(tenant_id), anonymous_client_id)
    if isinstance(claim, JSONResponse): return claim
    try:
        service = FileService(); result = await service.upload_images([file], claim.claim_key if claim else None)
        if not result: raise HTTPException(status_code=400, detail="Upload failed")
        return await _complete(claim, {"photo_url": result[0]["url"]})
    except Exception:
        await _release(claim); raise


@router.post("/media")
async def upload_media(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
    tenant: str | None = Header(None, alias="X-Tenant-Slug"),
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
    claim = await _claim("/upload/media", idempotency_key, current_user)
    if isinstance(claim, JSONResponse): return claim
    # Strip MIME parameters before matching. Browser MediaRecorder reports
    # codec-qualified types like "audio/webm;codecs=opus" and
    # "video/webm;codecs=vp8,opus"; our allow-lists key on the base type, so
    # comparing the full string would 415 every recorded voice note / video.
    try:
      content_type = (file.content_type or "").lower().split(";")[0].strip()

      if content_type not in ALLOWED_MEDIA_MIME_TYPES:
          raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported media type: {file.content_type or 'unknown'}",
        )

      if content_type in ALLOWED_IMAGE_MIME_TYPES:
        # Image pipeline expects a list; reuse it so behavior matches
        # /upload/images exactly (EXIF strip, 1600px cap, _thumb sibling).
          results = await file_service.upload_images([file], claim.claim_key if claim else None)
          if not results:
            raise HTTPException(status_code=400, detail="Upload failed")
          first = results[0]
          return await _complete(claim, {
            "url": first["url"],
            "thumbnail_url": first["thumbnail_url"],
            "type": "image",
        })

      if content_type in ALLOWED_VIDEO_MIME_TYPES:
        # Video branch. upload_video handles size + duration + poster.
          result = await file_service.upload_video(file, claim.claim_key if claim else None)
          return await _complete(claim, {
            "url": result["url"],
            "thumbnail_url": result["thumbnail_url"],
            "type": "video",
            "duration_ms": result["duration_ms"],
        })

    # Audio branch (voice notes). No thumbnail — there's no frame to render.
      assert content_type in ALLOWED_AUDIO_MIME_TYPES
      result = await file_service.upload_audio(file, claim.claim_key if claim else None)
      return await _complete(claim, {
        "url": result["url"],
        "thumbnail_url": None,
        "type": "audio",
        "duration_ms": result["duration_ms"],
      })
    except Exception:
      await _release(claim); raise


@router.post("/avatar")
async def upload_avatar(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
):
    """Upload a profile avatar for the current user."""
    claim = await _claim("/upload/avatar", idempotency_key, current_user)
    if isinstance(claim, JSONResponse): return claim
    try:
      service = FileService()
      private = current_user.shop_id is None
      result = [await service.upload_private_user_image(file, current_user.id, claim.claim_key if claim else None)] if private else await service.upload_images([file], claim.claim_key if claim else None)
      if not result:
        raise HTTPException(status_code=400, detail="Upload failed")

      avatar_url = result[0]["url"]
      from app.models.account_deletion import AccountOwnedUpload
      if private and current_user.tenant_id:
        db.add(AccountOwnedUpload(user_id=current_user.id, tenant_id=current_user.tenant_id, path=avatar_url))

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

      return await _complete(claim, {"avatar_url": avatar_url})
    except Exception:
      await _release(claim); raise
