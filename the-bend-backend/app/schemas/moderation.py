from datetime import datetime
from uuid import UUID
from typing import Literal
from pydantic import BaseModel, Field

class UserBlockResponse(BaseModel):
    model_config = {"from_attributes": True}
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

class ReportCreate(BaseModel):
    target_type: Literal["listing", "shop", "event", "bender", "user", "message"]
    target_id: UUID
    reason: Literal["spam", "inappropriate", "misleading", "harassment", "other"]
    details: str | None = Field(None, max_length=1000)

class ReportResponse(BaseModel):
    id: UUID
    target_type: str
    target_id: UUID
    status: str
    created_at: datetime
