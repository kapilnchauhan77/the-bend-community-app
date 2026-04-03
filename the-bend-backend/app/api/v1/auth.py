from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.services.auth_service import AuthService
from app.schemas.auth import (
    RegisterRequest, RegisterResponse, LoginRequest, TokenResponse,
    RefreshRequest, RefreshResponse, ForgotPasswordRequest,
    ResetPasswordRequest, MessageResponse,
)

router = APIRouter(prefix="/auth", tags=["Authentication"])


def get_auth_service(db: AsyncSession = Depends(get_db)) -> AuthService:
    return AuthService(db)


@router.post("/register", response_model=RegisterResponse, status_code=status.HTTP_201_CREATED)
async def register(
    data: RegisterRequest,
    service: AuthService = Depends(get_auth_service),
):
    """Register a new shop and its admin user."""
    return await service.register(data)


@router.post("/login", response_model=TokenResponse)
async def login(
    data: LoginRequest,
    service: AuthService = Depends(get_auth_service),
):
    """Authenticate and receive tokens."""
    return await service.login(data.email, data.password)


@router.post("/refresh", response_model=RefreshResponse)
async def refresh_token(
    data: RefreshRequest,
    service: AuthService = Depends(get_auth_service),
):
    """Refresh an expired access token."""
    return await service.refresh_token(data.refresh_token)


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
