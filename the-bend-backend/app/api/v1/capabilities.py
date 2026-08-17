from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.permissions import get_current_tenant
from app.models.tenant import Tenant
from app.schemas.capabilities import CheckoutStatusResponse, NativeCapabilities
from app.services.capabilities_service import native_capabilities
from app.services.checkout_service import CheckoutVerificationService

router = APIRouter(tags=["Native"])


@router.get("/capabilities/native", response_model=NativeCapabilities)
async def capabilities(tenant: Tenant | None = Depends(get_current_tenant)):
    payload = native_capabilities(tenant)
    if payload is None:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return payload


@router.get("/checkout/status/{kind}/{session_id}", response_model=CheckoutStatusResponse)
async def checkout_status(kind: str, session_id: str, db: AsyncSession = Depends(get_db), tenant: Tenant | None = Depends(get_current_tenant)):
    result = await CheckoutVerificationService(db, tenant).status(kind, session_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Not found")
    return result
