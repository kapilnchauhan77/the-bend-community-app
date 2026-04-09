from uuid import uuid4, UUID
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import (
    hash_password, verify_password,
    create_access_token, create_refresh_token,
    create_reset_token, decode_refresh_token, decode_reset_token,
)
from app.core.exceptions import (
    ConflictError, UnauthorizedError, ForbiddenError, NotFoundError,
)
from app.repositories.user_repo import UserRepository
from app.repositories.shop_repo import ShopRepository
from app.models.enums import UserRole, ShopStatus
from app.schemas.auth import RegisterRequest, TokenResponse, UserResponse, ShopResponse


class AuthService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.user_repo = UserRepository(db)
        self.shop_repo = ShopRepository(db)

    async def register(self, data: RegisterRequest) -> dict:
        """Register a new shop and its admin user."""
        # Check duplicate email
        existing = await self.user_repo.get_by_email(data.email)
        if existing:
            raise ConflictError("Email already registered")

        # Create user
        user = await self.user_repo.create({
            "id": uuid4(),
            "email": data.email,
            "password_hash": hash_password(data.password),
            "name": data.owner_name,
            "phone": data.phone,
            "role": UserRole.SHOP_ADMIN,
            "is_active": True,
        })

        # Create shop
        shop = await self.shop_repo.create({
            "id": uuid4(),
            "name": data.shop_name,
            "business_type": data.business_type,
            "address": data.address,
            "contact_phone": data.phone,
            "whatsapp": data.whatsapp,
            "status": ShopStatus.PENDING,
            "admin_user_id": user.id,
            "guidelines_accepted": True,
            "guidelines_accepted_at": datetime.utcnow(),
        })

        # Link user to shop
        user.shop_id = shop.id
        await self.db.flush()

        # TODO: Notify community admin (Phase 6)
        # TODO: Send confirmation email (Phase 6)

        return {"message": "Registration submitted for review", "shop_id": str(shop.id)}

    async def login(self, email: str, password: str) -> TokenResponse:
        """Authenticate and return tokens."""
        user = await self.user_repo.get_by_email(email)
        if not user or not verify_password(password, user.password_hash):
            raise UnauthorizedError("Invalid email or password")

        if not user.is_active:
            raise ForbiddenError("Account is disabled")

        # Check shop status for shop admins
        shop = None
        if user.role == UserRole.SHOP_ADMIN and user.shop_id:
            shop = await self.shop_repo.get_by_id(user.shop_id)
            if shop:
                if shop.status == ShopStatus.PENDING:
                    raise ForbiddenError("Your registration is pending approval")
                elif shop.status == ShopStatus.SUSPENDED:
                    raise ForbiddenError("Your shop has been suspended")

        # Update last login
        await self.user_repo.update_last_login(user.id)

        # Generate tokens
        access_token = create_access_token(user.id, user.role.value, user.shop_id)
        refresh_token = create_refresh_token(user.id)

        return TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            user=UserResponse(id=str(user.id), name=user.name, email=user.email, role=user.role.value, avatar_url=user.avatar_url),
            shop=ShopResponse(id=str(shop.id), name=shop.name, status=shop.status.value, avatar_url=shop.avatar_url) if shop else None,
        )

    async def refresh_token(self, refresh_token: str) -> dict:
        """Refresh an expired access token."""
        payload = decode_refresh_token(refresh_token)
        user_id = payload.get("sub")
        user = await self.user_repo.get_by_id(user_id)
        if not user or not user.is_active:
            raise UnauthorizedError("Invalid refresh token")

        access_token = create_access_token(user.id, user.role.value, user.shop_id)
        return {"access_token": access_token, "token_type": "bearer"}

    async def forgot_password(self, email: str) -> dict:
        """Send password reset email (always returns success for security)."""
        user = await self.user_repo.get_by_email(email)
        if user:
            token = create_reset_token(user.id)
            # TODO: Queue email task (Phase 6)
            pass
        return {"message": "If that email exists, a reset link has been sent"}

    async def reset_password(self, token: str, new_password: str) -> dict:
        """Reset password with token."""
        payload = decode_reset_token(token)
        user_id = payload.get("sub")
        user = await self.user_repo.get_by_id(user_id)
        if not user:
            raise NotFoundError("User")

        user.password_hash = hash_password(new_password)
        await self.db.flush()
        return {"message": "Password reset successful"}
