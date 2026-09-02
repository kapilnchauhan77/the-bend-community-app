import io
import os
import re
import time
import warnings
from contextlib import contextmanager
from pathlib import Path
from uuid import UUID, uuid4

import fcntl
from fastapi import UploadFile
from PIL import Image, UnidentifiedImageError

PRIVATE_UPLOAD_ROOT = Path("private_uploads")
PRIVATE_DOCUMENT_DIR = PRIVATE_UPLOAD_ROOT / "nonprofit_documents"
_DEFAULT_PRIVATE_DOCUMENT_DIR = PRIVATE_DOCUMENT_DIR
LEGACY_UPLOAD_DIR = Path("uploads") / "images"
MAX_DOCUMENT_BYTES = 10 * 1024 * 1024
MAX_TENANT_BYTES = 100 * 1024 * 1024
ORPHAN_RETENTION_SECONDS = 24 * 60 * 60
_CANONICAL_UUID = r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
MANAGED_REFERENCE_RE = re.compile(rf"^nonprofit-documents/({_CANONICAL_UUID})/({_CANONICAL_UUID})\.(pdf|jpg|png)$")
FLAT_MANAGED_REFERENCE_RE = re.compile(rf"^nonprofit-documents/({_CANONICAL_UUID})\.(pdf|jpg|png)$")
TENANT_FILE_RE = re.compile(rf"^({_CANONICAL_UUID})\.(pdf|jpg|png)$")


class DocumentValidationError(ValueError):
    pass


class DocumentQuotaError(DocumentValidationError):
    pass


class DocumentReferenceError(ValueError):
    pass


def _canonical_uuid(value: UUID | str) -> str:
    try:
        parsed = UUID(str(value))
    except (TypeError, ValueError, AttributeError) as exc:
        raise DocumentReferenceError("Invalid document reference") from exc
    canonical = str(parsed)
    if str(value) != canonical:
        raise DocumentReferenceError("Invalid document reference")
    return canonical


def detect_document(content: bytes) -> tuple[str, str]:
    if len(content) > MAX_DOCUMENT_BYTES:
        raise DocumentValidationError("Document must be 10 MB or less")
    if content.startswith(b"%PDF-"):
        try:
            from pypdf import PdfReader
            reader = PdfReader(io.BytesIO(content), strict=True)
            len(reader.pages)
        except Exception as exc:
            raise DocumentValidationError("Document is not a valid PDF") from exc
        return "application/pdf", ".pdf"
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(content)) as image:
                actual = image.format
                width, height = image.size
                if width > 10_000 or height > 10_000 or width * height > 20_000_000:
                    raise DocumentValidationError("Document dimensions are too large")
                image.verify()
            # verify() must be called directly after open; reopen to force
            # decompression and catch truncated payloads as well.
            with Image.open(io.BytesIO(content)) as image:
                image.load()
    except DocumentValidationError:
        raise
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise DocumentValidationError("Document must be a PDF, JPEG, or PNG") from exc
    if actual == "JPEG":
        return "image/jpeg", ".jpg"
    if actual == "PNG":
        return "image/png", ".png"
    raise DocumentValidationError("Document must be a PDF, JPEG, or PNG")


def resolve_reference(reference: str) -> Path:
    if not isinstance(reference, str) or "\x00" in reference:
        raise DocumentReferenceError("Invalid document reference")
    match = MANAGED_REFERENCE_RE.fullmatch(reference)
    if not match:
        raise DocumentReferenceError("Invalid document reference")
    tenant, document, extension = match.groups()
    root = _document_root().resolve()
    path = (root / tenant / f"{document}.{extension}").resolve()
    if path.parent != (root / tenant).resolve() or not path.is_relative_to(root):
        raise DocumentReferenceError("Invalid document reference")
    return path


def resolve_managed_reference(reference: str, tenant_id: UUID | str | None = None) -> Path:
    path = resolve_reference(reference)
    match = MANAGED_REFERENCE_RE.fullmatch(reference)
    if tenant_id is not None and match.group(1) != _canonical_uuid(tenant_id):
        raise DocumentReferenceError("Invalid document reference")
    return path


def resolve_flat_managed_reference(reference: str) -> Path:
    if not isinstance(reference, str) or "\x00" in reference:
        raise DocumentReferenceError("Invalid document reference")
    match = FLAT_MANAGED_REFERENCE_RE.fullmatch(reference)
    if not match:
        raise DocumentReferenceError("Invalid document reference")
    root = _document_root().resolve()
    path = (root / f"{match.group(1)}.{match.group(2)}").resolve()
    if path.parent != root:
        raise DocumentReferenceError("Invalid document reference")
    return path


def resolve_legacy_reference(reference: str) -> Path:
    prefix = "/uploads/images/"
    if not isinstance(reference, str) or "\x00" in reference or not reference.startswith(prefix):
        raise DocumentReferenceError("Invalid document reference")
    name = reference.removeprefix(prefix)
    if not name or Path(name).name != name:
        raise DocumentReferenceError("Invalid document reference")
    root = LEGACY_UPLOAD_DIR.resolve()
    path = (root / name).resolve()
    if path.parent != root:
        raise DocumentReferenceError("Invalid document reference")
    return path


def _fsync_directory(path: Path) -> None:
    descriptor = os.open(path, os.O_RDONLY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def _document_root() -> Path:
    if PRIVATE_DOCUMENT_DIR == _DEFAULT_PRIVATE_DOCUMENT_DIR:
        return PRIVATE_UPLOAD_ROOT / "nonprofit_documents"
    return PRIVATE_DOCUMENT_DIR


@contextmanager
def _tenant_lock(tenant_dir: Path):
    lock_path = tenant_dir / ".lifecycle.lock"
    with lock_path.open("a+") as lock_file:
        os.chmod(lock_path, 0o600)
        fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)


async def store_document(file: UploadFile, tenant_id: UUID | str, claimed_references=None) -> str:
    tenant = _canonical_uuid(tenant_id)
    content = await file.read(MAX_DOCUMENT_BYTES + 1)
    mime, extension = detect_document(content)
    del mime
    document_root = _document_root()
    document_root.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(document_root, 0o700)
    tenant_dir = document_root / tenant
    tenant_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(tenant_dir, 0o700)
    with _tenant_lock(tenant_dir):
        now = time.time()
        claimed = {ref for ref in (claimed_references or ()) if isinstance(ref, str)}
        for candidate in tenant_dir.iterdir():
            if not candidate.is_file() or not TENANT_FILE_RE.fullmatch(candidate.name):
                continue
            if now - candidate.stat().st_mtime > ORPHAN_RETENTION_SECONDS:
                reference = f"nonprofit-documents/{tenant}/{candidate.name}"
                if reference not in claimed:
                    candidate.unlink()
        files = [p for p in tenant_dir.iterdir() if p.is_file() and TENANT_FILE_RE.fullmatch(p.name)]
        if sum(p.stat().st_size for p in files) + len(content) > MAX_TENANT_BYTES:
            raise DocumentQuotaError("Tenant document quota exceeded")
        name = f"{uuid4()}{extension}"
        destination = tenant_dir / name
        temporary = tenant_dir / f".{name}.tmp"
        try:
            with temporary.open("xb") as output:
                os.chmod(temporary, 0o600)
                output.write(content)
                output.flush()
                os.fsync(output.fileno())
            os.replace(temporary, destination)
            os.chmod(destination, 0o600)
            _fsync_directory(tenant_dir)
        finally:
            if temporary.exists():
                temporary.unlink()
    return f"nonprofit-documents/{tenant}/{name}"
