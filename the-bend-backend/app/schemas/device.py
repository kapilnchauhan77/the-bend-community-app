from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class DeviceInstallationRequest(BaseModel):
    platform: str
    provider_token: str = Field(min_length=1, max_length=4096)
    app_version: str = Field(min_length=1, max_length=32)
    build_number: str = Field(min_length=1, max_length=32)
    locale: str = Field(default="en-US", max_length=16)


class DeviceInstallationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    platform: str
    app_version: str
    build_number: str
    locale: str
    enabled: bool
    revocation_secret: str | None = None


class DeviceRevokeRequest(BaseModel):
    revocation_secret: str = Field(min_length=1, max_length=512)
