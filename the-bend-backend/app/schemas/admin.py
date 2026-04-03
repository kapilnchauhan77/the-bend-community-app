from datetime import datetime
from pydantic import BaseModel, Field


class DashboardResponse(BaseModel):
    pending_registrations: int
    active_shops: int
    active_listings: int
    fulfilled_this_month: int
    listings_by_category: dict
    recent_registrations: list
    recent_listings: list


class RejectRequest(BaseModel):
    reason: str = Field(..., min_length=1)


class SuspendRequest(BaseModel):
    reason: str = Field(..., min_length=1)


class AdminListingDeleteRequest(BaseModel):
    reason: str = Field(..., min_length=1)


class ReportResponse(BaseModel):
    period: str
    new_shops: int
    active_listings: int
    fulfilled_listings: int
    listings_by_category: dict
    listings_over_time: list
    most_active_shops: list
