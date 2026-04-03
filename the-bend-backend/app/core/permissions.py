from typing import Annotated

from fastapi import Depends, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.api.deps import get_db
from app.core.security import decode_access_token
from app.core.exceptions import UnauthorizedError, ForbiddenError
from app.models.user import User
from app.models.enums import UserRole


async def _get_user_from_token(token: str, db: AsyncSession) -> User:
    """Validate token and fetch user from DB."""
    payload = decode_access_token(token)
    user_id = payload.get("sub")
    if not user_id:
        raise UnauthorizedError("Invalid token payload")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user is None:
        raise UnauthorizedError("User not found")
    if not user.is_active:
        raise ForbiddenError("Account is disabled")

    return user


async def get_current_user(
    authorization: Annotated[str | None, Header()] = None,
    db: AsyncSession = Depends(get_db),
) -> User:
    """Get current authenticated user. Raises 401 if not authenticated."""
    if not authorization or not authorization.startswith("Bearer "):
        raise UnauthorizedError("Missing or invalid Authorization header")
    token = authorization[7:]
    return await _get_user_from_token(token, db)


async def get_current_user_optional(
    authorization: Annotated[str | None, Header()] = None,
    db: AsyncSession = Depends(get_db),
) -> User | None:
    """Get current user if authenticated, None otherwise."""
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization[7:]
    try:
        return await _get_user_from_token(token, db)
    except (UnauthorizedError, ForbiddenError):
        return None


class Permission:
    """Dependency factories for role-based route protection."""

    @staticmethod
    def require_role(*roles: UserRole):
        """Restrict to specific roles."""
        async def checker(
            current_user: User = Depends(get_current_user),
        ) -> User:
            if current_user.role not in roles:
                raise ForbiddenError("Insufficient permissions")
            return current_user
        return checker

    @staticmethod
    def require_shop_admin():
        """Shop admin with active shop."""
        async def checker(
            current_user: User = Depends(get_current_user),
            db: AsyncSession = Depends(get_db),
        ) -> User:
            if current_user.role != UserRole.SHOP_ADMIN:
                raise ForbiddenError("Shop admin access required")
            if not current_user.shop_id:
                raise ForbiddenError("No shop associated with this account")
            from app.models.shop import Shop
            result = await db.execute(select(Shop).where(Shop.id == current_user.shop_id))
            shop = result.scalar_one_or_none()
            if not shop or shop.status.value != "active":
                raise ForbiddenError("Shop is not active")
            return current_user
        return checker

    @staticmethod
    def require_community_admin():
        """Community admin only."""
        async def checker(
            current_user: User = Depends(get_current_user),
        ) -> User:
            if current_user.role != UserRole.COMMUNITY_ADMIN:
                raise ForbiddenError("Community admin access required")
            return current_user
        return checker

    @staticmethod
    def require_shop_owner(shop_id_param: str = "shop_id"):
        """User must be admin of the specified shop."""
        async def checker(
            current_user: User = Depends(get_current_user),
        ) -> User:
            # Shop ownership check happens in the service layer
            # This just ensures user is a shop admin
            if current_user.role not in (UserRole.SHOP_ADMIN, UserRole.COMMUNITY_ADMIN):
                raise ForbiddenError("Shop admin access required")
            return current_user
        return checker
