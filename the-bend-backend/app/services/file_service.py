"""File upload service - local filesystem for dev, S3 for production.

Images are processed at upload time:
  - EXIF orientation applied + stripped
  - Resized to max 1600px on the longest edge (preserves aspect)
  - JPEG quality 82 (good balance of size/quality)
  - A separate ~600px thumbnail is generated for cards/list views
PNGs with transparency keep their format; everything else becomes JPEG.
"""
import io
import os
import uuid
from pathlib import Path

from PIL import Image, ImageOps, UnidentifiedImageError

from app.config import get_settings

settings = get_settings()

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)
(UPLOAD_DIR / "images").mkdir(exist_ok=True)
(UPLOAD_DIR / "guidelines").mkdir(exist_ok=True)

MAX_FULL_EDGE = 1600        # max width or height for the "full" image
MAX_THUMB_EDGE = 600        # max width or height for the thumbnail
JPEG_QUALITY = 82


def _process_image(content: bytes) -> tuple[bytes, bytes, str]:
    """Return (full_bytes, thumb_bytes, ext) for the processed image.

    Falls back to the raw bytes (twice) when Pillow can't decode the input.
    """
    try:
        img = Image.open(io.BytesIO(content))
    except (UnidentifiedImageError, OSError):
        return content, content, ".jpg"

    img = ImageOps.exif_transpose(img)  # respect orientation, then drop EXIF

    # Decide output format. Keep PNG only if the image actually uses alpha.
    has_alpha = img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info)
    if has_alpha:
        out_format = "PNG"
        ext = ".png"
        if img.mode != "RGBA":
            img = img.convert("RGBA")
    else:
        out_format = "JPEG"
        ext = ".jpg"
        if img.mode != "RGB":
            img = img.convert("RGB")

    def _encode(image: Image.Image) -> bytes:
        buf = io.BytesIO()
        if out_format == "JPEG":
            image.save(buf, format="JPEG", quality=JPEG_QUALITY, optimize=True, progressive=True)
        else:
            image.save(buf, format="PNG", optimize=True)
        return buf.getvalue()

    # Full-size copy
    full = img.copy()
    full.thumbnail((MAX_FULL_EDGE, MAX_FULL_EDGE), Image.Resampling.LANCZOS)
    full_bytes = _encode(full)

    # Thumbnail
    thumb = img.copy()
    thumb.thumbnail((MAX_THUMB_EDGE, MAX_THUMB_EDGE), Image.Resampling.LANCZOS)
    thumb_bytes = _encode(thumb)

    return full_bytes, thumb_bytes, ext


class FileService:
    async def upload_images(self, files: list) -> list[dict]:
        results = []
        for file in files[:5]:  # Max 5
            content = await file.read()
            file_id = str(uuid.uuid4())
            full_bytes, thumb_bytes, ext = _process_image(content)

            full_path = UPLOAD_DIR / "images" / f"{file_id}{ext}"
            thumb_path = UPLOAD_DIR / "images" / f"{file_id}_thumb{ext}"
            with open(full_path, "wb") as f:
                f.write(full_bytes)
            with open(thumb_path, "wb") as f:
                f.write(thumb_bytes)

            results.append({
                "id": file_id,
                "url": f"/uploads/images/{file_id}{ext}",
                "thumbnail_url": f"/uploads/images/{file_id}_thumb{ext}",
            })
        return results

    async def upload_guidelines(self, file) -> dict:
        ext = os.path.splitext(file.filename)[1] or ".pdf"
        file_id = str(uuid.uuid4())
        path = UPLOAD_DIR / "guidelines" / f"{file_id}{ext}"
        content = await file.read()
        with open(path, "wb") as f:
            f.write(content)
        return {
            "id": file_id,
            "file_url": f"/uploads/guidelines/{file_id}{ext}",
            "file_name": file.filename,
            "file_type": ext.lstrip("."),
            "file_size": len(content),
        }
