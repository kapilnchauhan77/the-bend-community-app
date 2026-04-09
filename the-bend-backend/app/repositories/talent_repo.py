from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from app.repositories.base import BaseRepository
from app.models.talent import Talent, TalentInquiry
from app.core.pagination import PaginatedResult


class TalentRepository(BaseRepository[Talent]):
    def __init__(self, session: AsyncSession):
        super().__init__(Talent, session)

    async def browse_by_category(self, category: str | None, cursor: str | None, limit: int) -> PaginatedResult:
        filters = []
        if category:
            filters.append(Talent.category == category)
        return await self.get_all(filters=filters, limit=limit, cursor=cursor)

    async def create_inquiry(self, talent_id: UUID, data: dict) -> TalentInquiry:
        inquiry = TalentInquiry(talent_id=talent_id, **data)
        self.session.add(inquiry)
        await self.session.flush()
        await self.session.refresh(inquiry)
        return inquiry
