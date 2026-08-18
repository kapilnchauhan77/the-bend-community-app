import hashlib
import io
import warnings
from pathlib import Path
from urllib.parse import urlparse

import httpx
from PIL import Image, UnidentifiedImageError

from app.services.file_service import UPLOAD_DIR, _process_image

_IMAGE_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
    ),
    "Accept": "image/jpeg,image/png,image/webp",
}
_ALLOWED_IMAGE_CONTENT_TYPES = frozenset(
    {"image/jpeg", "image/png", "image/webp"}
)
_ALLOWED_IMAGE_FORMATS = frozenset({"JPEG", "PNG", "WEBP"})
_MAX_EVENT_IMAGE_BYTES = 5 * 1024 * 1024
_MAX_EVENT_IMAGE_EDGE = 10_000
_MAX_EVENT_IMAGE_PIXELS = 20_000_000


def is_cacheable_event_image(url: str | None) -> bool:
    """Return whether the URL is an approved Flickr event-image endpoint."""
    if not url:
        return False
    try:
        parsed = urlparse(url)
        port = parsed.port
    except ValueError:
        return False
    return (
        parsed.scheme == "https"
        and parsed.hostname == "www.flickr.com"
        and port in (None, 443)
        and parsed.username is None
        and parsed.password is None
        and parsed.path == "/photo_download.gne"
        and not parsed.fragment
    )


class EventImageCache:
    def __init__(
        self,
        upload_dir: Path = UPLOAD_DIR,
        transport: httpx.AsyncBaseTransport | None = None,
    ):
        self.image_dir = Path(upload_dir) / "images"
        self.transport = transport

    async def cache(self, url: str | None) -> str | None:
        if not is_cacheable_event_image(url):
            return None

        file_stem = f"event-{hashlib.sha256(url.encode()).hexdigest()[:32]}"
        for extension in (".jpg", ".png"):
            full_path = self.image_dir / f"{file_stem}{extension}"
            thumb_path = self.image_dir / f"{file_stem}_thumb{extension}"
            if full_path.is_file() and thumb_path.is_file():
                return f"/uploads/images/{full_path.name}"

        async with httpx.AsyncClient(
            transport=self.transport,
            follow_redirects=False,
            timeout=httpx.Timeout(10.0, connect=3.0),
            headers=_IMAGE_HEADERS,
        ) as client:
            try:
                async with client.stream("GET", url) as response:
                    if not response.is_success:
                        return None
                    content_type = (
                        response.headers.get("content-type", "")
                        .split(";", 1)[0]
                        .strip()
                        .lower()
                    )
                    if content_type not in _ALLOWED_IMAGE_CONTENT_TYPES:
                        return None
                    try:
                        declared_size = int(
                            response.headers.get("content-length", "0")
                        )
                    except ValueError:
                        return None
                    if declared_size > _MAX_EVENT_IMAGE_BYTES:
                        return None

                    content = bytearray()
                    async for chunk in response.aiter_bytes():
                        content.extend(chunk)
                        if len(content) > _MAX_EVENT_IMAGE_BYTES:
                            return None
            except httpx.HTTPError:
                return None

        try:
            with warnings.catch_warnings():
                warnings.simplefilter("error", Image.DecompressionBombWarning)
                with Image.open(io.BytesIO(content)) as image:
                    width, height = image.size
                    if (
                        image.format not in _ALLOWED_IMAGE_FORMATS
                        or width > _MAX_EVENT_IMAGE_EDGE
                        or height > _MAX_EVENT_IMAGE_EDGE
                        or width * height > _MAX_EVENT_IMAGE_PIXELS
                    ):
                        return None
                    image.load()
        except (
            UnidentifiedImageError,
            OSError,
            Image.DecompressionBombError,
            Image.DecompressionBombWarning,
        ):
            return None

        full_bytes, thumb_bytes, extension = _process_image(bytes(content))
        full_path = self.image_dir / f"{file_stem}{extension}"
        thumb_path = self.image_dir / f"{file_stem}_thumb{extension}"
        try:
            self.image_dir.mkdir(parents=True, exist_ok=True)
            full_path.write_bytes(full_bytes)
            thumb_path.write_bytes(thumb_bytes)
        except OSError:
            for path in (full_path, thumb_path):
                try:
                    path.unlink(missing_ok=True)
                except OSError:
                    pass
            return None
        return f"/uploads/images/{full_path.name}"
