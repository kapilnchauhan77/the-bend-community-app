from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.permissions import get_current_user
from app.models.user import User
from app.schemas.device import DeviceInstallationRequest, DeviceInstallationResponse, DeviceRevokeRequest
from app.services.device_service import DeviceService

router = APIRouter(prefix="/devices", tags=["Devices"])


@router.put("/installations/{installation_id}", response_model=DeviceInstallationResponse)
async def register_installation(
    installation_id: UUID,
    data: DeviceInstallationRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    installation, secret = await DeviceService(db).register(installation_id, current_user, data.model_dump())
    return DeviceInstallationResponse.model_validate({**installation.__dict__, "revocation_secret": secret})


@router.delete("/installations/{installation_id}")
async def disable_installation(
    installation_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await DeviceService(db).disable(installation_id, current_user)
    return {"status": "disabled"}


@router.post("/installations/{installation_id}/revoke")
async def revoke_installation(
    installation_id: UUID,
    data: DeviceRevokeRequest,
    db: AsyncSession = Depends(get_db),
):
    await DeviceService(db).revoke_with_secret(installation_id, data.revocation_secret)
    return {"status": "revoked"}
