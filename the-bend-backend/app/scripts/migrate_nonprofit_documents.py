"""Fail-safe repair of the Washington Parish Museum nonprofit document."""
import argparse
import asyncio
import hashlib
import os
import uuid
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import select, update

from app.database import async_session
from app.models.enums import EventStatus
from app.models.event import Event
from app.services.nonprofit_document_service import (
    PRIVATE_DOCUMENT_DIR,
    detect_document,
    resolve_legacy_reference,
)

EVENT_ID = "503dbe2b-936c-4f90-b1e5-ac5801252605"
EXPECTED_REFERENCE = "/uploads/images/2d60657c-bdcc-4c8a-846d-fdec1b2f844e.jpg"
EXPECTED_TENANT_ID = "a506f5d0-920f-4fbf-8980-dffbd38a1a19"
EXPECTED_SHA256 = "a2e3ceb4e6705f5a9adf4276aa7c9fd40d616c4d2f86a1489c4e7c9a42e4513c"
EXPECTED_SIZE = 1405977
EXPECTED_MIME = "application/pdf"
NEW_REFERENCE = f"nonprofit-documents/{EVENT_ID}.pdf"
EVENT_UUID = uuid.UUID(EVENT_ID)
EXPECTED_TENANT_UUID = uuid.UUID(EXPECTED_TENANT_ID)


class MigrationRefused(RuntimeError):
    """The production record or a file is not the exact expected state."""


@dataclass(frozen=True)
class MigrationResult:
    changed: bool
    message: str


def _event_guards(reference: str):
    return (
        Event.id == EVENT_UUID,
        Event.tenant_id == EXPECTED_TENANT_UUID,
        Event.status == EventStatus.PENDING,
        Event.organization_type == "verified_nonprofit",
        Event.is_nonprofit.is_(True),
        Event.nonprofit_doc_url == reference,
    )


def _validate_locked_event(event) -> str:
    status = getattr(event.status, "value", event.status)
    if str(event.id) != EVENT_ID:
        raise MigrationRefused("locked event ID does not match")
    if str(event.tenant_id) != EXPECTED_TENANT_ID:
        raise MigrationRefused("locked event tenant does not match")
    if status != EventStatus.PENDING.value:
        raise MigrationRefused("locked event status does not match")
    if event.organization_type != "verified_nonprofit":
        raise MigrationRefused("locked event organization type does not match")
    if event.is_nonprofit is not True:
        raise MigrationRefused("locked event is not a verified nonprofit")
    if event.nonprofit_doc_url not in {EXPECTED_REFERENCE, NEW_REFERENCE}:
        raise MigrationRefused("locked event document reference does not match")
    return event.nonprofit_doc_url


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for block in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _verify_pdf(path: Path, label: str) -> None:
    if not path.is_file():
        raise MigrationRefused(f"{label} is not a regular file")
    if path.stat().st_size != EXPECTED_SIZE:
        raise MigrationRefused(f"{label} has an unexpected size")
    if _sha256(path) != EXPECTED_SHA256:
        raise MigrationRefused(f"{label} has an unexpected SHA-256")
    try:
        mime, extension = detect_document(path.read_bytes())
    except ValueError as exc:
        raise MigrationRefused(f"{label} is not a valid document") from exc
    if (mime, extension) != (EXPECTED_MIME, ".pdf"):
        raise MigrationRefused(f"{label} is not the expected PDF")


def _document_fingerprint(path: Path, label: str) -> tuple[int, str, tuple[str, str]]:
    if not path.is_file():
        raise MigrationRefused(f"{label} is not a regular file")
    try:
        detected = detect_document(path.read_bytes())
    except ValueError as exc:
        raise MigrationRefused(f"{label} is not a valid document") from exc
    return path.stat().st_size, _sha256(path), detected


def _verify_backup(path: Path, label: str) -> tuple[int, str, tuple[str, str]]:
    # The legacy `_thumb.jpg` is a byte-for-byte copy of the PDF.  Its name is
    # misleading, but accepting an image here would weaken the production guard.
    _verify_pdf(path, label)
    return _document_fingerprint(path, label)


def _ensure_private_directory(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)
    os.chmod(path, 0o700)


def _fsync_directory(path: Path) -> None:
    descriptor = os.open(path, os.O_RDONLY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def _secure_private_file(path: Path) -> None:
    os.chmod(path, 0o600)
    descriptor = os.open(path, os.O_RDONLY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def _copy_private(source: Path, destination: Path, verifier, label: str) -> None:
    """Copy through a private temp file, never moving across the public mount."""
    _ensure_private_directory(destination.parent)
    temporary = destination.parent / f".{destination.name}.{uuid.uuid4().hex}.tmp"
    try:
        with source.open("rb") as input_file, open(temporary, "xb") as output_file:
            while block := input_file.read(1024 * 1024):
                output_file.write(block)
            output_file.flush()
            os.fsync(output_file.fileno())
        os.chmod(temporary, 0o600)
        verifier(temporary, f"temporary {label}")
        if destination.exists():
            verifier(destination, label)
            raise MigrationRefused(f"refusing to overwrite existing {label}")
        os.replace(temporary, destination)
        _fsync_directory(destination.parent)
        verifier(destination, label)
    finally:
        if temporary.exists():
            temporary.unlink()


def _thumb_source(main_source: Path) -> Path:
    return main_source.with_name(f"{main_source.stem}_thumb.jpg")


def _private_paths(main_source: Path) -> tuple[Path, Path]:
    private_root = PRIVATE_DOCUMENT_DIR.parent
    final = PRIVATE_DOCUMENT_DIR / f"{EVENT_ID}.pdf"
    backup = private_root / "repair_backups" / EVENT_ID / _thumb_source(main_source).name
    return final, backup


def _validate_and_contain(*, source: Path, dry_run: bool) -> tuple[Path, Path]:
    """Validate an interrupted state and, for apply, finish private containment."""
    old_main = source
    old_thumb = _thumb_source(source)
    final, backup = _private_paths(source)

    old_main_exists = old_main.exists()
    old_thumb_exists = old_thumb.exists()
    final_exists = final.exists()
    backup_exists = backup.exists()

    if old_main_exists:
        _verify_pdf(old_main, "public source")
    if final_exists:
        _verify_pdf(final, "private final")
    if not old_main_exists and not final_exists:
        raise MigrationRefused("neither public source nor private final exists")

    public_thumb = _verify_backup(old_thumb, "public thumbnail") if old_thumb_exists else None
    private_backup = _verify_backup(backup, "private backup") if backup_exists else None
    if not old_thumb_exists and not backup_exists:
        raise MigrationRefused("neither public thumbnail nor private backup exists")
    if public_thumb and private_backup and public_thumb != private_backup:
        raise MigrationRefused("public thumbnail and private backup differ")

    if dry_run:
        return final, backup

    private_root = PRIVATE_DOCUMENT_DIR.parent
    _ensure_private_directory(private_root)
    _ensure_private_directory(PRIVATE_DOCUMENT_DIR)
    _ensure_private_directory(private_root / "repair_backups")
    _ensure_private_directory(backup.parent)

    if old_main_exists and not final_exists:
        _copy_private(old_main, final, _verify_pdf, "private final")
    if old_thumb_exists and not backup_exists:
        _copy_private(old_thumb, backup, _verify_backup, "private backup")

    _verify_pdf(final, "private final")
    _verify_backup(backup, "private backup")
    _secure_private_file(final)
    _secure_private_file(backup)
    if old_main_exists:
        _verify_pdf(old_main, "public source")
        old_main.unlink()
        _fsync_directory(old_main.parent)
    if old_thumb_exists:
        _verify_backup(old_thumb, "public thumbnail")
        old_thumb.unlink()
        _fsync_directory(old_thumb.parent)
    return final, backup


async def migrate_event(session, *, event_id: str, expected_reference: str, dry_run: bool = True, source_path: Path | None = None) -> MigrationResult:
    """Run S0-S4 for the one authorized production record."""
    if event_id != EVENT_ID or expected_reference != EXPECTED_REFERENCE:
        raise MigrationRefused("exact event ID and expected reference are required")

    locked = await session.execute(select(Event).where(Event.id == EVENT_UUID).with_for_update())
    event = locked.scalar_one_or_none()
    if event is None:
        raise MigrationRefused("event was not found")
    reference = _validate_locked_event(event)
    source = source_path or resolve_legacy_reference(EXPECTED_REFERENCE)

    if reference == NEW_REFERENCE:
        public_files_remain = source.exists() or _thumb_source(source).exists()
        _validate_and_contain(source=source, dry_run=dry_run)
        if public_files_remain and not dry_run:
            return MigrationResult(True, "completed public-file cleanup for an already migrated event")
        if public_files_remain:
            return MigrationResult(False, "public-file cleanup is pending")
        return MigrationResult(False, "already migrated")

    final, backup = _validate_and_contain(source=source, dry_run=dry_run)
    if dry_run:
        return MigrationResult(False, f"would contain files at {final} and {backup}")

    updated = await session.execute(
        update(Event)
        .where(*_event_guards(EXPECTED_REFERENCE))
        .values(nonprofit_doc_url=NEW_REFERENCE)
        .returning(Event.id)
    )
    if updated.scalar_one_or_none() is None:
        reread = await session.execute(select(Event).where(*_event_guards(NEW_REFERENCE)))
        if reread.scalar_one_or_none() is None:
            raise MigrationRefused("guarded compare-and-swap did not update the event")
        _validate_and_contain(source=source, dry_run=True)
        return MigrationResult(False, "already migrated by a concurrent run")
    try:
        await session.commit()
    except Exception:
        await session.rollback()
        raise
    return MigrationResult(True, "migrated")


async def run(*, event_id: str, expected_reference: str, apply: bool) -> MigrationResult:
    async with async_session() as session:
        return await migrate_event(
            session,
            event_id=event_id,
            expected_reference=expected_reference,
            dry_run=not apply,
        )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--event-id", required=True)
    parser.add_argument("--expected-reference", required=True)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    try:
        result = asyncio.run(
            run(event_id=args.event_id, expected_reference=args.expected_reference, apply=args.apply)
        )
    except MigrationRefused as exc:
        raise SystemExit(f"Refusing migration: {exc}") from exc
    print(result.message)


if __name__ == "__main__":
    main()
