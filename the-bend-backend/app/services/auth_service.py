from uuid import uuid4, UUID
from datetime import datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import (
    hash_password, verify_password,
    create_access_token, create_refresh_token,
    create_reset_token, decode_refresh_token, decode_reset_token,
)
from app.core.exceptions import (
    ConflictError, UnauthorizedError, ForbiddenError, NotFoundError,
)
from sqlalchemy import select

from app.repositories.user_repo import UserRepository
from app.repositories.shop_repo import ShopRepository
from app.models.enums import UserRole, ShopStatus, NotificationType
from app.models.user import User
from app.models.refresh_session import RefreshSession
from app.config import get_settings
from app.schemas.auth import RegisterRequest, TokenResponse, UserResponse, ShopResponse
from app.services.notification_service import NotificationService


class AuthService:
    def __init__(self, db: AsyncSession, tenant_id=None):
        self.db = db
        self.tenant_id = tenant_id
        self.user_repo = UserRepository(db)
        self.shop_repo = ShopRepository(db)

    async def register(self, data: RegisterRequest) -> dict:
        """Register a new user.

        Two paths:
          - user_type == "business" (default): create a User (SHOP_ADMIN) AND a
            Shop, link them, notify community admins. Existing behavior.
          - user_type == "individual": create a User (INDIVIDUAL) with shop_id=None.
            Skip shop creation and skip the community-admin notification — individuals
            don't require approval.
        """
        from app.services.content_moderation_service import ContentModerationService
        ContentModerationService().validate_public_text({"owner_name": data.owner_name, "shop_name": data.shop_name, "business_type": data.business_type, "address": data.address})
        # Check duplicate email
        existing = await self.user_repo.get_by_email(data.email)
        if existing:
            raise ConflictError("Email already registered")

        is_individual = data.user_type == "individual"

        if not is_individual:
            # Business signup: shop_name and business_type are still required
            # (you can't have a business without those). Address is optional —
            # the form labels it that way and many home-based businesses won't
            # have a public street address.
            missing = [
                name for name, value in (
                    ("shop_name", data.shop_name),
                    ("business_type", data.business_type),
                ) if value is None or (isinstance(value, str) and not value.strip())
            ]
            if missing:
                raise ConflictError(
                    f"Missing required business fields: {', '.join(missing)}"
                )

        # Create user
        user = await self.user_repo.create({
            "id": uuid4(),
            "email": data.email,
            "password_hash": hash_password(data.password),
            "name": data.owner_name,
            "phone": data.phone,
            "role": UserRole.INDIVIDUAL if is_individual else UserRole.SHOP_ADMIN,
            "tenant_id": self.tenant_id,
            "is_active": True,
        })

        if is_individual:
            # No shop, no community-admin approval notification.
            await self.db.flush()
            return {
                "message": "Registration successful",
                "user_id": str(user.id),
            }

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
            "tenant_id": self.tenant_id,
            "guidelines_accepted": True,
            "guidelines_accepted_at": datetime.utcnow(),
        })

        # Link user to shop
        user.shop_id = shop.id

        # Best-effort geocode of the shop address so it can appear on maps.
        # Never fail registration if geocoding fails.
        if data.address and data.address.strip():
            try:
                from app.services.geocode_service import geocode_address
                coords = await geocode_address(data.address)
                if coords:
                    shop.latitude, shop.longitude = coords
            except Exception as exc:
                import logging
                logging.getLogger(__name__).warning(
                    "Geocoding shop %s at registration failed: %s", shop.id, exc
                )

        await self.db.flush()

        try:
            admin_query = select(User).where(User.role == UserRole.COMMUNITY_ADMIN, User.is_active == True)
            if self.tenant_id:
                admin_query = admin_query.where(User.tenant_id == self.tenant_id)
            admin_result = await self.db.execute(admin_query)
            admins = admin_result.scalars().all()
            notification_service = NotificationService(self.db)
            for admin in admins:
                await notification_service.notify(
                    user_id=admin.id,
                    type=NotificationType.REGISTRATION_SUBMITTED,
                    title="New Registration",
                    body=f"'{data.shop_name}' has submitted a registration for review.",
                    data={"shop_id": str(shop.id)},
                )
        except Exception:
            pass
        # TODO: Send confirmation email (Phase 6)

        return {"message": "Registration submitted for review", "shop_id": str(shop.id)}

    async def login(self, email: str, password: str) -> TokenResponse:
        """Authenticate and return tokens."""
        user = await self.user_repo.get_by_email(email)
        if not user or not verify_password(password, user.password_hash):
            raise UnauthorizedError("Invalid email or password")

        if self.tenant_id is not None and user.tenant_id != self.tenant_id:
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
        now = datetime.utcnow()
        refresh_session = RefreshSession(
            id=uuid4(),
            user_id=user.id,
            expires_at=now + timedelta(days=get_settings().JWT_REFRESH_TOKEN_EXPIRE_DAYS),
        )
        self.db.add(refresh_session)
        await self.db.flush()
        refresh_token = create_refresh_token(user.id, refresh_session.id)

        return TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            user=UserResponse(id=str(user.id), name=user.name, email=user.email, role=user.role.value, avatar_url=user.avatar_url),
            shop=ShopResponse(id=str(shop.id), name=shop.name, status=shop.status.value, avatar_url=shop.avatar_url) if shop else None,
        )

    async def refresh_token(self, refresh_token: str) -> dict:
        """Refresh an access token while retaining the refresh session.

        Refresh-token rotation is intentionally not used here: the existing
        client contract returns only a new access token, so a valid refresh
        session remains reusable and records ``last_used_at``.
        """
        payload = decode_refresh_token(refresh_token)
        claims = self._parse_refresh_claims(payload)
        if claims is None:
            raise UnauthorizedError("Invalid refresh token")
        user_id, session_id = claims
        user = await self.user_repo.get_by_id(user_id)
        if not user or not user.is_active:
            raise UnauthorizedError("Invalid refresh token")
        if self.tenant_id is not None and user.tenant_id != self.tenant_id:
            raise UnauthorizedError("Invalid refresh token")

        session = await self.db.get(RefreshSession, session_id)
        now = datetime.utcnow()
        if (
            not session
            or session.user_id != user_id
            or session.revoked_at is not None
            or session.expires_at <= now
        ):
            raise UnauthorizedError("Invalid refresh token")
        session.last_used_at = now
        await self.db.flush()

        access_token = create_access_token(user.id, user.role.value, user.shop_id)
        return {"access_token": access_token, "token_type": "bearer"}

    async def logout(self, refresh_token: str) -> None:
        """Revoke a refresh session, without disclosing session existence."""
        try:
            payload = decode_refresh_token(refresh_token)
        except UnauthorizedError:
            return None
        claims = self._parse_refresh_claims(payload)
        if claims is None:
            return None
        user_id, session_id = claims

        session = await self.db.get(RefreshSession, session_id)
        if session and session.user_id == user_id and session.revoked_at is None:
            session.revoked_at = datetime.utcnow()
            await self.db.flush()
        return None

    @staticmethod
    def _parse_refresh_claims(payload: dict) -> tuple[UUID, UUID] | None:
        """Parse only string UUID claims; malformed claims are untrusted."""
        user_claim = payload.get("sub")
        session_claim = payload.get("sid")
        if not isinstance(user_claim, str) or not isinstance(session_claim, str):
            return None
        try:
            return UUID(user_claim), UUID(session_claim)
        except ValueError:
            return None

    async def forgot_password(self, email: str) -> dict:
        """Send password reset email (always returns success for security)."""
        import logging
        logger = logging.getLogger(__name__)
        user = await self.user_repo.get_by_email(email)
        if user:
            token = create_reset_token(user.id)
            try:
                from app.services.email_service import email_service
                result = email_service.send_password_reset_email(user.email, token, user.name)
                logger.info(f"Password reset email to {user.email}: {'sent' if result else 'FAILED'}")
            except Exception as e:
                logger.error(f"Password reset email error for {user.email}: {e}")
        else:
            import logging
            logging.getLogger(__name__).info(f"Password reset requested for unknown email: {email}")
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
