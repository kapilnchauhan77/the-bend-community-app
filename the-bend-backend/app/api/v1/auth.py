from fastapi import APIRouter, Depends, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.permissions import get_current_tenant, get_current_user
from app.core.exceptions import ForbiddenError, NotFoundError
from app.models.shop import Shop
from app.models.user import User
from app.models.tenant import Tenant
from app.services.auth_service import AuthService
from app.schemas.auth import (
    RegisterRequest, RegisterResponse, LoginRequest, TokenResponse,
    RefreshRequest, RefreshResponse, ForgotPasswordRequest,
    ResetPasswordRequest, MessageResponse, LogoutRequest,
    UserResponse, ShopResponse,
)

router = APIRouter(prefix="/auth", tags=["Authentication"])


def get_auth_service(db: AsyncSession = Depends(get_db)) -> AuthService:
    return AuthService(db)


@router.get("/me")
async def me(
    current_user: User = Depends(get_current_user),
    tenant: Tenant | None = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    """Return the authenticated member and their tenant-owned shop."""
    if tenant is not None and current_user.tenant_id != tenant.id:
        raise ForbiddenError("Account does not belong to this community")

    shop_response = None
    if current_user.shop_id:
        query = select(Shop).where(Shop.id == current_user.shop_id)
        if tenant is not None:
            query = query.where(Shop.tenant_id == tenant.id)
        shop = (await db.execute(query)).scalar_one_or_none()
        if shop is None:
            raise NotFoundError("Shop")
        shop_response = ShopResponse.model_validate(shop).model_dump()

    return {
        "user": UserResponse.model_validate(current_user).model_dump(),
        "shop": shop_response,
    }


@router.post("/register", response_model=RegisterResponse, status_code=status.HTTP_201_CREATED)
async def register(
    data: RegisterRequest,
    service: AuthService = Depends(get_auth_service),
    tenant: Tenant | None = Depends(get_current_tenant),
):
    """Register a new shop and its admin user."""
    service.tenant_id = tenant.id if tenant else None
    return await service.register(data)


@router.post("/login", response_model=TokenResponse)
async def login(
    data: LoginRequest,
    service: AuthService = Depends(get_auth_service),
    tenant: Tenant | None = Depends(get_current_tenant),
):
    """Authenticate and receive tokens."""
    service.tenant_id = tenant.id if tenant else None
    return await service.login(data.email, data.password)


@router.post("/refresh", response_model=RefreshResponse)
async def refresh_token(
    data: RefreshRequest,
    service: AuthService = Depends(get_auth_service),
    tenant: Tenant | None = Depends(get_current_tenant),
):
    """Refresh an expired access token."""
    service.tenant_id = tenant.id if tenant else None
    return await service.refresh_token(data.refresh_token)


@router.post("/logout", response_model=MessageResponse)
async def logout(
    data: LogoutRequest,
    service: AuthService = Depends(get_auth_service),
):
    """Revoke a refresh token."""
    await service.logout(data.refresh_token)
    return {"message": "Logged out successfully"}


@router.post("/forgot-password", response_model=MessageResponse)
async def forgot_password(
    data: ForgotPasswordRequest,
    service: AuthService = Depends(get_auth_service),
):
    """Request password reset email."""
    return await service.forgot_password(data.email)


@router.post("/reset-password", response_model=MessageResponse)
async def reset_password(
    data: ResetPasswordRequest,
    service: AuthService = Depends(get_auth_service),
):
    """Reset password with token from email."""
    return await service.reset_password(data.token, data.new_password)
