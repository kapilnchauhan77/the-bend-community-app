from uuid import UUID, uuid4
from sqlalchemy.ext.asyncio import AsyncSession
from app.repositories.talent_repo import TalentRepository
from app.schemas.talent import TalentCreate, TalentInquiryCreate
from app.core.exceptions import NotFoundError


class TalentService:
    def __init__(self, db: AsyncSession, tenant_id=None):
        self.repo = TalentRepository(db)
        self.tenant_id = tenant_id

    async def register(self, data: TalentCreate):
        talent = await self.repo.create({
            "id": uuid4(),
            "name": data.name,
            "phone": data.phone,
            "email": data.email,
            "category": data.category,
            "skills": data.skills,
            "available_time": data.available_time,
            "rate": data.rate,
            "rate_unit": data.rate_unit,
            "tenant_id": self.tenant_id,
        })
        return talent

    async def list_talent(self, category=None, cursor=None, limit=20):
        from app.models.talent import Talent
        filters = []
        if category:
            filters.append(Talent.category == category)
        if self.tenant_id:
            filters.append(Talent.tenant_id == self.tenant_id)
        return await self.repo.get_all(filters=filters, limit=limit, cursor=cursor)

    async def create_inquiry(self, talent_id: UUID, data: TalentInquiryCreate):
        talent = await self.repo.get_by_id(talent_id)
        if not talent:
            raise NotFoundError("Talent not found")
        inquiry = await self.repo.create_inquiry(talent_id, {
            "name": data.name,
            "message": data.message,
            "preferred_date": data.preferred_date,
        })
        return {"inquiry_id": str(inquiry.id), "talent_phone": talent.phone}
