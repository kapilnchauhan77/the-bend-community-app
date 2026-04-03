from typing import TypeVar, Generic, Type, Any
from uuid import UUID

from sqlalchemy import select, func, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import Base
from app.core.pagination import encode_cursor, decode_cursor, PaginatedResult

T = TypeVar("T", bound=Base)


class BaseRepository(Generic[T]):
    """Generic async repository with CRUD and cursor pagination."""

    def __init__(self, model: Type[T], session: AsyncSession):
        self.model = model
        self.session = session

    async def get_by_id(self, id: UUID) -> T | None:
        """Get a single record by ID."""
        result = await self.session.execute(
            select(self.model).where(self.model.id == id)
        )
        return result.scalar_one_or_none()

    async def get_all(
        self,
        filters: list | None = None,
        order_by: list | None = None,
        cursor: str | None = None,
        limit: int = 20,
    ) -> PaginatedResult:
        """Get paginated records with optional filters and ordering."""
        query = select(self.model)

        # Apply filters
        if filters:
            for filter_clause in filters:
                query = query.where(filter_clause)

        # Apply ordering
        if order_by:
            query = query.order_by(*order_by)
        else:
            query = query.order_by(self.model.created_at.desc())

        # Apply cursor pagination
        if cursor:
            cursor_data = decode_cursor(cursor)
            if "created_at" in cursor_data and "id" in cursor_data:
                from datetime import datetime
                cursor_time = datetime.fromisoformat(cursor_data["created_at"])
                cursor_id = cursor_data["id"]
                query = query.where(
                    (self.model.created_at < cursor_time) |
                    ((self.model.created_at == cursor_time) & (self.model.id < cursor_id))
                )

        # Fetch limit + 1 to check if there are more items
        query = query.limit(limit + 1)
        result = await self.session.execute(query)
        items = list(result.scalars().all())

        # Determine if there are more items
        has_more = len(items) > limit
        if has_more:
            items = items[:limit]

        # Generate next cursor from last item
        next_cursor = None
        if has_more and items:
            last_item = items[-1]
            next_cursor = encode_cursor({
                "created_at": last_item.created_at,
                "id": last_item.id,
            })

        return PaginatedResult(items=items, next_cursor=next_cursor, has_more=has_more)

    async def create(self, data: dict[str, Any]) -> T:
        """Create a new record."""
        instance = self.model(**data)
        self.session.add(instance)
        await self.session.flush()
        await self.session.refresh(instance)
        return instance

    async def update(self, id: UUID, data: dict[str, Any]) -> T | None:
        """Update an existing record."""
        instance = await self.get_by_id(id)
        if instance is None:
            return None
        for key, value in data.items():
            if hasattr(instance, key):
                setattr(instance, key, value)
        await self.session.flush()
        await self.session.refresh(instance)
        return instance

    async def delete(self, id: UUID) -> bool:
        """Delete a record by ID."""
        instance = await self.get_by_id(id)
        if instance is None:
            return False
        await self.session.delete(instance)
        await self.session.flush()
        return True

    async def count(self, filters: list | None = None) -> int:
        """Count records matching filters."""
        query = select(func.count()).select_from(self.model)
        if filters:
            for filter_clause in filters:
                query = query.where(filter_clause)
        result = await self.session.execute(query)
        return result.scalar_one()
