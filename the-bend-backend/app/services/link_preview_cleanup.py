"""Conservative retention cleanup for Bend-managed link-preview images."""

from __future__ import annotations

import asyncio
import logging
import re
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from sqlalchemy import select

from app.models.bender import BenderPost
from app.schemas.bender import BenderLinkPreviewSnapshot
from app.services.bender_link_preview_store import BenderLinkPreviewStore
from app.services.file_service import UPLOAD_DIR
from app.services.link_preview_image_store import link_preview_directory_lock

logger = logging.getLogger(__name__)

_DIGEST_FILE = re.compile(r"^[0-9a-f]{64}\.webp$")
_LOCAL_IMAGE = re.compile(r"^/uploads/link-previews/([0-9a-f]{64})\.webp$")
_RETENTION = timedelta(days=30)


@dataclass(frozen=True)
class LinkPreviewCleanupStats:
    scanned: int = 0
    deleted: int = 0
    recent: int = 0
    database_referenced: int = 0
    redis_referenced: int = 0
    skipped: int = 0


def _image_dir(upload_dir: Path | str) -> Path:
    path = Path(upload_dir)
    return path if path.name == "link-previews" else path / "link-previews"


def _trusted_database_references(values: list[Any]) -> set[str]:
    references: set[str] = set()
    for value in values:
        if not isinstance(value, dict) or value.get("version") != 1:
            continue
        try:
            snapshot = BenderLinkPreviewSnapshot.model_validate(value)
        except Exception:
            continue
        if snapshot.image_url:
            match = _LOCAL_IMAGE.fullmatch(snapshot.image_url)
            if match:
                references.add(match.group(1) + ".webp")
    return references


def _delete_unreferenced(
    image_dir: Path,
    references: set[str],
    *,
    now: datetime,
) -> LinkPreviewCleanupStats:
    cutoff = now.timestamp() - _RETENTION.total_seconds()
    scanned = deleted = recent = database_referenced = redis_referenced = skipped = 0
    try:
        entries = list(image_dir.iterdir())
    except (FileNotFoundError, NotADirectoryError, OSError):
        return LinkPreviewCleanupStats()

    with link_preview_directory_lock(image_dir, shared=False):
        for path in entries:
            try:
                stat = path.lstat()
                if not _DIGEST_FILE.fullmatch(path.name) or not path.is_file() or path.is_symlink():
                    skipped += 1
                    continue
                scanned += 1
                # Re-read after taking the exclusive lock. A store touch that won
                # the race makes this file recent and therefore undeletable.
                stat = path.stat(follow_symlinks=False)
                if stat.st_mtime >= cutoff:
                    recent += 1
                    continue
                if path.name in references.database:
                    database_referenced += 1
                    continue
                if path.name in references.redis:
                    redis_referenced += 1
                    continue
                try:
                    path.unlink()
                    deleted += 1
                except (FileNotFoundError, NotADirectoryError, OSError):
                    skipped += 1
            except (FileNotFoundError, NotADirectoryError, OSError):
                skipped += 1
    return LinkPreviewCleanupStats(
        scanned,
        deleted,
        recent,
        database_referenced,
        redis_referenced,
        skipped,
    )


@dataclass(frozen=True)
class _ReferenceSets:
    database: frozenset[str]
    redis: frozenset[str]


async def cleanup_link_preview_image_files(
    db: Any,
    redis: Any,
    *,
    upload_dir: Path | str = UPLOAD_DIR,
    now: datetime | None = None,
) -> LinkPreviewCleanupStats:
    """Delete only old, direct, lowercase digest files with no trusted references."""

    try:
        result = await db.execute(select(BenderPost.link_preview).where(BenderPost.link_preview.is_not(None)))
        database_references = _trusted_database_references(result.scalars().all())
    except Exception:
        return LinkPreviewCleanupStats()

    try:
        store = BenderLinkPreviewStore(redis)
        live_urls = await store.live_image_urls()
        live_references = set()
        for value in live_urls:
            if isinstance(value, str):
                match = _LOCAL_IMAGE.fullmatch(value)
                if match:
                    live_references.add(match.group(1) + ".webp")
    except Exception:
        return LinkPreviewCleanupStats()

    references = _ReferenceSets(
        database=frozenset(database_references),
        redis=frozenset(live_references),
    )
    cleanup_now = now or datetime.now(UTC)
    if cleanup_now.tzinfo is None:
        cleanup_now = cleanup_now.replace(tzinfo=UTC)
    return await asyncio.to_thread(
        _delete_unreferenced,
        _image_dir(upload_dir),
        references,
        now=cleanup_now,
    )


__all__ = ["LinkPreviewCleanupStats", "cleanup_link_preview_image_files"]
