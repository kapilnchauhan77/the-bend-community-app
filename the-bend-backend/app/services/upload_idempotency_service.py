"""Short-lived Redis replay protection for authenticated media uploads."""
import hashlib
import json
import re
from dataclasses import dataclass
from typing import Any

from redis.exceptions import RedisError

from app.config import get_settings
from app.core.rate_limit import get_redis

_KEY_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", re.I)
_TTL_SECONDS = 24 * 60 * 60
_memory: dict[str, dict[str, Any]] = {}

class UploadIdempotencyUnavailable(RuntimeError):
    """Redis is unavailable; uploads fail closed to prevent cross-worker duplicates."""


@dataclass(frozen=True)
class UploadClaim:
    claim_key: str
    response: dict[str, Any] | None = None
    in_progress: bool = False


class UploadIdempotencyService:
    def _key(self, tenant_id: Any, user_id: Any, endpoint: str, key: str) -> str:
        if not _KEY_RE.fullmatch(key):
            raise ValueError("Idempotency-Key must be UUID-shaped")
        if str(user_id) in {"anonymous", "None"} or (str(tenant_id) == "public" and not _KEY_RE.fullmatch(str(user_id))):
            raise ValueError("Anonymous client ID must be UUID-shaped")
        digest = hashlib.sha256(key.encode()).hexdigest()
        return f"upload-idempotency:{tenant_id}:{user_id}:{endpoint}:{digest}"

    async def claim(self, tenant_id: Any, user_id: Any, endpoint: str, key: str) -> UploadClaim:
        claim_key = self._key(tenant_id, user_id, endpoint, key)
        try:
            redis = await get_redis()
            raw = await redis.get(claim_key)
            if raw:
                value = json.loads(raw)
                if value.get("state") == "complete":
                    return UploadClaim(claim_key, value.get("response"))
                return UploadClaim(claim_key, in_progress=True)
            created = await redis.set(claim_key, json.dumps({"state": "in_progress"}), ex=_TTL_SECONDS, nx=True)
            if not created:
                return UploadClaim(claim_key, in_progress=True)
        except (RedisError, OSError, RuntimeError) as exc:
            raise UploadIdempotencyUnavailable("Upload replay protection unavailable") from exc
        return UploadClaim(claim_key)

    async def complete(self, claim_key: str, response: dict[str, Any]) -> None:
        payload = {"state": "complete", "response": response}
        try:
            redis = await get_redis()
            await redis.set(claim_key, json.dumps(payload), ex=_TTL_SECONDS)
        except (RedisError, OSError, RuntimeError) as exc:
            raise UploadIdempotencyUnavailable("Upload replay protection unavailable") from exc

    async def release(self, claim_key: str) -> None:
        try:
            redis = await get_redis()
            await redis.delete(claim_key)
        except (RedisError, OSError, RuntimeError) as exc:
            raise UploadIdempotencyUnavailable("Upload replay protection unavailable") from exc
