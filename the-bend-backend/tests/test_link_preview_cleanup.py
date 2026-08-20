import asyncio
import os
from datetime import UTC, datetime, timedelta
from pathlib import Path

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
    def __init__(self, urls=(), draft_urls=(), error=None):
        import json

        self.records = {}
        for index, url in enumerate(urls):
            key = f"bender:link-preview:cache:{index}"
            self.records[key] = json.dumps({"metadata": {
                "url": "https://example.org",
                "title": "Example",
                "image_url": url,
            }})
        for index, url in enumerate(draft_urls):
            key = f"bender:link-preview:draft:{index}"
            self.records[key] = json.dumps({"user_id": "00000000-0000-0000-0000-000000000001",
                "tenant_id": None,
                "source_url": "https://example.org",
                "created_at": "2026-08-21T00:00:00Z",
                "preview": {
                    "version": 1,
                    "source_url": "https://example.org",
                    "url": "https://example.org",
                    "title": "Example",
                    "image_url": url,
                },
            })
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
async def test_stats_keep_database_and_redis_reference_counts_separate(tmp_path):
    now = datetime(2026, 8, 21, tzinfo=UTC)
    old = write_file(tmp_path, "0" * 64)
    recent = write_file(tmp_path, "1" * 64, age_days=2)
    database = write_file(tmp_path, "2" * 64)
    redis = write_file(tmp_path, "3" * 64)
    draft = write_file(tmp_path, "4" * 64)
    snapshot = {
        "version": 1,
        "source_url": "https://example.org/source",
        "url": "https://example.org/source",
        "title": "Example",
        "image_url": local_url("2" * 64),
    }

    stats = await cleanup_link_preview_image_files(
        FakeDB([snapshot]),
        FakeRedisStore([local_url("3" * 64)], [local_url("4" * 64)]),
        upload_dir=tmp_path,
        now=now,
    )

    assert tuple(stats.__dataclass_fields__) == (
        "scanned", "deleted", "recent", "database_referenced", "redis_referenced", "skipped"
    )
    assert stats.scanned == 5
    assert stats.deleted == 1
    assert stats.recent == 1
    assert stats.database_referenced == 1
    assert stats.redis_referenced == 2
    assert stats.skipped == 0
    assert not old.exists()
    assert recent.exists() and database.exists() and redis.exists() and draft.exists()


@pytest.mark.asyncio
async def test_exactly_thirty_days_old_is_preserved(tmp_path):
    now = datetime(2026, 8, 21, tzinfo=UTC)
    path = write_file(tmp_path, "5" * 64)
    boundary = (now - timedelta(days=30)).timestamp()
    os.utime(path, (boundary, boundary))

    stats = await cleanup_link_preview_image_files(
        FakeDB(), FakeRedisStore(), upload_dir=tmp_path, now=now
    )

    assert stats.deleted == 0
    assert stats.recent == 1
    assert path.exists()


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


@pytest.mark.asyncio
async def test_file_disappearing_during_delete_is_counted_as_skipped(tmp_path, monkeypatch):
    path = write_file(tmp_path, "6" * 64)
    original_unlink = Path.unlink

    def disappear(self, missing_ok=False):
        if self == path:
            raise FileNotFoundError(self)
        return original_unlink(self, missing_ok=missing_ok)

    monkeypatch.setattr(Path, "unlink", disappear)
    stats = await cleanup_link_preview_image_files(
        FakeDB(), FakeRedisStore(), upload_dir=tmp_path
    )
    assert stats.scanned == 1
    assert stats.deleted == 0
    assert stats.skipped == 1


@pytest.mark.asyncio
async def test_celery_task_forces_configured_import_and_registers_exact_task():
    from app.workers import celery_app

    celery_app.celery_app.loader.import_default_modules()
    assert "app.workers.scheduled_tasks" in celery_app.celery_app.conf.imports
    registered = celery_app.celery_app.tasks["app.workers.scheduled_tasks.cleanup_link_preview_images"]
    assert registered.name == "app.workers.scheduled_tasks.cleanup_link_preview_images"


def test_two_sync_cleanup_runs_create_and_close_task_local_redis_clients(monkeypatch):
    from app.workers import scheduled_tasks

    class FakeClient:
        def __init__(self, number):
            self.number = number
            self.closed = False

        async def aclose(self):
            self.closed = True

    clients = []

    def from_url(*_args, **_kwargs):
        client = FakeClient(len(clients) + 1)
        clients.append(client)
        return client

    class SessionContext:
        async def __aenter__(self):
            return object()

        async def __aexit__(self, *_args):
            return False

    async def fake_cleanup(_db, redis):
        assert redis is clients[-1]
        return LinkPreviewCleanupStats()

    monkeypatch.setattr(scheduled_tasks, "Redis", type("RedisFactory", (), {"from_url": staticmethod(from_url)}))
    monkeypatch.setattr(scheduled_tasks, "async_session", lambda: SessionContext())
    monkeypatch.setattr(scheduled_tasks, "cleanup_link_preview_image_files", fake_cleanup)

    scheduled_tasks.cleanup_link_preview_images.run()
    scheduled_tasks.cleanup_link_preview_images.run()

    assert [client.number for client in clients] == [1, 2]
    assert all(client.closed for client in clients)


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
