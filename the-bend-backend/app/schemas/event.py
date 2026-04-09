from datetime import datetime
from pydantic import BaseModel, field_validator


class EventCreate(BaseModel):
    title: str
    description: str | None = None
    start_date: datetime
    end_date: datetime | None = None
    location: str | None = None
    category: str = "community"
    image_url: str | None = None
    is_featured: bool = False

    @field_validator("title")
    @classmethod
    def not_empty(cls, v):
        if not v or not v.strip():
            raise ValueError("Title cannot be empty")
        return v.strip()


class EventUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    start_date: datetime | None = None
    end_date: datetime | None = None
    location: str | None = None
    category: str | None = None
    image_url: str | None = None
    is_featured: bool | None = None
    status: str | None = None


class EventResponse(BaseModel):
    id: str
    title: str
    description: str | None = None
    start_date: str
    end_date: str | None = None
    location: str | None = None
    category: str
    image_url: str | None = None
    source: str
    source_url: str | None = None
    is_featured: bool
    status: str
    created_at: str

    @field_validator("id", mode="before")
    @classmethod
    def stringify_id(cls, v): return str(v)


class ConnectorCreate(BaseModel):
    name: str
    type: str  # ics, rss, html
    url: str
    category: str = "community"
    is_active: bool = True
    config: dict | None = None

    @field_validator("name", "url")
    @classmethod
    def not_empty(cls, v):
        if not v or not v.strip():
            raise ValueError("Field cannot be empty")
        return v.strip()

    @field_validator("type")
    @classmethod
    def valid_type(cls, v):
        if v not in ("ics", "rss", "html"):
            raise ValueError("Type must be ics, rss, or html")
        return v


class ConnectorUpdate(BaseModel):
    name: str | None = None
    type: str | None = None
    url: str | None = None
    category: str | None = None
    is_active: bool | None = None
    config: dict | None = None


class ConnectorResponse(BaseModel):
    id: str
    name: str
    type: str
    url: str
    category: str
    is_active: bool
    config: dict | None = None
    last_synced_at: str | None = None
    last_sync_count: int | None = None
    last_sync_error: str | None = None
    created_at: str

    @field_validator("id", mode="before")
    @classmethod
    def stringify_id(cls, v): return str(v)
