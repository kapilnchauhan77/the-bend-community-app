from pydantic import BaseModel, field_validator


class SponsorCreate(BaseModel):
    name: str
    description: str | None = None
    logo_url: str | None = None
    banner_url: str | None = None
    website_url: str | None = None
    placement: str = "homepage"
    is_active: bool = True
    sort_order: int = 0

    @field_validator("name")
    @classmethod
    def not_empty(cls, v):
        if not v or not v.strip():
            raise ValueError("Name cannot be empty")
        return v.strip()


class SponsorUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    logo_url: str | None = None
    banner_url: str | None = None
    website_url: str | None = None
    placement: str | None = None
    is_active: bool | None = None
    sort_order: int | None = None
