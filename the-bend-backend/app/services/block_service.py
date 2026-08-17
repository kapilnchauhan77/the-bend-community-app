from uuid import UUID, uuid4

from sqlalchemy import and_, delete, or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.models.user import User
from app.models.user_block import UserBlock


class BlockService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def _target(self, user_id: UUID, tenant_id: UUID) -> User:
        result = await self.db.execute(select(User).where(User.id == user_id, User.tenant_id == tenant_id, User.is_active.is_(True)))
        user = result.scalar_one_or_none()
        if user is None:
            raise NotFoundError("User")
        return user

    async def create(self, blocker_id: UUID, blocked_id: UUID, tenant_id: UUID) -> UserBlock:
        # Self, inactive, missing, and cross-tenant targets intentionally share
        # the same not-found response so membership cannot be enumerated.
        if blocker_id == blocked_id:
            raise NotFoundError("User")
        await self._target(blocker_id, tenant_id)
        await self._target(blocked_id, tenant_id)
        # PostgreSQL's unique constraint serializes concurrent creates.  The
        # conflict-free insert avoids poisoning either caller transaction with
        # IntegrityError; the following select returns the winner's row.
        stmt = pg_insert(UserBlock).values(
            id=uuid4(), tenant_id=tenant_id, blocker_id=blocker_id, blocked_id=blocked_id,
        ).on_conflict_do_nothing(constraint="uq_user_blocks_direction")
        await self.db.execute(stmt)
        result = await self.db.execute(select(UserBlock).where(
            UserBlock.tenant_id == tenant_id,
            UserBlock.blocker_id == blocker_id,
            UserBlock.blocked_id == blocked_id,
        ))
        return result.scalar_one()

    async def remove(self, blocker_id: UUID, blocked_id: UUID, tenant_id: UUID) -> None:
        await self.db.execute(delete(UserBlock).where(
            UserBlock.tenant_id == tenant_id,
            UserBlock.blocker_id == blocker_id,
            UserBlock.blocked_id == blocked_id,
        ))
        await self.db.flush()

    async def list_for(self, blocker_id: UUID, tenant_id: UUID) -> list[dict]:
        result = await self.db.execute(
            select(UserBlock, User).join(User, and_(User.id == UserBlock.blocked_id, User.tenant_id == UserBlock.tenant_id)).where(
                UserBlock.tenant_id == tenant_id, UserBlock.blocker_id == blocker_id
            ).order_by(UserBlock.created_at.desc())
        )
        return [{"id": row.id, "blocked_user_id": user.id, "blocked_user_name": user.name, "created_at": row.created_at} for row, user in result.all()]

    async def is_blocked_between(self, a: UUID, b: UUID, tenant_id: UUID) -> bool:
        result = await self.db.execute(select(UserBlock.id).where(
            UserBlock.tenant_id == tenant_id,
            or_(and_(UserBlock.blocker_id == a, UserBlock.blocked_id == b), and_(UserBlock.blocker_id == b, UserBlock.blocked_id == a)),
        ).limit(1))
        return result.scalar_one_or_none() is not None

    async def is_blocked_by(self, viewer_id: UUID, author_id: UUID, tenant_id: UUID) -> bool:
        """Return whether this viewer hid this author (directional discovery rule)."""
        result = await self.db.execute(select(UserBlock.id).where(
            UserBlock.tenant_id == tenant_id,
            UserBlock.blocker_id == viewer_id,
            UserBlock.blocked_id == author_id,
        ).limit(1))
        return result.scalar_one_or_none() is not None

    def blocked_ids_subquery(self, viewer_id: UUID, tenant_id: UUID):
        return select(UserBlock.blocked_id).where(UserBlock.tenant_id == tenant_id, UserBlock.blocker_id == viewer_id)
