"""One-shot backfill: generate thumbnails for existing uploads and downsize originals.

Run inside the backend container:
    docker compose -f docker-compose.prod.yml exec backend python -m app.scripts.backfill_thumbnails

Idempotent — safe to re-run. For every image under uploads/images that doesn't
already have a *_thumb.* sibling, generates one and downsizes the original to
≤1600px on the longest edge. Updates listing_images.thumbnail_url + shop/user
avatar_url + sponsor logo_url + talent/volunteer photo_url where applicable.
"""
import asyncio
import io
from pathlib import Path

from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy import select, update

from app.database import async_session
from app.services.file_service import (
    MAX_FULL_EDGE, MAX_THUMB_EDGE, JPEG_QUALITY,
)

UPLOAD_DIR = Path("uploads") / "images"


def _process_existing(path: Path) -> tuple[bytes, bytes, str] | None:
    try:
        with open(path, "rb") as f:
            content = f.read()
        img = Image.open(io.BytesIO(content))
    except (UnidentifiedImageError, OSError, FileNotFoundError):
        return None

    img = ImageOps.exif_transpose(img)

    has_alpha = img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info)
    if has_alpha:
        out_format, ext = "PNG", ".png"
        if img.mode != "RGBA":
            img = img.convert("RGBA")
    else:
        out_format, ext = "JPEG", ".jpg"
        if img.mode != "RGB":
            img = img.convert("RGB")

    def _encode(image: Image.Image) -> bytes:
        buf = io.BytesIO()
        if out_format == "JPEG":
            image.save(buf, format="JPEG", quality=JPEG_QUALITY, optimize=True, progressive=True)
        else:
            image.save(buf, format="PNG", optimize=True)
        return buf.getvalue()

    full = img.copy()
    full.thumbnail((MAX_FULL_EDGE, MAX_FULL_EDGE), Image.Resampling.LANCZOS)
    full_bytes = _encode(full)

    thumb = img.copy()
    thumb.thumbnail((MAX_THUMB_EDGE, MAX_THUMB_EDGE), Image.Resampling.LANCZOS)
    thumb_bytes = _encode(thumb)

    return full_bytes, thumb_bytes, ext


def _is_thumb_path(p: Path) -> bool:
    return "_thumb" in p.stem


async def backfill_files() -> dict[str, str]:
    """Process every original image; return {original_url -> thumb_url} mapping."""
    if not UPLOAD_DIR.exists():
        print("No uploads directory, skipping.")
        return {}

    mapping: dict[str, str] = {}
    processed = 0
    skipped = 0
    for path in sorted(UPLOAD_DIR.iterdir()):
        if not path.is_file():
            continue
        if _is_thumb_path(path):
            continue

        thumb_candidate_jpg = UPLOAD_DIR / f"{path.stem}_thumb.jpg"
        thumb_candidate_png = UPLOAD_DIR / f"{path.stem}_thumb.png"
        already_has_thumb = thumb_candidate_jpg.exists() or thumb_candidate_png.exists()

        # Even if a thumb exists, we may want to re-encode the original if it's huge.
        try:
            size_kb = path.stat().st_size / 1024
        except OSError:
            size_kb = 0

        if already_has_thumb and size_kb < 600:
            skipped += 1
            continue

        result = _process_existing(path)
        if not result:
            skipped += 1
            continue
        full_bytes, thumb_bytes, ext = result

        # Write the optimized original (replaces the file in place even if ext changed).
        new_full_path = UPLOAD_DIR / f"{path.stem}{ext}"
        with open(new_full_path, "wb") as f:
            f.write(full_bytes)
        # If the extension changed (e.g. .jpeg → .jpg), drop the original.
        if new_full_path != path:
            try:
                path.unlink()
            except OSError:
                pass

        thumb_path = UPLOAD_DIR / f"{path.stem}_thumb{ext}"
        with open(thumb_path, "wb") as f:
            f.write(thumb_bytes)

        old_url = f"/uploads/images/{path.name}"
        new_full_url = f"/uploads/images/{new_full_path.name}"
        new_thumb_url = f"/uploads/images/{thumb_path.name}"
        mapping[old_url] = new_thumb_url
        if old_url != new_full_url:
            mapping[old_url] = new_thumb_url  # explicit; old listings still reference old_url
        # Also map the new full url to the thumb for completeness
        mapping.setdefault(new_full_url, new_thumb_url)
        processed += 1

    print(f"Processed {processed} images, skipped {skipped}.")
    return mapping


async def update_db(mapping: dict[str, str]) -> None:
    """Set thumbnail_url on listing_images. Other tables only have a single
    image url; we leave those alone since the resized original is sufficient.
    """
    if not mapping:
        return

    from app.models.listing import ListingImage

    async with async_session() as session:
        result = await session.execute(select(ListingImage))
        rows = list(result.scalars().all())
        updates = 0
        for img in rows:
            new_thumb = mapping.get(img.url) or mapping.get(img.thumbnail_url or "")
            if new_thumb and img.thumbnail_url != new_thumb:
                img.thumbnail_url = new_thumb
                updates += 1
        await session.commit()
        print(f"Updated thumbnail_url on {updates} listing_images rows.")


async def main():
    mapping = await backfill_files()
    await update_db(mapping)
    print("Done.")


if __name__ == "__main__":
    asyncio.run(main())
