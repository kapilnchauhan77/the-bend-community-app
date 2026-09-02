import io
import os
import time
from pathlib import Path
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException, UploadFile
from types import SimpleNamespace
from pypdf import PdfWriter


def real_pdf() -> bytes:
    output = io.BytesIO()
    writer = PdfWriter()
    writer.add_blank_page(width=72, height=72)
    writer.write(output)
    return output.getvalue()


def test_strict_pdf_validation_rejects_pdf_header_with_fake_eof():
    from app.services.nonprofit_document_service import DocumentValidationError, detect_document

    with pytest.raises(DocumentValidationError):
        detect_document(b"%PDF-not-a-pdf%%EOF")


def test_new_reference_is_canonical_and_tenant_bound():
    from app.services.nonprofit_document_service import DocumentReferenceError, resolve_managed_reference

    tenant = uuid4()
    document = uuid4()
    assert resolve_managed_reference(
        f"nonprofit-documents/{tenant}/{document}.pdf", tenant
    ).name == f"{document}.pdf"
    with pytest.raises(DocumentReferenceError):
        resolve_managed_reference(f"nonprofit-documents/{document}.pdf", tenant)
    with pytest.raises(DocumentReferenceError):
        resolve_managed_reference(f"nonprofit-documents/{str(tenant).upper()}/{document}.pdf", tenant)


@pytest.mark.parametrize("reference", [
    "nonprofit-documents/abc.pdf",
    "nonprofit-documents/00000000-0000-0000-0000-000000000000/../x.pdf",
    "nonprofit-documents/00000000-0000-0000-0000-000000000000/00000000-0000-0000-0000-000000000000.gif",
    "nonprofit-documents/00000000-0000-0000-0000-000000000000/00000000-0000-0000-0000-000000000000.pdf\x00",
])
def test_reference_parser_rejects_flat_traversal_bad_extension_and_nul(reference):
    from app.services.nonprofit_document_service import DocumentReferenceError, resolve_managed_reference

    with pytest.raises(DocumentReferenceError):
        resolve_managed_reference(reference, UUID("00000000-0000-0000-0000-000000000000"))


def test_forwarded_header_trust_is_env_driven_and_compose_only():
    root = Path(__file__).parents[2]
    startup = (root / "the-bend-backend" / "railway-start.sh").read_text()
    compose = (root / "docker-compose.prod.yml").read_text()
    assert '--forwarded-allow-ips="${FORWARDED_ALLOW_IPS:-127.0.0.1}"' in startup
    assert 'FORWARDED_ALLOW_IPS: "*"' in compose
    backend = compose.split("  backend:\n", 1)[1].split("\n  db:\n", 1)[0]
    assert "ports:" not in backend
    assert "depends_on:" in backend
    caddy = compose.split("  caddy:\n", 1)[1].split("\n  frontend:\n", 1)[0]
    assert '"80:80"' in caddy and '"443:443"' in caddy


@pytest.mark.asyncio
async def test_upload_queries_exact_tenant_claims_and_maps_quota_to_507(monkeypatch):
    import app.api.v1.upload as upload_api
    tenant = SimpleNamespace(id=uuid4())

    class Result:
        def all(self):
            return [(f"nonprofit-documents/{tenant.id}/{uuid4()}.pdf",), ("other",)]

    class DB:
        async def execute(self, query):
            self.query = query
            return Result()

    observed = {}
    async def refuse(_file, _tenant, claimed_references=None):
        observed["claims"] = claimed_references
        raise upload_api.DocumentQuotaError("Tenant document quota exceeded")

    monkeypatch.setattr(upload_api, "store_document", refuse)
    db = DB()
    with pytest.raises(HTTPException) as error:
        await upload_api.upload_nonprofit_document(UploadFile(io.BytesIO(real_pdf())), db, tenant)
    assert error.value.status_code == 507
    assert len(observed["claims"]) == 2
    assert "events.tenant_id" in str(db.query)
    assert "events.nonprofit_doc_url" in str(db.query)


@pytest.mark.asyncio
async def test_prune_retains_claimed_and_fresh_and_removes_old_orphan(tmp_path, monkeypatch):
    import app.services.nonprofit_document_service as service

    tenant = uuid4()
    root = tmp_path / "docs"
    monkeypatch.setattr(service, "PRIVATE_DOCUMENT_DIR", root)
    tenant_dir = root / str(tenant)
    tenant_dir.mkdir(parents=True)
    claimed = tenant_dir / f"{uuid4()}.pdf"
    orphan = tenant_dir / f"{uuid4()}.pdf"
    fresh = tenant_dir / f"{uuid4()}.pdf"
    for path in (claimed, orphan, fresh):
        path.write_bytes(real_pdf())
    old = time.time() - service.ORPHAN_RETENTION_SECONDS - 10
    os.utime(claimed, (old, old))
    os.utime(orphan, (old, old))
    ref = f"nonprofit-documents/{tenant}/{claimed.name}"
    await service.store_document(UploadFile(io.BytesIO(real_pdf())), tenant, [ref])
    assert claimed.exists()
    assert not orphan.exists()
    assert fresh.exists()


@pytest.mark.asyncio
async def test_quota_refusal_leaves_no_temporary_file(tmp_path, monkeypatch):
    import app.services.nonprofit_document_service as service

    tenant = uuid4()
    root = tmp_path / "docs"
    monkeypatch.setattr(service, "PRIVATE_DOCUMENT_DIR", root)
    tenant_dir = root / str(tenant)
    tenant_dir.mkdir(parents=True)
    existing = tenant_dir / f"{uuid4()}.pdf"
    with existing.open("wb") as output:
        output.truncate(service.MAX_TENANT_BYTES)
    with pytest.raises(service.DocumentQuotaError):
        await service.store_document(UploadFile(io.BytesIO(real_pdf())), tenant)
    assert list(tenant_dir.glob("*.tmp")) == []


@pytest.mark.asyncio
async def test_store_secures_permissions_and_fsyncs_file_and_directory(tmp_path, monkeypatch):
    import app.services.nonprofit_document_service as service

    tenant = uuid4()
    root = tmp_path / "docs"
    monkeypatch.setattr(service, "PRIVATE_DOCUMENT_DIR", root)
    calls = []
    original_fsync = os.fsync
    monkeypatch.setattr(os, "fsync", lambda fd: (calls.append(fd), original_fsync(fd))[1])
    reference = await service.store_document(UploadFile(io.BytesIO(real_pdf())), tenant)
    path = service.resolve_managed_reference(reference, tenant)
    assert path.stat().st_mode & 0o777 == 0o600
    assert path.parent.stat().st_mode & 0o777 == 0o700
    assert root.stat().st_mode & 0o777 == 0o700
    assert len(calls) >= 2
