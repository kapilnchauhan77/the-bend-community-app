from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import (
    AppException,
    ConflictError,
    ForbiddenError,
    NotFoundError,
)
from app.models.discount_code import DiscountCode
from app.models.enums import UserRole
from app.models.user import User
from app.schemas.discount_code import DiscountCodeCreate, DiscountCodeUpdate


class DiscountCodeService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # -------- owner / permission helpers --------

    def _owner_for_user(self, current_user: User) -> tuple[UUID | None, UUID | None]:
        """Return (owner_shop_id, owner_user_id) for the new row.

        - shop_admin / shop_employee with shop_id -> owner_shop_id
        - individual / community-member poster -> owner_user_id
        - super_admin without shop_id -> personal codes under owner_user_id
        """
        if current_user.shop_id:
            return (current_user.shop_id, None)
        if current_user.role in (
            UserRole.INDIVIDUAL,
            UserRole.SHOP_ADMIN,
            UserRole.SHOP_EMPLOYEE,
            UserRole.COMMUNITY_ADMIN,
            UserRole.SUPER_ADMIN,
        ):
            return (None, current_user.id)
        raise ForbiddenError("You are not allowed to create discount codes")

    def _can_manage(self, current_user: User, row: DiscountCode) -> bool:
        """Owner OR community/super admin within the same tenant."""
        if row.owner_shop_id and current_user.shop_id == row.owner_shop_id:
            return True
        if row.owner_user_id and current_user.id == row.owner_user_id:
            return True
        if current_user.role in (UserRole.COMMUNITY_ADMIN, UserRole.SUPER_ADMIN):
            if current_user.tenant_id is None or row.tenant_id == current_user.tenant_id:
                return True
        return False

    # -------- core CRUD --------

    async def create(self, data: DiscountCodeCreate, current_user: User) -> DiscountCode:
        owner_shop_id, owner_user_id = self._owner_for_user(current_user)

        # Service-level XOR guard. (DB-level guard is the two partial-uniques + nullability.)
        if (owner_shop_id is None) == (owner_user_id is None):
            raise ForbiddenError("Discount code must have exactly one owner")

        # Pre-check for duplicate code under the same owner so we can return a clean 409.
        dup_query = select(DiscountCode).where(DiscountCode.code == data.code)
        if owner_shop_id is not None:
            dup_query = dup_query.where(DiscountCode.owner_shop_id == owner_shop_id)
        else:
            dup_query = dup_query.where(DiscountCode.owner_user_id == owner_user_id)
        existing = (await self.db.execute(dup_query)).scalar_one_or_none()
        if existing is not None:
            raise ConflictError("A discount code with that code already exists")

        row = DiscountCode(
            id=uuid4(),
            owner_shop_id=owner_shop_id,
            owner_user_id=owner_user_id,
            tenant_id=current_user.tenant_id,
            code=data.code,
            name=data.name,
            description=data.description,
            discount_type=data.discount_type,
            discount_value=data.discount_value,
            expiry_date=data.expiry_date,
            max_uses=data.max_uses,
            usage_count=0,
            is_active=True,
        )
        self.db.add(row)
        await self.db.flush()
        await self.db.refresh(row)
        return row

    async def list_mine(self, current_user: User) -> list[DiscountCode]:
        clauses = []
        if current_user.shop_id:
            clauses.append(DiscountCode.owner_shop_id == current_user.shop_id)
        clauses.append(DiscountCode.owner_user_id == current_user.id)

        query = (
            select(DiscountCode)
            .where(or_(*clauses))
            .order_by(DiscountCode.created_at.desc())
        )
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def _get_or_404(self, code_id: UUID) -> DiscountCode:
        row = await self.db.get(DiscountCode, code_id)
        if row is None:
            raise NotFoundError("Discount code")
        return row

    async def update(
        self, code_id: UUID, data: DiscountCodeUpdate, current_user: User
    ) -> DiscountCode:
        row = await self._get_or_404(code_id)
        if not self._can_manage(current_user, row):
            raise ForbiddenError("Not allowed to modify this discount code")

        updates = data.model_dump(exclude_unset=True)

        # If code is being changed, ensure no collision under the same owner.
        new_code = updates.get("code")
        if new_code is not None and new_code != row.code:
            dup_query = select(DiscountCode).where(
                DiscountCode.code == new_code,
                DiscountCode.id != row.id,
            )
            if row.owner_shop_id is not None:
                dup_query = dup_query.where(DiscountCode.owner_shop_id == row.owner_shop_id)
            else:
                dup_query = dup_query.where(DiscountCode.owner_user_id == row.owner_user_id)
            dup = (await self.db.execute(dup_query)).scalar_one_or_none()
            if dup is not None:
                raise ConflictError("A discount code with that code already exists")

        # Re-validate percentage bounds when discount_type or value change together.
        new_type = updates.get("discount_type", row.discount_type)
        new_value = updates.get("discount_value", row.discount_value)
        if new_type == "percentage" and not (1 <= new_value <= 100):
            raise AppException(
                status_code=422,
                code="VALIDATION_ERROR",
                message="Percentage discount must be 1-100",
            )

        for key, value in updates.items():
            setattr(row, key, value)
        await self.db.flush()
        await self.db.refresh(row)
        return row

    async def delete(self, code_id: UUID, current_user: User) -> None:
        row = await self._get_or_404(code_id)
        if not self._can_manage(current_user, row):
            raise ForbiddenError("Not allowed to delete this discount code")
        await self.db.delete(row)
        await self.db.flush()

    # -------- public reads --------

    def _public_filters(self):
        now = datetime.utcnow()
        return and_(
            DiscountCode.is_active.is_(True),
            or_(DiscountCode.expiry_date.is_(None), DiscountCode.expiry_date > now),
            or_(
                DiscountCode.max_uses.is_(None),
                DiscountCode.usage_count < DiscountCode.max_uses,
            ),
        )

    async def list_for_shop(self, shop_id: UUID) -> list[DiscountCode]:
        query = (
            select(DiscountCode)
            .where(DiscountCode.owner_shop_id == shop_id, self._public_filters())
            .order_by(DiscountCode.created_at.desc())
        )
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def list_for_user(self, user_id: UUID) -> list[DiscountCode]:
        query = (
            select(DiscountCode)
            .where(DiscountCode.owner_user_id == user_id, self._public_filters())
            .order_by(DiscountCode.created_at.desc())
        )
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def mark_used(self, code_id: UUID) -> DiscountCode:
        """Atomically increment usage_count. Raises 410 GONE if exhausted/expired."""
        # SELECT FOR UPDATE the row so concurrent "use" clicks don't overshoot max_uses.
        query = select(DiscountCode).where(DiscountCode.id == code_id).with_for_update()
        row = (await self.db.execute(query)).scalar_one_or_none()
        if row is None:
            raise NotFoundError("Discount code")

        now = datetime.utcnow()
        unavailable = (
            not row.is_active
            or (row.expiry_date is not None and row.expiry_date <= now)
            or (row.max_uses is not None and row.usage_count >= row.max_uses)
        )
        if unavailable:
            raise AppException(
                status_code=410,
                code="GONE",
                message="Code is no longer available",
            )

        row.usage_count = row.usage_count + 1
        await self.db.flush()
        await self.db.refresh(row)
        return row
