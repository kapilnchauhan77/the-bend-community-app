from pydantic import BaseModel, EmailStr, Field, field_validator
import re


class RegisterRequest(BaseModel):
    shop_name: str = Field(..., min_length=2, max_length=150)
    business_type: str = Field(..., min_length=1)
    owner_name: str = Field(..., min_length=1, max_length=100)
    email: EmailStr
    phone: str = Field(..., min_length=5, max_length=20)
    whatsapp: str | None = None
    password: str = Field(..., min_length=8)
    address: str | None = None
    guidelines_accepted: bool

    @field_validator("password")
    @classmethod
    def validate_password(cls, v):
        if not re.search(r"[0-9]", v):
            raise ValueError("Password must contain at least one number")
        if not re.search(r"[a-zA-Z]", v):
            raise ValueError("Password must contain at least one letter")
        return v

    @field_validator("guidelines_accepted")
    @classmethod
    def validate_guidelines(cls, v):
        if not v:
            raise ValueError("You must accept the community guidelines")
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: "UserResponse"
    shop: "ShopResponse | None" = None


class UserResponse(BaseModel):
    id: str
    name: str
    email: str
    role: str
    avatar_url: str | None = None

    model_config = {"from_attributes": True}

    @field_validator("id", mode="before")
    @classmethod
    def stringify_id(cls, v):
        return str(v)


class ShopResponse(BaseModel):
    id: str
    name: str
    status: str
    avatar_url: str | None = None

    model_config = {"from_attributes": True}

    @field_validator("id", mode="before")
    @classmethod
    def stringify_id(cls, v):
        return str(v)


class RefreshRequest(BaseModel):
    refresh_token: str


class RefreshResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(..., min_length=8)

    @field_validator("new_password")
    @classmethod
    def validate_password(cls, v):
        if not re.search(r"[0-9]", v):
            raise ValueError("Password must contain at least one number")
        if not re.search(r"[a-zA-Z]", v):
            raise ValueError("Password must contain at least one letter")
        return v


class MessageResponse(BaseModel):
    message: str


class RegisterResponse(BaseModel):
    message: str
    shop_id: str
