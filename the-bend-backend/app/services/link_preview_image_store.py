"""Validate, normalize, and safely store Bend-managed link-preview images."""

from __future__ import annotations

import contextlib
import fcntl
import hashlib
import io
import os
import re
import secrets
import warnings
from pathlib import Path
from typing import Iterator

from PIL import Image, ImageOps


_MAX_PIXELS = 20_000_000
_PUBLIC_PATH = re.compile(r"^/uploads/link-previews/([0-9a-f]{64})\.webp$")
_IMAGE_FORMATS = {"JPEG", "PNG", "WEBP"}


class LinkPreviewImageProcessingError(ValueError):
    """Raised when source bytes cannot become a safe preview image."""


def _image_directory(upload_dir: Path | str) -> Path:
    path = Path(upload_dir)
    return path if path.name == "link-previews" else path / "link-previews"


@contextlib.contextmanager
def link_preview_directory_lock(
    upload_dir: Path | str, shared: bool
) -> Iterator[None]:
    """Coordinate image reads/writes with cleanup in other worker processes."""

    directory = _image_directory(upload_dir)
    directory.mkdir(parents=True, exist_ok=True)
    lock_path = directory / ".cleanup.lock"
    descriptor = os.open(lock_path, os.O_RDWR | os.O_CREAT, 0o600)
    try:
        fcntl.flock(descriptor, fcntl.LOCK_SH if shared else fcntl.LOCK_EX)
        yield
    finally:
        try:
            fcntl.flock(descriptor, fcntl.LOCK_UN)
        finally:
            os.close(descriptor)


class LinkPreviewImageStore:
    def __init__(self, upload_dir: Path | str = Path("uploads")):
        self.upload_dir = Path(upload_dir)
        self.image_dir = _image_directory(self.upload_dir)

    @staticmethod
    def _encode(image_bytes: bytes) -> bytes:
        try:
            with warnings.catch_warnings():
                warnings.simplefilter("error", Image.DecompressionBombWarning)
                with Image.open(io.BytesIO(image_bytes)) as image:
                    if image.format not in _IMAGE_FORMATS:
                        raise LinkPreviewImageProcessingError("unsupported_image_format")
                    width, height = image.size
                    if width * height > _MAX_PIXELS:
                        raise LinkPreviewImageProcessingError("image_dimensions_exceeded")
                    image.seek(0)
                    image.load()
                    image = ImageOps.exif_transpose(image)
                    image.thumbnail((1200, 630), Image.Resampling.LANCZOS)
                    if image.mode in ("RGBA", "LA") or (
                        image.mode == "P" and "transparency" in image.info
                    ):
                        image = image.convert("RGBA")
                    else:
                        image = image.convert("RGB")
                    output = io.BytesIO()
                    image.save(
                        output,
                        format="WEBP",
                        quality=82,
                        method=6,
                        lossless=False,
                        exact=False,
                    )
                    return output.getvalue()
        except LinkPreviewImageProcessingError:
            raise
        except (Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
            raise LinkPreviewImageProcessingError("image_decompression_limit") from exc
        except Exception as exc:
            raise LinkPreviewImageProcessingError("invalid_image") from exc

    def store(self, image_bytes: bytes) -> str:
        encoded = self._encode(image_bytes)
        digest = hashlib.sha256(encoded).hexdigest()
        self.image_dir.mkdir(parents=True, exist_ok=True)
        final_path = self.image_dir / f"{digest}.webp"
        public_url = f"/uploads/link-previews/{digest}.webp"
        with link_preview_directory_lock(self.image_dir, shared=True):
            try:
                target_stat = final_path.lstat()
            except FileNotFoundError:
                target_stat = None
            if target_stat is not None and not _is_regular_non_symlink(target_stat):
                target_stat = None
            if target_stat is not None:
                final_path.touch()
                return public_url

            temporary = self.image_dir / f".{digest}.{secrets.token_hex(8)}.tmp"
            try:
                temporary.write_bytes(encoded)
                os.replace(temporary, final_path)
            finally:
                temporary.unlink(missing_ok=True)
        return public_url

    def _open_no_follow(self, path: Path):
        flags = os.O_RDONLY
        if hasattr(os, "O_NOFOLLOW"):
            flags |= os.O_NOFOLLOW
        descriptor = os.open(path, flags)
        return os.fdopen(descriptor, "rb")

    def touch(self, public_url: str) -> bool:
        match = _PUBLIC_PATH.fullmatch(public_url)
        if not match:
            return False
        digest = match.group(1)
        path = self.image_dir / f"{digest}.webp"
        with link_preview_directory_lock(self.image_dir, shared=True):
            try:
                with self._open_no_follow(path) as image_file:
                    locked_stat = path.stat(follow_symlinks=False)
                    if not _is_regular_non_symlink(locked_stat):
                        return False
                    opened_stat = os.fstat(image_file.fileno())
                    if (
                        locked_stat.st_dev != opened_stat.st_dev
                        or locked_stat.st_ino != opened_stat.st_ino
                    ):
                        return False
                    os.utime(image_file.fileno(), None)
                return True
            except (FileNotFoundError, NotADirectoryError, OSError):
                return False


def _is_regular_non_symlink(stat_result: os.stat_result) -> bool:
    return stat_result.st_mode & 0o170000 == 0o100000


__all__ = [
    "LinkPreviewImageProcessingError",
    "LinkPreviewImageStore",
    "link_preview_directory_lock",
]
