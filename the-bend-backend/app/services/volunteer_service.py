from uuid import uuid4
from sqlalchemy.ext.asyncio import AsyncSession
from app.repositories.volunteer_repo import VolunteerRepository
from app.schemas.volunteer import VolunteerCreate


class VolunteerService:
    def __init__(self, db: AsyncSession, tenant_id=None):
        self.repo = VolunteerRepository(db)
        self.tenant_id = tenant_id

    async def enroll(self, data: VolunteerCreate):
        volunteer = await self.repo.create({
            "id": uuid4(),
            "name": data.name,
            "phone": data.phone,
            "email": data.email,
            "skills": data.skills,
            "available_time": data.available_time,
            "tenant_id": self.tenant_id,
        })
        return volunteer

    async def list_volunteers(self, cursor=None, limit=20):
        from app.models.volunteer import Volunteer
        filters = []
        if self.tenant_id:
            filters.append(Volunteer.tenant_id == self.tenant_id)
        return await self.repo.get_all(filters=filters, limit=limit, cursor=cursor)
