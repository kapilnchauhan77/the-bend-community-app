import hashlib
import io
import os
from pathlib import Path
from types import SimpleNamespace
from uuid import UUID

import pytest


def _pdf_bytes():
    from pypdf import PdfWriter

    output = io.BytesIO()
    writer = PdfWriter()
    writer.add_blank_page(width=72, height=72)
    writer.write(output)
    return output.getvalue()


class _Result:
    def __init__(self, row):
        self.row = row

    def scalar_one_or_none(self):
        return self.row


class _Session:
    def __init__(self, rows):
        self.rows = iter(rows)
        self.queries = []
        self.committed = False

    async def execute(self, query):
        self.queries.append(query)
        return _Result(next(self.rows))

    async def commit(self):
        self.committed = True

    async def rollback(self):
        return None


def _event(reference, **overrides):
    from app.models.enums import EventStatus
    from app.scripts.migrate_nonprofit_documents import EVENT_ID, EXPECTED_TENANT_ID

    fields = {
        "id": EVENT_ID,
        "tenant_id": EXPECTED_TENANT_ID,
        "status": EventStatus.PENDING,
        "organization_type": "verified_nonprofit",
        "is_nonprofit": True,
        "nonprofit_doc_url": reference,
    }
    fields.update(overrides)
    return SimpleNamespace(**fields)


def _paths(tmp_path, monkeypatch):
    import app.scripts.migrate_nonprofit_documents as migration

    private = tmp_path / "private_uploads" / "nonprofit_documents"
    public = tmp_path / "uploads" / "images"
    public.mkdir(parents=True)
    source = public / "2d60657c-bdcc-4c8a-846d-fdec1b2f844e.jpg"
    thumb = public / "2d60657c-bdcc-4c8a-846d-fdec1b2f844e_thumb.jpg"
    source.write_bytes(_pdf_bytes())
    thumb.write_bytes(_pdf_bytes())
    monkeypatch.setattr(migration, "PRIVATE_DOCUMENT_DIR", private)
    monkeypatch.setattr(migration, "EXPECTED_SHA256", hashlib.sha256(_pdf_bytes()).hexdigest())
    monkeypatch.setattr(migration, "EXPECTED_SIZE", len(_pdf_bytes()))
    final = private / f"{migration.EVENT_ID}.pdf"
    backup = private.parent / "repair_backups" / migration.EVENT_ID / thumb.name
    return source, thumb, final, backup


@pytest.mark.asyncio
async def test_new_state_is_locked_by_exact_id_before_public_cleanup(tmp_path, monkeypatch):
    from app.scripts.migrate_nonprofit_documents import EVENT_ID, EXPECTED_REFERENCE, NEW_REFERENCE, migrate_event

    source, thumb, final, backup = _paths(tmp_path, monkeypatch)
    final.parent.mkdir(parents=True)
    backup.parent.mkdir(parents=True)
    final.write_bytes(_pdf_bytes())
    backup.write_bytes(_pdf_bytes())
    session = _Session([_event(NEW_REFERENCE)])

    result = await migrate_event(
        session,
        event_id=EVENT_ID,
        expected_reference=EXPECTED_REFERENCE,
        dry_run=False,
        source_path=source,
    )

    lock_sql = str(session.queries[0])
    assert result.changed is True
    assert "FOR UPDATE" in lock_sql
    assert "events.id" in lock_sql
    assert "events.nonprofit_doc_url" not in lock_sql.split("WHERE", 1)[1]
    assert len(session.queries) == 1
    assert not source.exists()
    assert not thumb.exists()
    assert session.committed is False


@pytest.mark.asyncio
async def test_lock_and_cas_bind_uuid_values_for_uuid_columns(tmp_path, monkeypatch):
    from app.scripts.migrate_nonprofit_documents import (
        EVENT_ID,
        EXPECTED_REFERENCE,
        EXPECTED_TENANT_ID,
        migrate_event,
    )

    source, _, _, _ = _paths(tmp_path, monkeypatch)
    session = _Session([_event(EXPECTED_REFERENCE), EVENT_ID])
    await migrate_event(
        session,
        event_id=EVENT_ID,
        expected_reference=EXPECTED_REFERENCE,
        dry_run=False,
        source_path=source,
    )

    lock_values = set(session.queries[0].compile().params.values())
    cas_values = set(session.queries[1].compile().params.values())
    assert UUID(EVENT_ID) in lock_values
    assert UUID(EVENT_ID) in cas_values
    assert UUID(EXPECTED_TENANT_ID) in cas_values


@pytest.mark.asyncio
async def test_locked_event_with_wrong_guard_refuses_before_touching_files(tmp_path, monkeypatch):
    from app.scripts.migrate_nonprofit_documents import EVENT_ID, EXPECTED_REFERENCE, MigrationRefused, migrate_event

    source, thumb, _, _ = _paths(tmp_path, monkeypatch)
    session = _Session([_event(EXPECTED_REFERENCE, organization_type="for_profit")])

    with pytest.raises(MigrationRefused, match="organization type"):
        await migrate_event(session, event_id=EVENT_ID, expected_reference=EXPECTED_REFERENCE, source_path=source)

    assert "FOR UPDATE" in str(session.queries[0])
    assert source.exists()
    assert thumb.exists()


@pytest.mark.asyncio
async def test_apply_secures_recovered_private_files_and_directories(tmp_path, monkeypatch):
    from app.scripts.migrate_nonprofit_documents import EVENT_ID, EXPECTED_REFERENCE, migrate_event

    source, thumb, final, backup = _paths(tmp_path, monkeypatch)
    final.parent.mkdir(parents=True)
    backup.parent.mkdir(parents=True)
    final.write_bytes(_pdf_bytes())
    backup.write_bytes(_pdf_bytes())
    source.unlink()
    thumb.unlink()
    for path in (final, backup):
        os.chmod(path, 0o644)
    for path in (final.parent.parent, final.parent, backup.parent.parent, backup.parent):
        os.chmod(path, 0o755)
    session = _Session([_event(EXPECTED_REFERENCE), EVENT_ID])

    result = await migrate_event(
        session,
        event_id=EVENT_ID,
        expected_reference=EXPECTED_REFERENCE,
        dry_run=False,
        source_path=source,
    )

    assert result.changed is True
    assert session.committed is True
    assert os.stat(final).st_mode & 0o777 == 0o600
    assert os.stat(backup).st_mode & 0o777 == 0o600
    assert os.stat(final.parent.parent).st_mode & 0o777 == 0o700
    assert os.stat(final.parent).st_mode & 0o777 == 0o700
    assert os.stat(backup.parent.parent).st_mode & 0o777 == 0o700
    assert os.stat(backup.parent).st_mode & 0o777 == 0o700


@pytest.mark.asyncio
async def test_dry_run_leaves_recovered_private_permissions_unchanged(tmp_path, monkeypatch):
    from app.scripts.migrate_nonprofit_documents import EVENT_ID, EXPECTED_REFERENCE, NEW_REFERENCE, migrate_event

    source, thumb, final, backup = _paths(tmp_path, monkeypatch)
    final.parent.mkdir(parents=True)
    backup.parent.mkdir(parents=True)
    final.write_bytes(_pdf_bytes())
    backup.write_bytes(_pdf_bytes())
    for path in (final, backup):
        os.chmod(path, 0o644)
    for path in (final.parent.parent, final.parent, backup.parent.parent, backup.parent):
        os.chmod(path, 0o755)
    session = _Session([_event(NEW_REFERENCE)])

    result = await migrate_event(session, event_id=EVENT_ID, expected_reference=EXPECTED_REFERENCE, source_path=source)

    assert result.message == "public-file cleanup is pending"
    assert source.exists()
    assert thumb.exists()
    assert os.stat(final).st_mode & 0o777 == 0o644
    assert os.stat(backup).st_mode & 0o777 == 0o644
    assert os.stat(final.parent.parent).st_mode & 0o777 == 0o755
    assert os.stat(final.parent).st_mode & 0o777 == 0o755
    assert os.stat(backup.parent.parent).st_mode & 0o777 == 0o755
    assert os.stat(backup.parent).st_mode & 0o777 == 0o755
