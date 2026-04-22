from pydantic import BaseModel, field_validator, model_validator


class VolunteerCreate(BaseModel):
    name: str
    phone: str | None = None
    email: str | None = None
    skills: str
    available_time: str
    photo_url: str | None = None

    @field_validator("name", "skills", "available_time")
    @classmethod
    def not_empty(cls, v):
        if v is None:
            return v
        if not v.strip():
            raise ValueError("Field cannot be empty")
        return v.strip()

    @field_validator("phone")
    @classmethod
    def phone_not_empty(cls, v):
        if v is None:
            return v
        if not v.strip():
            raise ValueError("Field cannot be empty")
        return v.strip()

    @model_validator(mode='after')
    def require_email_or_phone(self):
        if not self.phone and not self.email:
            raise ValueError("At least email or phone is required")
        return self


class VolunteerResponse(BaseModel):
    id: str
    name: str
    phone: str
    skills: str
    available_time: str
    created_at: str

    @field_validator("id", mode="before")
    @classmethod
    def stringify_id(cls, v):
        return str(v)
