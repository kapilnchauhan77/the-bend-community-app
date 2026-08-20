import asyncio
import os
from datetime import UTC, datetime, timedelta
from pathlib import Path
from types import SimpleNamespace

import pytest

from app.services.link_preview_cleanup import (
    LinkPreviewCleanupStats,
    cleanup_link_preview_image_files,
)
from app.services.link_preview_image_store import link_preview_directory_lock


class FakeResult:
    def __init__(self, values):
        self.values = values

    def scalars(self):
        return self

    def all(self):
        return self.values


class FakeDB:
    def __init__(self, values=(), error=None):
        self.values = list(values)
        self.error = error

    async def execute(self, _query):
        if self.error:
            raise self.error
        return FakeResult(self.values)


class FakeRedisStore:
    def __init__(self, urls=(), error=None):
        import json

        self.records = {}
        for index, url in enumerate(urls):
            key = f"bender:link-preview:cache:{index}"
            self.records[key] = json.dumps({"metadata": {
                "url": "https://example.org",
                "title": "Example",
                "image_url": url,
            }})
        self.error = error

    async def scan_iter(self, match):
        if self.error:
            raise self.error
        for key in self.records:
            if key.startswith(match.removesuffix("*")):
                yield key

    async def get(self, key):
        if self.error:
            raise self.error
        return self.records.get(key)


def local_url(digest):
    return f"/uploads/link-previews/{digest}.webp"


def write_file(root: Path, digest: str, *, age_days=31):
    path = root / "link-previews" / f"{digest}.webp"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"image")
    stamp = (datetime.now(UTC) - timedelta(days=age_days)).timestamp()
    path.touch()
    import os

    os.utime(path, (stamp, stamp))
    return path


@pytest.mark.asyncio
async def test_deletes_old_unreferenced_and_preserves_recent_and_referenced(tmp_path):
    old = "a" * 64
    recent = "b" * 64
    database = "c" * 64
    live = "d" * 64
    old_path = write_file(tmp_path, old)
    recent_path = write_file(tmp_path, recent, age_days=2)
    database_path = write_file(tmp_path, database)
    live_path = write_file(tmp_path, live)

    snapshot = {
        "version": 1,
        "source_url": "https://example.org/source",
        "url": "https://example.org/source",
        "title": "Example",
        "image_url": local_url(database),
    }
    stats = await cleanup_link_preview_image_files(
        FakeDB([snapshot]),
        FakeRedisStore([local_url(live)]),
        upload_dir=tmp_path,
        now=datetime.now(UTC),
    )

    assert isinstance(stats, LinkPreviewCleanupStats)
    assert stats.deleted == 1
    assert not old_path.exists()
    assert recent_path.exists() and database_path.exists() and live_path.exists()


@pytest.mark.asyncio
async def test_lookup_uncertainty_fails_closed(tmp_path):
    old = write_file(tmp_path, "e" * 64)
    stats = await cleanup_link_preview_image_files(
        FakeDB(error=RuntimeError("db unavailable")),
        FakeRedisStore(),
        upload_dir=tmp_path,
    )
    assert stats.deleted == 0
    assert old.exists()

    stats = await cleanup_link_preview_image_files(
        FakeDB(),
        FakeRedisStore(error=RuntimeError("redis unavailable")),
        upload_dir=tmp_path,
    )
    assert stats.deleted == 0
    assert old.exists()


@pytest.mark.asyncio
async def test_malformed_entries_and_names_are_skipped_idempotently(tmp_path):
    image_dir = tmp_path / "link-previews"
    image_dir.mkdir(parents=True)
    valid = write_file(tmp_path, "f" * 64)
    (image_dir / ("A" * 64 + ".webp")).write_bytes(b"x")
    (image_dir / ("1" * 64 + ".jpg")).write_bytes(b"x")
    (image_dir / ".tmp").write_bytes(b"x")
    (image_dir / ("2" * 64 + ".webp")).mkdir()
    (tmp_path / ("3" * 64 + ".webp")).write_bytes(b"outside")
    (image_dir / "link.txt").write_bytes(b"x")

    malformed = {"source_url": "https://example.org", "title": "missing version"}
    stats = await cleanup_link_preview_image_files(
        FakeDB([malformed, {"not": "a snapshot"}]),
        FakeRedisStore(),
        upload_dir=tmp_path,
    )
    assert stats.deleted == 1
    assert not valid.exists()
    second = await cleanup_link_preview_image_files(
        FakeDB(), FakeRedisStore(), upload_dir=tmp_path
    )
    assert second.deleted == 0


@pytest.mark.asyncio
async def test_symlink_is_skipped_and_mtime_is_reread_after_lock(tmp_path):
    target = tmp_path / "outside.webp"
    target.write_bytes(b"outside")
    symlink = tmp_path / "link-previews" / ("9" * 64 + ".webp")
    symlink.parent.mkdir(parents=True)
    symlink.symlink_to(target)
    raced = write_file(tmp_path, "8" * 64)

    async with _held_shared_lock(tmp_path):
        os.utime(raced, None)
        pending = asyncio.create_task(
            cleanup_link_preview_image_files(FakeDB(), FakeRedisStore(), upload_dir=tmp_path)
        )
        await asyncio.sleep(0.03)
        assert not pending.done()
    stats = await pending
    assert stats.deleted == 0
    assert raced.exists() and target.exists() and symlink.is_symlink()


class _held_shared_lock:
    def __init__(self, root):
        self.root = root
        self.lock = None

    async def __aenter__(self):
        self.lock = link_preview_directory_lock(self.root, shared=True)
        await asyncio.to_thread(self.lock.__enter__)
        return self

    async def __aexit__(self, exc_type, exc, tb):
        await asyncio.to_thread(self.lock.__exit__, exc_type, exc, tb)


@pytest.mark.asyncio
async def test_task_is_registered_and_scheduled_at_four_utc():
    from app.workers import celery_app, scheduled_tasks

    entry = celery_app.celery_app.conf.beat_schedule["cleanup-link-preview-images"]
    assert entry["task"] == "app.workers.scheduled_tasks.cleanup_link_preview_images"
    assert entry["schedule"].hour == {4}
    assert entry["schedule"].minute == {0}
    assert scheduled_tasks.cleanup_link_preview_images.name == entry["task"]
