from sqlalchemy.ext.asyncio import AsyncSession
from app.repositories.base import BaseRepository
from app.models.volunteer import Volunteer


class VolunteerRepository(BaseRepository[Volunteer]):
    def __init__(self, session: AsyncSession):
        super().__init__(Volunteer, session)
