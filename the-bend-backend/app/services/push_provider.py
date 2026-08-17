"""Lazy APNs and FCM adapters with a deliberately tiny, sanitized result API."""

from __future__ import annotations

from dataclasses import dataclass
import re
from typing import Any

from app.config import get_settings


_CODE_RE = re.compile(r"[^a-z0-9_.-]+", re.IGNORECASE)


def _safe_code(value: str, default: str = "provider_error") -> str:
    """Keep only a short provider-independent error code, never exception text."""
    value = str(value or default).split(":", 1)[0].split(" ", 1)[0]
    value = _CODE_RE.sub("_", value).strip("_.-").lower()
    return value[:64] or default


@dataclass(frozen=True, slots=True)
class ProviderResult:
    kind: str
    code: str

    @classmethod
    def delivered(cls, code: str = "accepted") -> "ProviderResult":
        return cls("delivered", _safe_code(code, "accepted"))

    @classmethod
    def transient(cls, code: str = "temporary_failure") -> "ProviderResult":
        return cls("transient", _safe_code(code, "temporary_failure"))

    @classmethod
    def permanent(cls, code: str = "permanent_failure") -> "ProviderResult":
        return cls("permanent", _safe_code(code, "permanent_failure"))

    @classmethod
    def invalid_token(cls, code: str = "invalid_token") -> "ProviderResult":
        return cls("invalid_token", _safe_code(code, "invalid_token"))


class PushProvider:
    async def send(self, installation: Any, payload: dict[str, Any]) -> ProviderResult:
        raise NotImplementedError


class APNsProvider(PushProvider):
    """APNs provider; aioapns is imported and configured only when sending."""

    def __init__(self, settings: Any | None = None):
        self.settings = settings or get_settings()

    async def send(self, installation: Any, payload: dict[str, Any]) -> ProviderResult:
        if not all((self.settings.APNS_TEAM_ID, self.settings.APNS_KEY_ID, self.settings.APNS_PRIVATE_KEY, self.settings.APNS_BUNDLE_ID)):
            return ProviderResult.permanent("provider_not_configured")
        try:
            from aioapns import APNs, NotificationRequest
        except ImportError:
            return ProviderResult.permanent("provider_unavailable")

        try:
            client = APNs(
                key=self.settings.APNS_PRIVATE_KEY,
                key_id=self.settings.APNS_KEY_ID,
                team_id=self.settings.APNS_TEAM_ID,
                topic=self.settings.APNS_BUNDLE_ID,
                use_sandbox=self.settings.APNS_USE_SANDBOX,
            )
            request = NotificationRequest(
                device_token=installation.provider_token,
                message={"aps": {"alert": {"title": payload["title"], "body": payload["body"]}, "content-available": 1}, "data": payload},
            )
            response = await client.send_notification(request)
            if getattr(response, "is_successful", False):
                return ProviderResult.delivered("accepted")
            # aioapns 4.x exposes a sanitized description/status pair; older
            # releases used reason. Never retain the response body.
            reason = getattr(response, "description", None) or getattr(response, "reason", None) or f"status_{getattr(response, 'status', 'rejected')}"
            code = _safe_code(reason)
            normalized = code.replace("_", "")
            if normalized in {"baddevicetoken", "unregistered", "devicetokennotfortopic"}:
                return ProviderResult.invalid_token(code)
            if normalized in {"serviceunavailable", "shutdown", "toomanyrequests", "internalservererror"}:
                return ProviderResult.transient(code)
            return ProviderResult.permanent(code)
        except (TimeoutError, ConnectionError):
            return ProviderResult.transient("provider_unreachable")
        except Exception:
            return ProviderResult.transient("provider_error")


class FCMProvider(PushProvider):
    """Firebase provider; firebase-admin initialization is lazy and credential-free at import."""

    def __init__(self, settings: Any | None = None):
        self.settings = settings or get_settings()
        self._app = None

    def _ensure_app(self):
        if self._app is not None:
            return self._app
        if not self.settings.FIREBASE_SERVICE_ACCOUNT_JSON:
            return None
        try:
            import json
            import firebase_admin
            from firebase_admin import credentials
            try:
                self._app = firebase_admin.get_app()
            except ValueError:
                info = json.loads(self.settings.FIREBASE_SERVICE_ACCOUNT_JSON)
                self._app = firebase_admin.initialize_app(credentials.Certificate(info))
            return self._app
        except Exception:
            return None

    async def send(self, installation: Any, payload: dict[str, Any]) -> ProviderResult:
        if self._ensure_app() is None:
            return ProviderResult.permanent("provider_not_configured")
        try:
            from firebase_admin import messaging
            message = messaging.Message(
                token=installation.provider_token,
                notification=messaging.Notification(title=payload["title"], body=payload["body"]),
                data={key: str(value) for key, value in payload.items()},
            )
            # firebase-admin is synchronous; isolate its network call from the event loop.
            import asyncio
            await asyncio.to_thread(messaging.send, message, app=self._app)
            return ProviderResult.delivered("accepted")
        except Exception as exc:
            code = _safe_code(type(exc).__name__, "provider_error")
            if code.lower() in {"unregisterederror", "notfounderror"}:
                return ProviderResult.invalid_token("unregistered")
            if code.lower() in {"unavailableerror", "deadlineexceedederror", "internalerror"}:
                return ProviderResult.transient("provider_unavailable")
            return ProviderResult.permanent("provider_rejected")


def provider_for_platform(platform: str, settings: Any | None = None) -> PushProvider | None:
    if platform == "ios":
        return APNsProvider(settings)
    if platform == "android":
        return FCMProvider(settings)
    return None
