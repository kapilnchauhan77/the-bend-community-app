from pydantic import BaseModel, field_validator


class VolunteerCreate(BaseModel):
    name: str
    phone: str
    skills: str
    available_time: str

    @field_validator("name", "phone", "skills", "available_time")
    @classmethod
    def not_empty(cls, v):
        if not v or not v.strip():
            raise ValueError("Field cannot be empty")
        return v.strip()


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
