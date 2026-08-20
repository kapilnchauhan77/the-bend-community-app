"""Bound Redis cache and draft storage for Bender link previews."""

from __future__ import annotations

import hashlib
import json
import secrets
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from pydantic import ValidationError

from app.schemas.bender import (
    BenderLinkPreviewSnapshot,
    LinkPreviewCacheRecord,
    LinkPreviewDraftRecord,
    LinkPreviewMetadata,
)
from app.services.bender_link_urls import first_http_url
from app.services.link_preview_errors import LinkPreviewOutcome


class BenderLinkPreviewStore:
    CACHE_PREFIX = "bender:link-preview:cache:"
    DRAFT_PREFIX = "bender:link-preview:draft:"
    METRIC_PREFIX = "bender:link-preview:metric:"
    CACHE_TTL_SECONDS = 1200
    MAX_RAW_JSON_BYTES = 64 * 1024
    MAX_DRAFT_TOKEN_LENGTH = 128
    METRIC_TTL_SECONDS = 8 * 24 * 60 * 60
    _OUTCOMES = frozenset(
        {
            "success",
            "cache_hit",
            "blocked_destination",
            "timeout",
            "invalid_content",
            "oversized_response",
            "image_processing_failure",
        }
    )

    def __init__(self, redis: Any, *, ttl_seconds: int = CACHE_TTL_SECONDS):
        self.redis = redis
        self.ttl_seconds = ttl_seconds

    @staticmethod
    def _hash(value: str) -> str:
        return hashlib.sha256(value.encode("utf-8")).hexdigest()

    @classmethod
    def _bounded_json(cls, raw: Any) -> dict[str, Any] | None:
        try:
            if isinstance(raw, bytes):
                if len(raw) > cls.MAX_RAW_JSON_BYTES:
                    return None
                raw = raw.decode("utf-8", errors="strict")
            if not isinstance(raw, str) or len(raw.encode("utf-8")) > cls.MAX_RAW_JSON_BYTES:
                return None
            value = json.loads(raw)
        except (UnicodeError, ValueError, TypeError, RecursionError):
            return None
        return value if isinstance(value, dict) else None

    async def _validated_cache(self, key: str) -> LinkPreviewMetadata | None:
        raw = await self.redis.get(key)
        if raw is None:
            return None
        try:
            payload = self._bounded_json(raw)
            record = LinkPreviewCacheRecord.model_validate(payload)
        except (ValidationError, TypeError, ValueError):
            await self.redis.delete(key)
            return None
        return record.metadata

    async def get_cached_metadata(self, normalized_request_url: str) -> LinkPreviewMetadata | None:
        key = self.CACHE_PREFIX + self._hash(normalized_request_url)
        return await self._validated_cache(key)

    async def cache_metadata(
        self,
        normalized_request_url: str,
        metadata: LinkPreviewMetadata,
        *,
        final_url: str | None = None,
    ) -> None:
        record = LinkPreviewCacheRecord(metadata=metadata)
        encoded = record.model_dump_json()
        aliases = dict.fromkeys((normalized_request_url, final_url or metadata.url))
        for alias in aliases:
            key = self.CACHE_PREFIX + self._hash(alias)
            await self.redis.setex(key, self.ttl_seconds, encoded)

    async def issue_draft(
        self,
        snapshot: BenderLinkPreviewSnapshot,
        *,
        user_id: UUID,
        tenant_id: UUID | None,
    ) -> str:
        token = secrets.token_urlsafe(32)
        record = LinkPreviewDraftRecord(
            user_id=user_id,
            tenant_id=tenant_id,
            source_url=snapshot.source_url,
            created_at=datetime.now(UTC),
            preview=snapshot,
        )
        key = self.DRAFT_PREFIX + self._hash(token)
        await self.redis.setex(key, self.ttl_seconds, record.model_dump_json())
        return token

    async def resolve_draft(
        self,
        token: str,
        *,
        user_id: UUID,
        tenant_id: UUID | None,
        caption: str | None,
    ) -> BenderLinkPreviewSnapshot | None:
        if not isinstance(token, str) or not token or len(token) > self.MAX_DRAFT_TOKEN_LENGTH:
            return None
        try:
            token.encode("utf-8")
        except UnicodeEncodeError:
            return None
        key = self.DRAFT_PREFIX + self._hash(token)
        raw = await self.redis.get(key)
        if raw is None:
            return None
        try:
            payload = self._bounded_json(raw)
            record = LinkPreviewDraftRecord.model_validate(payload)
        except (ValidationError, TypeError, ValueError):
            await self.redis.delete(key)
            return None
        if record.source_url != record.preview.source_url:
            await self.redis.delete(key)
            return None
        if record.user_id != user_id or record.tenant_id != tenant_id:
            return None
        if first_http_url(caption) != record.source_url:
            return None
        return record.preview

    async def record_outcome(self, outcome: LinkPreviewOutcome) -> None:
        if outcome not in self._OUTCOMES:
            raise ValueError("unsupported link-preview outcome")
        key = f"{self.METRIC_PREFIX}{datetime.now(UTC):%Y%m%d}:{outcome}"
        pipeline_factory = getattr(self.redis, "pipeline", None)
        if pipeline_factory is not None:
            pipeline = pipeline_factory(transaction=True)
            if pipeline is not None:
                pipeline.incr(key)
                pipeline.expire(key, self.METRIC_TTL_SECONDS)
                await pipeline.execute()
                return
        await self.redis.incr(key)
        await self.redis.expire(key, self.METRIC_TTL_SECONDS)

    async def live_image_urls(self) -> set[str]:
        image_urls: set[str] = set()
        async for key in self.redis.scan_iter(match=self.CACHE_PREFIX + "*"):
            raw = await self.redis.get(key)
            payload = self._bounded_json(raw)
            if payload is None:
                continue
            try:
                record = LinkPreviewCacheRecord.model_validate(payload)
            except Exception:
                continue
            if record.metadata.image_url:
                image_urls.add(record.metadata.image_url)
        async for key in self.redis.scan_iter(match=self.DRAFT_PREFIX + "*"):
            raw = await self.redis.get(key)
            payload = self._bounded_json(raw)
            if payload is None:
                continue
            try:
                record = LinkPreviewDraftRecord.model_validate(payload)
            except Exception:
                continue
            if record.preview.image_url:
                image_urls.add(record.preview.image_url)
        return image_urls


__all__ = ["BenderLinkPreviewStore"]
