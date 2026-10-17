from datetime import datetime, timedelta
from uuid import uuid4

import pytest
import sqlalchemy as sa

from app.models.enums import ListingStatus
from app.repositories.listing_repo import ListingRepository
from app.workers.celery_app import celery_app


class _Result:
    def scalars(self):
        return self

    def unique(self):
        return self

    def all(self):
        return []


class _Session:
    statement = None

    async def execute(self, statement):
        self.statement = statement
        return _Result()

    async def commit(self):
        return None


def _seed_listing_table(connection, rows):
    from app.models.listing import Listing

    columns = ", ".join(f'"{column.name}" TEXT' for column in Listing.__table__.columns)
    connection.exec_driver_sql(f"CREATE TABLE listings ({columns})")
    for row in rows:
        values = {column.name: None for column in Listing.__table__.columns}
        values.update(row)
        values["expiry_date"] = (
            values["expiry_date"].strftime("%Y-%m-%d %H:%M:%S.%f")
            if values["expiry_date"] is not None
            else None
        )
        columns = ", ".join(f'"{name}"' for name in values)
        placeholders = ", ".join(f":{name}" for name in values)
        connection.exec_driver_sql(
            f"INSERT INTO listings ({columns}) VALUES ({placeholders})", values
        )


@pytest.mark.asyncio
async def test_active_browse_returns_only_unexpired_rows_and_preserves_status(monkeypatch):
    fixed_now = datetime(2026, 10, 17, 12, 0, 0)
    monkeypatch.setattr("app.repositories.listing_repo.datetime", type("Clock", (), {"utcnow": staticmethod(lambda: fixed_now)}))
    engine = sa.create_engine("sqlite://")
    connection = engine.connect()
    ids = {name: str(uuid4()) for name in ("null", "future", "past", "boundary", "fulfilled")}
    _seed_listing_table(connection, [
        {"id": ids["null"], "status": "ACTIVE", "expiry_date": None},
        {"id": ids["future"], "status": "ACTIVE", "expiry_date": fixed_now + timedelta(hours=1)},
        {"id": ids["past"], "status": "ACTIVE", "expiry_date": fixed_now - timedelta(seconds=1)},
        {"id": ids["boundary"], "status": "ACTIVE", "expiry_date": fixed_now},
        {"id": ids["fulfilled"], "status": "FULFILLED", "expiry_date": fixed_now - timedelta(days=1)},
    ])
    try:
        repository = ListingRepository(_Session())
        await repository.browse()
        default_statement = repository.session.statement
        await repository.browse(status=ListingStatus.ACTIVE.value)
        explicit_statement = repository.session.statement
        await repository.browse(status=ListingStatus.FULFILLED.value)
        fulfilled_statement = repository.session.statement

        from app.models.listing import Listing

        def execute_ids(statement):
            projected = statement.with_only_columns(Listing.id)
            return {str(value) for value in connection.execute(projected).scalars().all()}

        assert execute_ids(default_statement) == {ids["null"], ids["future"]}
        assert execute_ids(explicit_statement) == {ids["null"], ids["future"]}
        assert execute_ids(fulfilled_statement) == {ids["fulfilled"]}
    finally:
        connection.close()
        engine.dispose()


def test_celery_registers_expiry_tasks_and_keeps_expiry_date_schedules():
    celery_app.loader.import_default_modules()
    assert "app.workers.scheduled_tasks.check_expiring_listings" in celery_app.tasks
    assert "app.workers.scheduled_tasks.auto_expire_listings" in celery_app.tasks
    assert "check-expiring-listings" in celery_app.conf.beat_schedule
    assert "auto-expire-listings" in celery_app.conf.beat_schedule


@pytest.mark.asyncio
async def test_check_expiring_query_excludes_already_expired(monkeypatch):
    session = _Session()

    class _SessionContext:
        async def __aenter__(self):
            return session

        async def __aexit__(self, *_):
            return None

    monkeypatch.setattr("app.database.async_session", lambda: _SessionContext())
    from app.workers.scheduled_tasks import _check_expiring

    await _check_expiring()
    sql = str(session.statement)
    assert "listings.expiry_date >" in sql
    assert "listings.expiry_date <=" in sql


def test_expiry_runner_uses_and_disposes_a_separate_engine_per_loop(monkeypatch):
    import asyncio
    from app.workers import scheduled_tasks

    operation_loops = []
    engines = []

    async def operation(_session_factory):
        operation_loops.append(asyncio.get_running_loop())

    class _Engine:
        def __init__(self, *args, **kwargs):
            self.kwargs = kwargs
            engines.append(self)

        async def dispose(self):
            self.dispose_loop = asyncio.get_running_loop()

    monkeypatch.setattr("sqlalchemy.ext.asyncio.create_async_engine", _Engine)
    monkeypatch.setattr("sqlalchemy.ext.asyncio.async_sessionmaker", lambda *args, **kwargs: None)
    monkeypatch.setattr(scheduled_tasks, "get_settings", lambda: type("Settings", (), {"DATABASE_URL": "sqlite+aiosqlite://"})())
    scheduled_tasks._run_expiry_task(operation)
    scheduled_tasks._run_expiry_task(operation)

    assert len(operation_loops) == len(engines) == 2
    assert operation_loops[0] is not operation_loops[1]
    assert engines[0] is not engines[1]
    from sqlalchemy.pool import NullPool
    assert engines[0].kwargs["poolclass"] is NullPool
    assert engines[1].kwargs["poolclass"] is NullPool
    assert engines[0].dispose_loop is operation_loops[0]
    assert engines[1].dispose_loop is operation_loops[1]


def test_expiry_runner_disposes_engine_when_task_fails(monkeypatch):
    import asyncio
    from app.workers import scheduled_tasks

    operation_loop = []
    engine = None
    failure = RuntimeError("task failed")

    async def operation(_session_factory):
        operation_loop.append(asyncio.get_running_loop())
        raise failure

    class _Engine:
        async def dispose(self):
            engine.dispose_loop = asyncio.get_running_loop()

    engine = _Engine()
    monkeypatch.setattr("sqlalchemy.ext.asyncio.create_async_engine", lambda *args, **kwargs: engine)
    monkeypatch.setattr("sqlalchemy.ext.asyncio.async_sessionmaker", lambda *args, **kwargs: None)
    monkeypatch.setattr(scheduled_tasks, "get_settings", lambda: type("Settings", (), {"DATABASE_URL": "sqlite+aiosqlite://"})())
    with pytest.raises(RuntimeError, match="task failed"):
        scheduled_tasks._run_expiry_task(operation)

    assert operation_loop[0] is engine.dispose_loop


def test_unrelated_scheduled_wrappers_do_not_use_expiry_runner(monkeypatch):
    from app.workers import scheduled_tasks

    called = []
    def fail_if_called(_):
        called.append(True)
        raise AssertionError("unrelated task used the expiry runner")

    monkeypatch.setattr(scheduled_tasks, "_run_expiry_task", fail_if_called)

    async def noop():
        return None

    for wrapper, target in (
        (scheduled_tasks.auto_expire_old_listings, "_expire_old"),
        (scheduled_tasks.cleanup_read_notifications, "_cleanup_notifications"),
        (scheduled_tasks.cleanup_link_preview_images, "_cleanup_link_preview_images"),
    ):
        monkeypatch.setattr(scheduled_tasks, target, noop)
        wrapper()

    assert called == []
