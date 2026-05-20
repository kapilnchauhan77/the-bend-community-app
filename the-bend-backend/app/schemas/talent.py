from pydantic import BaseModel, field_validator, model_validator


class TalentCreate(BaseModel):
    name: str
    phone: str | None = None
    email: str | None = None
    category: str
    skills: str
    available_time: str
    rate: float
    rate_unit: str = "hr"
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

    @field_validator("category")
    @classmethod
    def valid_category(cls, v):
        allowed = {"freelancer", "musician", "artist"}
        if v.strip().lower() not in allowed:
            raise ValueError(f"Category must be one of: {', '.join(allowed)}")
        return v.strip().lower()

    @field_validator("rate_unit")
    @classmethod
    def valid_rate_unit(cls, v):
        allowed = {"hr", "gig", "day"}
        if v.strip().lower() not in allowed:
            raise ValueError(f"Rate unit must be one of: {', '.join(allowed)}")
        return v.strip().lower()


class TalentResponse(BaseModel):
    id: str
    name: str
    phone: str | None = None
    email: str | None = None
    category: str
    skills: str
    available_time: str
    rate: float
    rate_unit: str
    photo_url: str | None = None
    user_id: str | None = None
    created_at: str

    @field_validator("id", mode="before")
    @classmethod
    def stringify_id(cls, v):
        return str(v)

    @field_validator("user_id", mode="before")
    @classmethod
    def stringify_user_id(cls, v):
        return str(v) if v is not None else None


class TalentUpdate(BaseModel):
    """All fields optional — used by PUT /talent/{id}.

    Skips the require_email_or_phone validator because authed self-edits
    don't need contact info (the in-app messenger reaches them via user_id).
    """
    name: str | None = None
    phone: str | None = None
    email: str | None = None
    category: str | None = None
    skills: str | None = None
    available_time: str | None = None
    rate: float | None = None
    rate_unit: str | None = None
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
        v = v.strip()
        return v or None

    @field_validator("category")
    @classmethod
    def valid_category(cls, v):
        if v is None:
            return v
        allowed = {"freelancer", "musician", "artist"}
        if v.strip().lower() not in allowed:
            raise ValueError(f"Category must be one of: {', '.join(allowed)}")
        return v.strip().lower()

    @field_validator("rate_unit")
    @classmethod
    def valid_rate_unit(cls, v):
        if v is None:
            return v
        allowed = {"hr", "gig", "day"}
        if v.strip().lower() not in allowed:
            raise ValueError(f"Rate unit must be one of: {', '.join(allowed)}")
        return v.strip().lower()


class TalentInquiryCreate(BaseModel):
    name: str
    message: str
    preferred_date: str | None = None

    @field_validator("name", "message")
    @classmethod
    def not_empty(cls, v):
        if not v or not v.strip():
            raise ValueError("Field cannot be empty")
        return v.strip()
