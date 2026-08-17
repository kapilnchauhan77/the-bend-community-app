from __future__ import annotations

import secrets
import hashlib
import hmac
from datetime import datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.core.security import hash_password, verify_password
from app.models.device_installation import DeviceInstallation
from app.models.user import User


class DeviceService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def _get_for_user(self, installation_id: UUID, user: User) -> DeviceInstallation:
        result = await self.db.execute(
            select(DeviceInstallation).where(
                DeviceInstallation.id == installation_id,
                DeviceInstallation.user_id == user.id,
                DeviceInstallation.tenant_id == user.tenant_id,
            )
        )
        installation = result.scalar_one_or_none()
        if installation is None or installation.user_id != user.id or installation.tenant_id != user.tenant_id:
            raise NotFoundError("Installation")
        return installation

    @staticmethod
    def _hash_secret(secret: str) -> str:
        try:
            return hash_password(secret)
        except (ValueError, RuntimeError):
            # Some deployments expose a bcrypt build that passlib cannot
            # initialize. Keep the same one-way, non-reversible contract while
            # allowing registration to remain available until bcrypt is fixed.
            salt = secrets.token_bytes(16)
            digest = hashlib.pbkdf2_hmac("sha256", secret.encode(), salt, 300_000)
            return f"rev1${salt.hex()}${digest.hex()}"

    @staticmethod
    def _verify_secret(secret: str, encoded: str) -> bool:
        if encoded.startswith("rev1$"):
            _, salt_hex, digest_hex = encoded.split("$", 2)
            actual = hashlib.pbkdf2_hmac("sha256", secret.encode(), bytes.fromhex(salt_hex), 300_000)
            return hmac.compare_digest(actual.hex(), digest_hex)
        return verify_password(secret, encoded)

    async def register(self, installation_id: UUID, user: User, payload: dict):
        platform = payload.get("platform")
        if platform not in {"ios", "android"}:
            raise ValidationError("platform must be ios or android")
        if not user.tenant_id:
            raise NotFoundError("Installation")

        result = await self.db.execute(
            select(DeviceInstallation).where(DeviceInstallation.id == installation_id)
        )
        installation = result.scalar_one_or_none()
        if installation is not None and (
            installation.user_id != user.id or installation.tenant_id != user.tenant_id
        ):
            raise NotFoundError("Installation")

        # A provider token identifies one physical installation. Reassigning it
        # must revoke the old owner first, without exposing either token.
        token_result = await self.db.execute(
            select(DeviceInstallation).where(
                DeviceInstallation.provider_token == payload["provider_token"],
            ).with_for_update()
        )
        token_owner = token_result.scalar_one_or_none()
        if token_owner is not None and token_owner.id != installation_id:
            token_owner.enabled = False
            token_owner.provider_token = f"revoked:{token_owner.id}"
            # The provider token has a global unique constraint. Release it
            # before adding or updating the new owner in this transaction.
            await self.db.flush()

        plain_secret = secrets.token_urlsafe(32)
        now = datetime.utcnow()
        if installation is None:
            installation = DeviceInstallation(
                id=installation_id,
                user_id=user.id,
                tenant_id=user.tenant_id,
                platform=platform,
                provider_token=payload["provider_token"],
                revocation_secret_hash=self._hash_secret(plain_secret),
                app_version=payload["app_version"],
                build_number=payload["build_number"],
                locale=payload.get("locale", "en-US"),
            )
            self.db.add(installation)
        else:
            installation.platform = platform
            installation.provider_token = payload["provider_token"]
            installation.revocation_secret_hash = self._hash_secret(plain_secret)
            installation.app_version = payload["app_version"]
            installation.build_number = payload["build_number"]
            installation.locale = payload.get("locale", "en-US")
            installation.enabled = True
            installation.last_seen_at = now
            installation.updated_at = now
        await self.db.flush()
        return installation, plain_secret

    async def disable(self, installation_id: UUID, user: User) -> None:
        installation = await self._get_for_user(installation_id, user)
        installation.enabled = False
        installation.provider_token = f"revoked:{installation.id}"
        installation.updated_at = datetime.utcnow()
        await self.db.flush()

    async def revoke_with_secret(self, installation_id: UUID, secret: str) -> None:
        result = await self.db.execute(
            select(DeviceInstallation).where(DeviceInstallation.id == installation_id)
        )
        installation = result.scalar_one_or_none()
        valid = False
        if installation is not None:
            try:
                valid = self._verify_secret(secret, installation.revocation_secret_hash)
            except Exception:
                valid = False
        if not valid:
            # Deliberately reveal neither whether the id exists nor whether the
            # secret was wrong. This endpoint has no account-data access.
            raise NotFoundError("Installation")
        installation.enabled = False
        installation.provider_token = f"revoked:{installation.id}"
        installation.updated_at = datetime.utcnow()
        await self.db.flush()
