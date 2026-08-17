from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class UserBlockResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    blocked_user_id: UUID
    blocked_user_name: str
    created_at: datetime


class UserBlockCreateResponse(BaseModel):
    id: UUID
    blocked_user_id: UUID
    created_at: datetime


class UserBlockListResponse(BaseModel):
    items: list[UserBlockResponse]
