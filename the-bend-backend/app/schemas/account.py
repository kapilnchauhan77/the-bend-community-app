from datetime import datetime
from pydantic import BaseModel, Field


class AccountDeletionConfirm(BaseModel):
    password: str = Field(min_length=1)
    send_confirmation: bool = False


class AccountDeletionConfirmation(BaseModel):
    deletion_id: str
    status: str
    status_receipt: str


class AccountDeletionStatus(BaseModel):
    status: str
    requested_at: datetime
    completed_at: datetime | None = None
