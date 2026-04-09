from uuid import uuid4
from sqlalchemy.ext.asyncio import AsyncSession
from app.repositories.volunteer_repo import VolunteerRepository
from app.schemas.volunteer import VolunteerCreate


class VolunteerService:
    def __init__(self, db: AsyncSession):
        self.repo = VolunteerRepository(db)

    async def enroll(self, data: VolunteerCreate):
        volunteer = await self.repo.create({
            "id": uuid4(),
            "name": data.name,
            "phone": data.phone,
            "skills": data.skills,
            "available_time": data.available_time,
        })
        return volunteer

    async def list_volunteers(self, cursor=None, limit=20):
        return await self.repo.get_all(limit=limit, cursor=cursor)
