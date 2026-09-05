from pydantic import BaseModel, Field, field_validator, model_validator


class VolunteerCreate(BaseModel):
    name: str
    phone: str | None = None
    email: str | None = None
    skills: str
    available_time: str
    photo_url: str | None = None
    about_me: str | None = Field(default=None, max_length=2000)

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

    @field_validator("about_me")
    @classmethod
    def trim_about_me(cls, v):
        return v.strip() or None if v is not None else None

    @model_validator(mode='after')
    def require_email_or_phone(self):
        if not self.phone and not self.email:
            raise ValueError("At least email or phone is required")
        return self


class VolunteerResponse(BaseModel):
    id: str
    name: str
    phone: str | None = None
    email: str | None = None
    skills: str
    available_time: str
    photo_url: str | None = None
    user_id: str | None = None
    created_at: str
    about_me: str | None = None

    @field_validator("id", mode="before")
    @classmethod
    def stringify_id(cls, v):
        return str(v)

    @field_validator("user_id", mode="before")
    @classmethod
    def stringify_user_id(cls, v):
        return str(v) if v is not None else None


class VolunteerUpdate(BaseModel):
    """All fields optional — used by PUT /volunteers/{id}.

    Skips the require_email_or_phone validator because authed self-edits
    don't need contact info (the in-app messenger reaches them via user_id).
    """
    name: str | None = None
    phone: str | None = None
    email: str | None = None
    skills: str | None = None
    available_time: str | None = None
    photo_url: str | None = None
    about_me: str | None = Field(default=None, max_length=2000)

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
        v = v.strip()
        return v or None

    @field_validator("about_me")
    @classmethod
    def trim_about_me(cls, v):
        return v.strip() or None if v is not None else None
