import io
import hashlib
import os
import types
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image

from app.api.deps import get_db
from app.api.v1.admin import get_event_service, router as admin_router
from app.api.v1.upload import enforce_nonprofit_upload_rate_limit, router as upload_router
from app.core.exceptions import AppException
from app.core.permissions import get_current_user
from app.core.permissions import get_current_tenant
from app.models.enums import UserRole
from app.services.event_service import EventService


def image_bytes(fmt: str) -> bytes:
    out = io.BytesIO()
    Image.new("RGB", (4, 4), (20, 80, 140)).save(out, format=fmt)
    return out.getvalue()


def pdf_bytes() -> bytes:
    from pypdf import PdfWriter

    output = io.BytesIO()
    writer = PdfWriter()
    writer.add_blank_page(width=72, height=72)
    writer.write(output)
    return output.getvalue()


def test_document_service_detects_real_pdf_jpeg_and_png_bytes():
    from app.services.nonprofit_document_service import detect_document

    assert detect_document(pdf_bytes()) == ("application/pdf", ".pdf")
    assert detect_document(image_bytes("JPEG")) == ("image/jpeg", ".jpg")
    assert detect_document(image_bytes("PNG")) == ("image/png", ".png")


def test_document_service_rejects_malformed_and_unsupported_bytes():
    from app.services.nonprofit_document_service import DocumentValidationError, detect_document

    with pytest.raises(DocumentValidationError):
        detect_document(b"not a document")
    with pytest.raises(DocumentValidationError):
        detect_document(image_bytes("WEBP"))


def test_document_service_resolves_only_contained_managed_paths(tmp_path, monkeypatch):
    import app.services.nonprofit_document_service as service

    monkeypatch.setattr(service, "PRIVATE_DOCUMENT_DIR", tmp_path)
    tenant_id = uuid4()
    document_id = uuid4()
    managed = tmp_path / str(tenant_id) / f"{document_id}.pdf"
    managed.parent.mkdir()
    managed.write_bytes(pdf_bytes())
    assert service.resolve_reference(f"nonprofit-documents/{tenant_id}/{document_id}.pdf") == managed
    with pytest.raises(service.DocumentReferenceError):
        service.resolve_reference("nonprofit-documents/../secret.pdf")
    with pytest.raises(service.DocumentReferenceError):
        service.resolve_reference("https://example.com/file.pdf")


def _app(role=UserRole.COMMUNITY_ADMIN, event_service=None):
    app = FastAPI()

    @app.exception_handler(AppException)
    async def app_exception_handler(_request, exc):
        return __import__("fastapi").responses.JSONResponse(status_code=exc.status_code, content=exc.detail)

    async def no_database():
        yield None

    app.dependency_overrides[get_db] = no_database
    app.dependency_overrides[get_current_tenant] = lambda: types.SimpleNamespace(id=uuid4())
    async def allow_upload():
        return None
    app.dependency_overrides[enforce_nonprofit_upload_rate_limit] = allow_upload
    if role is not None:
        async def current_user():
            return types.SimpleNamespace(role=role, tenant_id=uuid4())
        app.dependency_overrides[get_current_user] = current_user
    if event_service is not None:
        app.dependency_overrides[get_event_service] = lambda: event_service
    app.include_router(upload_router, prefix="/api/v1")
    app.include_router(admin_router, prefix="/api/v1")
    return app


def test_upload_nonprofit_document_returns_managed_reference(tmp_path, monkeypatch):
    import app.services.nonprofit_document_service as service
    monkeypatch.setattr(service, "PRIVATE_DOCUMENT_DIR", tmp_path)
    with TestClient(_app(role=None)) as client:
        response = client.post("/api/v1/upload/nonprofit-document", files={"file": ("proof.bin", pdf_bytes(), "application/octet-stream")})
    assert response.status_code == 200
    ref = response.json()["document_ref"]
    assert ref.startswith("nonprofit-documents/") and ref.endswith(".pdf")
    stored = tmp_path / ref.removeprefix("nonprofit-documents/")
    assert stored.read_bytes() == pdf_bytes()
    assert stored.parent.stat().st_mode & 0o777 == 0o700
    assert stored.stat().st_mode & 0o777 == 0o600


def test_upload_nonprofit_document_rejects_oversize(tmp_path, monkeypatch):
    import app.services.nonprofit_document_service as service
    monkeypatch.setattr(service, "PRIVATE_DOCUMENT_DIR", tmp_path)
    with TestClient(_app(role=None)) as client:
        response = client.post("/api/v1/upload/nonprofit-document", files={"file": ("proof.pdf", b"%PDF-" + b"x" * (10 * 1024 * 1024), "application/pdf")})
    assert response.status_code == 413


def test_admin_document_download_has_private_headers_and_correct_legacy_mime(tmp_path, monkeypatch):
    import app.services.nonprofit_document_service as service
    monkeypatch.setattr(service, "PRIVATE_DOCUMENT_DIR", tmp_path / "private")
    legacy = tmp_path / "uploads" / "images"
    legacy.mkdir(parents=True)
    legacy_file = legacy / "legacy.jpg"
    legacy_file.write_bytes(pdf_bytes())
    event = types.SimpleNamespace(id=uuid4(), nonprofit_doc_url="/uploads/images/legacy.jpg")

    monkeypatch.setattr(service, "LEGACY_UPLOAD_DIR", legacy)
    async def get_event(self, event_id):
        assert event_id == event.id
        return event
    monkeypatch.setattr(EventService, "get_event", get_event)
    with TestClient(_app()) as client:
        response = client.get(f"/api/v1/admin/events/{event.id}/nonprofit-document")
    assert response.status_code == 200
    assert response.content == pdf_bytes()
    assert response.headers["content-type"].startswith("application/pdf")
    assert response.headers["content-disposition"] == "inline"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["cache-control"] == "private, no-store"


def test_admin_document_download_requires_admin():
    with TestClient(_app(role=None)) as client:
        response = client.get(f"/api/v1/admin/events/{uuid4()}/nonprofit-document")
    assert response.status_code == 401


def test_admin_document_download_rejects_non_admin():
    with TestClient(_app(role=UserRole.INDIVIDUAL)) as client:
        response = client.get(f"/api/v1/admin/events/{uuid4()}/nonprofit-document")
    assert response.status_code == 403


def test_admin_document_download_sets_tenant_scope_and_preserves_not_found(tmp_path, monkeypatch):
    from app.core.exceptions import NotFoundError

    observed = {}

    async def get_event(self, event_id):
        observed["tenant_id"] = self.tenant_id
        raise NotFoundError("Event")

    monkeypatch.setattr(EventService, "get_event", get_event)
    with TestClient(_app()) as client:
        response = client.get(f"/api/v1/admin/events/{uuid4()}/nonprofit-document")
    assert response.status_code == 404
    assert observed["tenant_id"] is not None


@pytest.mark.asyncio
async def test_nonprofit_upload_rate_limit_fails_closed_when_redis_is_unavailable(monkeypatch):
    import app.api.v1.upload as upload_api
    from fastapi import Request
    from redis.exceptions import RedisError
    from app.core.exceptions import AppException

    async def unavailable(*args, **kwargs):
        raise RedisError("down")

    monkeypatch.setattr(upload_api, "check_rate_limit", unavailable)
    request = Request({"type": "http", "method": "POST", "path": "/api/v1/upload/nonprofit-document", "headers": [], "client": ("127.0.0.1", 1)})
    with pytest.raises(AppException) as error:
        await enforce_nonprofit_upload_rate_limit(request)
    assert error.value.status_code == 503


class _MigrationResult:
    def __init__(self, row):
        self.row = row

    def scalar_one_or_none(self):
        return self.row


class _MigrationSession:
    def __init__(self, rows, *, commit_error=None):
        self.rows = iter(rows)
        self.queries = []
        self.committed = False
        self.rolled_back = False
        self.commit_error = commit_error

    async def execute(self, query):
        self.queries.append(query)
        return _MigrationResult(next(self.rows))

    async def commit(self):
        if self.commit_error:
            raise self.commit_error
        self.committed = True

    async def rollback(self):
        self.rolled_back = True


def _migration_files(tmp_path, monkeypatch):
    import app.scripts.migrate_nonprofit_documents as migration

    private = tmp_path / "private_uploads" / "nonprofit_documents"
    public = tmp_path / "uploads" / "images"
    public.mkdir(parents=True)
    source = public / "2d60657c-bdcc-4c8a-846d-fdec1b2f844e.jpg"
    source.write_bytes(pdf_bytes())
    thumb = public / "2d60657c-bdcc-4c8a-846d-fdec1b2f844e_thumb.jpg"
    thumb.write_bytes(pdf_bytes())
    monkeypatch.setattr(migration, "PRIVATE_DOCUMENT_DIR", private)
    monkeypatch.setattr(migration, "EXPECTED_SHA256", hashlib.sha256(pdf_bytes()).hexdigest())
    monkeypatch.setattr(migration, "EXPECTED_SIZE", len(pdf_bytes()))
    return source, thumb, private


def _migration_event(reference):
    import app.scripts.migrate_nonprofit_documents as migration

    return types.SimpleNamespace(
        id=migration.EVENT_ID,
        tenant_id=migration.EXPECTED_TENANT_ID,
        status="pending",
        organization_type="verified_nonprofit",
        is_nonprofit=True,
        nonprofit_doc_url=reference,
    )


@pytest.mark.asyncio
async def test_migration_rejects_wrong_command_guards_without_touching_files(tmp_path, monkeypatch):
    from app.scripts.migrate_nonprofit_documents import MigrationRefused, migrate_event
    import app.scripts.migrate_nonprofit_documents as migration

    source, thumb, _ = _migration_files(tmp_path, monkeypatch)
    session = _MigrationSession([])
    with pytest.raises(MigrationRefused):
        await migrate_event(session, event_id="wrong", expected_reference=migration.EXPECTED_REFERENCE, source_path=source)
    assert source.exists()
    assert thumb.exists()
    assert session.queries == []


@pytest.mark.asyncio
async def test_migration_dry_run_locks_exact_old_state_and_changes_nothing(tmp_path, monkeypatch):
    from app.scripts.migrate_nonprofit_documents import EVENT_ID, EXPECTED_REFERENCE, NEW_REFERENCE, migrate_event

    source, thumb, private = _migration_files(tmp_path, monkeypatch)
    session = _MigrationSession([_migration_event(EXPECTED_REFERENCE)])
    result = await migrate_event(session, event_id=EVENT_ID, expected_reference=EXPECTED_REFERENCE, source_path=source)
    sql = str(session.queries[0])
    assert result.changed is False
    assert "FOR UPDATE" in sql
    assert "events.id" in sql.split("WHERE", 1)[1]
    assert "FOR UPDATE" in sql
    assert source.exists()
    assert thumb.exists()
    assert not private.exists()
    assert session.committed is False


@pytest.mark.asyncio
async def test_migration_refuses_wrong_hash_size_or_type_before_private_write(tmp_path, monkeypatch):
    from app.scripts.migrate_nonprofit_documents import EVENT_ID, EXPECTED_REFERENCE, MigrationRefused, migrate_event
    import app.scripts.migrate_nonprofit_documents as migration

    source, thumb, private = _migration_files(tmp_path, monkeypatch)
    source.write_bytes(b"%PDF-1.4\n%%EOF")
    with pytest.raises(MigrationRefused, match="size"):
        await migrate_event(_MigrationSession([_migration_event(EXPECTED_REFERENCE)]), event_id=EVENT_ID, expected_reference=EXPECTED_REFERENCE, source_path=source)
    source.write_bytes(image_bytes("JPEG"))
    monkeypatch.setattr(migration, "EXPECTED_SIZE", source.stat().st_size)
    monkeypatch.setattr(migration, "EXPECTED_SHA256", hashlib.sha256(source.read_bytes()).hexdigest())
    with pytest.raises(MigrationRefused, match="PDF"):
        await migrate_event(_MigrationSession([_migration_event(EXPECTED_REFERENCE)]), event_id=EVENT_ID, expected_reference=EXPECTED_REFERENCE, source_path=source)
    assert source.exists()
    assert thumb.exists()
    assert not private.exists()


@pytest.mark.asyncio
async def test_migration_contains_public_files_then_uses_guarded_cas(tmp_path, monkeypatch):
    from app.scripts.migrate_nonprofit_documents import EVENT_ID, EXPECTED_REFERENCE, NEW_REFERENCE, migrate_event

    source, thumb, private = _migration_files(tmp_path, monkeypatch)
    session = _MigrationSession([_migration_event(EXPECTED_REFERENCE), EVENT_ID])
    result = await migrate_event(session, event_id=EVENT_ID, expected_reference=EXPECTED_REFERENCE, dry_run=False, source_path=source)
    final = private / f"{EVENT_ID}.pdf"
    backup = private.parent / "repair_backups" / EVENT_ID / thumb.name
    update_sql = str(session.queries[1])
    assert result.changed is True
    assert session.committed is True
    assert not source.exists()
    assert not thumb.exists()
    assert final.read_bytes() == pdf_bytes()
    assert backup.read_bytes() == pdf_bytes()
    assert backup.is_relative_to(private.parent)
    assert not backup.is_relative_to(tmp_path / "uploads")
    assert os.stat(final).st_mode & 0o777 == 0o600
    assert os.stat(private).st_mode & 0o777 == 0o700
    assert list(private.rglob("*.tmp")) == []
    assert "UPDATE events" in update_sql
    assert "events.tenant_id" in update_sql
    assert "events.nonprofit_doc_url" in update_sql
    assert session.queries[1].compile().params["nonprofit_doc_url"] == NEW_REFERENCE


@pytest.mark.asyncio
async def test_migration_recovers_after_commit_failure_with_private_copies(tmp_path, monkeypatch):
    from app.scripts.migrate_nonprofit_documents import EVENT_ID, EXPECTED_REFERENCE, NEW_REFERENCE, migrate_event

    source, thumb, _ = _migration_files(tmp_path, monkeypatch)
    failed = _MigrationSession([_migration_event(EXPECTED_REFERENCE), EVENT_ID], commit_error=RuntimeError("db down"))
    with pytest.raises(RuntimeError, match="db down"):
        await migrate_event(failed, event_id=EVENT_ID, expected_reference=EXPECTED_REFERENCE, dry_run=False, source_path=source)
    assert failed.rolled_back is True
    assert not source.exists()
    assert not thumb.exists()
    retry = _MigrationSession([_migration_event(EXPECTED_REFERENCE), EVENT_ID])
    result = await migrate_event(retry, event_id=EVENT_ID, expected_reference=EXPECTED_REFERENCE, dry_run=False, source_path=source)
    assert result.changed is True
    assert retry.committed is True


@pytest.mark.asyncio
async def test_migration_recovers_partial_state_and_noops_on_final_rerun(tmp_path, monkeypatch):
    from app.scripts.migrate_nonprofit_documents import EVENT_ID, EXPECTED_REFERENCE, NEW_REFERENCE, migrate_event

    source, thumb, private = _migration_files(tmp_path, monkeypatch)
    final = private / f"{EVENT_ID}.pdf"
    final.parent.mkdir(parents=True)
    final.write_bytes(pdf_bytes())
    source.unlink()
    partial = _MigrationSession([_migration_event(EXPECTED_REFERENCE), EVENT_ID])
    result = await migrate_event(partial, event_id=EVENT_ID, expected_reference=EXPECTED_REFERENCE, dry_run=False, source_path=source)
    assert result.changed is True
    assert not thumb.exists()
    assert (private.parent / "repair_backups" / EVENT_ID / thumb.name).is_file()
    no_op = _MigrationSession([_migration_event(NEW_REFERENCE)])
    result = await migrate_event(no_op, event_id=EVENT_ID, expected_reference=EXPECTED_REFERENCE, dry_run=False, source_path=source)
    assert result.changed is False
    assert result.message == "already migrated"
    assert no_op.committed is False


@pytest.mark.asyncio
async def test_migration_apply_cleans_public_files_when_database_already_has_new_reference(tmp_path, monkeypatch):
    from app.scripts.migrate_nonprofit_documents import EVENT_ID, EXPECTED_REFERENCE, NEW_REFERENCE, migrate_event

    source, thumb, private = _migration_files(tmp_path, monkeypatch)
    final = private / f"{EVENT_ID}.pdf"
    backup = private.parent / "repair_backups" / EVENT_ID / thumb.name
    final.parent.mkdir(parents=True)
    backup.parent.mkdir(parents=True)
    final.write_bytes(pdf_bytes())
    backup.write_bytes(pdf_bytes())
    session = _MigrationSession([_migration_event(NEW_REFERENCE)])
    result = await migrate_event(session, event_id=EVENT_ID, expected_reference=EXPECTED_REFERENCE, dry_run=False, source_path=source)
    assert result.changed is True
    assert "cleanup" in result.message
    assert not source.exists()
    assert not thumb.exists()
    assert session.committed is False


@pytest.mark.asyncio
async def test_migration_dry_run_reports_pending_cleanup_for_new_database_state(tmp_path, monkeypatch):
    from app.scripts.migrate_nonprofit_documents import EVENT_ID, EXPECTED_REFERENCE, NEW_REFERENCE, migrate_event

    source, thumb, private = _migration_files(tmp_path, monkeypatch)
    final = private / f"{EVENT_ID}.pdf"
    backup = private.parent / "repair_backups" / EVENT_ID / thumb.name
    final.parent.mkdir(parents=True)
    backup.parent.mkdir(parents=True)
    final.write_bytes(pdf_bytes())
    backup.write_bytes(pdf_bytes())
    session = _MigrationSession([_migration_event(NEW_REFERENCE)])
    result = await migrate_event(session, event_id=EVENT_ID, expected_reference=EXPECTED_REFERENCE, source_path=source)
    assert result.changed is False
    assert result.message == "public-file cleanup is pending"
    assert source.exists()
    assert thumb.exists()
    assert session.committed is False


@pytest.mark.asyncio
async def test_migration_treats_zero_row_cas_with_verified_new_state_as_noop(tmp_path, monkeypatch):
    from app.scripts.migrate_nonprofit_documents import EVENT_ID, EXPECTED_REFERENCE, migrate_event

    source, thumb, _ = _migration_files(tmp_path, monkeypatch)
    session = _MigrationSession([_migration_event(EXPECTED_REFERENCE), None, object()])
    result = await migrate_event(session, event_id=EVENT_ID, expected_reference=EXPECTED_REFERENCE, dry_run=False, source_path=source)
    assert result.changed is False
    assert result.message == "already migrated by a concurrent run"
    assert not source.exists()
    assert not thumb.exists()
    assert session.committed is False


@pytest.mark.asyncio
async def test_migration_refuses_when_both_public_and_private_copies_are_absent(tmp_path, monkeypatch):
    from app.scripts.migrate_nonprofit_documents import EVENT_ID, EXPECTED_REFERENCE, MigrationRefused, migrate_event

    source, thumb, _ = _migration_files(tmp_path, monkeypatch)
    source.unlink()
    thumb.unlink()
    with pytest.raises(MigrationRefused, match="neither public source nor private final"):
        await migrate_event(_MigrationSession([_migration_event(EXPECTED_REFERENCE)]), event_id=EVENT_ID, expected_reference=EXPECTED_REFERENCE, source_path=source)
