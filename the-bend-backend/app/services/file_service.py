"""File upload service - local filesystem for dev, S3 for production.

Images are processed at upload time:
  - EXIF orientation applied + stripped
  - Resized to max 1600px on the longest edge (preserves aspect)
  - JPEG quality 82 (good balance of size/quality)
  - A separate ~600px thumbnail is generated for cards/list views
PNGs with transparency keep their format; everything else becomes JPEG.

Videos (short clips captured in-app) are accepted as-is and we generate
a poster JPEG (1 frame ~0.5s in, scaled to 1280px on the long edge) so
the frontend has something to show before playback. Duration is probed
and clips longer than the configured ceiling are rejected.
"""
import io
import logging
import os
import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile, status
from PIL import Image, ImageOps, UnidentifiedImageError

from app.config import get_settings

logger = logging.getLogger(__name__)

settings = get_settings()

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)
(UPLOAD_DIR / "images").mkdir(exist_ok=True)
(UPLOAD_DIR / "guidelines").mkdir(exist_ok=True)
(UPLOAD_DIR / "videos").mkdir(exist_ok=True)
(UPLOAD_DIR / "audio").mkdir(exist_ok=True)

MAX_FULL_EDGE = 1600        # max width or height for the "full" image
MAX_THUMB_EDGE = 600        # max width or height for the thumbnail
JPEG_QUALITY = 82

# Media upload limits (shared by the unified /upload/media endpoint).
MAX_UPLOAD_BYTES = 25 * 1024 * 1024   # 25 MB hard ceiling for any single file
MAX_VIDEO_DURATION_SECONDS = 10.0     # frontend caps at 9s; allow 1s of slop
MAX_AUDIO_DURATION_SECONDS = 10.0     # voice notes capped at 9s on the client

ALLOWED_IMAGE_MIME_TYPES = frozenset({
    "image/jpeg",
    "image/png",
    "image/webp",
})
ALLOWED_VIDEO_MIME_TYPES = frozenset({
    "video/mp4",
    "video/webm",
    "video/quicktime",  # iOS .mov
})
# Voice notes recorded in the messenger. iOS Safari sometimes labels an .m4a
# recording as "audio/mp4" — we accept that variant so iPhone users aren't
# blocked. "audio/mpeg" covers .mp3 uploads from the file picker.
ALLOWED_AUDIO_MIME_TYPES = frozenset({
    "audio/webm",
    "audio/mpeg",   # .mp3
    "audio/mp4",    # iOS Safari sometimes sends this for .m4a
    "audio/ogg",
    "audio/wav",
})
ALLOWED_MEDIA_MIME_TYPES = (
    ALLOWED_IMAGE_MIME_TYPES | ALLOWED_VIDEO_MIME_TYPES | ALLOWED_AUDIO_MIME_TYPES
)

# Fallback extension when the upload didn't carry a filename.
_VIDEO_EXT_BY_MIME = {
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "video/quicktime": ".mov",
}
_AUDIO_EXT_BY_MIME = {
    "audio/webm": ".webm",
    "audio/mpeg": ".mp3",
    "audio/mp4": ".m4a",
    "audio/ogg": ".ogg",
    "audio/wav": ".wav",
}


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
    async def upload_private_user_image(self, file, user_id) -> dict:
        """Store an avatar under an exclusive per-user root."""
        content = await file.read()
        file_id = str(uuid.uuid4())
        full_bytes, thumb_bytes, ext = _process_image(content)
        private_dir = UPLOAD_DIR / "users" / str(user_id)
        private_dir.mkdir(parents=True, exist_ok=True)
        full_path = private_dir / f"{file_id}{ext}"
        thumb_path = private_dir / f"{file_id}_thumb{ext}"
        full_path.write_bytes(full_bytes)
        thumb_path.write_bytes(thumb_bytes)
        return {"id": file_id, "url": f"/uploads/users/{user_id}/{file_id}{ext}", "thumbnail_url": f"/uploads/users/{user_id}/{file_id}_thumb{ext}"}

    async def upload_images(self, files: list) -> list[dict]:
        (UPLOAD_DIR / "images").mkdir(parents=True, exist_ok=True)
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

    async def upload_video(self, file: UploadFile) -> dict:
        """Persist a short video and generate a poster JPEG.

        Raises HTTPException(413) if the file exceeds MAX_UPLOAD_BYTES, and
        HTTPException(422) if the probed duration exceeds the configured
        ceiling. ffmpeg/ffprobe are required on PATH (installed in the
        container image); poster generation failures are logged and the
        endpoint still returns a usable url with thumbnail_url=None.
        """
        # ffmpeg-python is a thin wrapper around the ffmpeg/ffprobe CLIs.
        # Imported lazily so unit tests / image-only paths don't require it.
        import ffmpeg  # type: ignore

        content = await file.read()
        if len(content) > MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="File too large (max 25 MB)",
            )

        # Preserve the original extension when present; otherwise fall back
        # to a sensible default based on the content type.
        ext = ""
        if file.filename:
            ext = os.path.splitext(file.filename)[1].lower()
        if not ext:
            ext = _VIDEO_EXT_BY_MIME.get((file.content_type or "").lower(), ".webm")

        file_id = str(uuid.uuid4())
        video_path = UPLOAD_DIR / "videos" / f"{file_id}{ext}"
        poster_path = UPLOAD_DIR / "videos" / f"{file_id}_poster.jpg"

        with open(video_path, "wb") as f:
            f.write(content)

        # Probe duration. If probing fails we treat the upload as invalid
        # rather than silently accepting an unbounded clip.
        try:
            probe = ffmpeg.probe(str(video_path))
            duration_str = probe.get("format", {}).get("duration")
            duration = float(duration_str) if duration_str is not None else 0.0
        except Exception as exc:  # pragma: no cover - defensive
            try:
                video_path.unlink(missing_ok=True)
            except Exception:
                pass
            logger.warning("ffprobe failed for upload %s: %s", file_id, exc)
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Could not read video metadata",
            ) from exc

        if duration > MAX_VIDEO_DURATION_SECONDS:
            try:
                video_path.unlink(missing_ok=True)
            except Exception:
                pass
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Video must be 9 seconds or less",
            )

        # Poster frame: ~0.5s in, scaled so the long edge is 1280px while
        # preserving aspect ratio. We snap height to even values to keep
        # MJPEG happy on odd-height inputs.
        thumbnail_url: str | None = None
        try:
            (
                ffmpeg
                .input(str(video_path), ss=0.5)
                .filter("scale", "if(gt(iw,ih),min(1280,iw),-2)", "if(gt(iw,ih),-2,min(1280,ih))")
                .output(
                    str(poster_path),
                    vframes=1,
                    format="image2",
                    vcodec="mjpeg",
                    **{"q:v": 4},
                )
                .overwrite_output()
                .run(quiet=True)
            )
            if poster_path.exists() and poster_path.stat().st_size > 0:
                thumbnail_url = f"/uploads/videos/{file_id}_poster.jpg"
        except Exception as exc:
            logger.warning("Poster generation failed for upload %s: %s", file_id, exc)

        return {
            "id": file_id,
            "url": f"/uploads/videos/{file_id}{ext}",
            "thumbnail_url": thumbnail_url,
            "duration_ms": int(duration * 1000),
        }

    async def upload_audio(self, file: UploadFile) -> dict:
        """Persist a short voice note and probe its duration.

        Mirrors ``upload_video`` but skips poster generation — audio doesn't
        have a frame to scrub. Raises HTTPException(413) when the upload
        exceeds the shared 25 MB cap, and HTTPException(422) when the probed
        duration exceeds ``MAX_AUDIO_DURATION_SECONDS`` (9 s on the client,
        1 s of slop for clock drift) or ffprobe cannot read the file.
        """
        # ffmpeg-python wraps the ffprobe CLI we already install for video.
        import ffmpeg  # type: ignore

        content = await file.read()
        if len(content) > MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="File too large (max 25 MB)",
            )

        # Preserve the original extension when present; otherwise fall back to
        # one keyed off the content type. Default to ``.webm`` because that's
        # what Chrome / Firefox MediaRecorder produces by default.
        ext = ""
        if file.filename:
            ext = os.path.splitext(file.filename)[1].lower()
        if not ext:
            ext = _AUDIO_EXT_BY_MIME.get((file.content_type or "").lower(), ".webm")

        file_id = str(uuid.uuid4())
        audio_path = UPLOAD_DIR / "audio" / f"{file_id}{ext}"

        with open(audio_path, "wb") as f:
            f.write(content)

        # Probe duration — same shape as video, but reading the "format"
        # block since audio containers expose duration there too.
        try:
            probe = ffmpeg.probe(str(audio_path))
            duration_str = probe.get("format", {}).get("duration")
            duration = float(duration_str) if duration_str is not None else 0.0
        except Exception as exc:  # pragma: no cover - defensive
            try:
                audio_path.unlink(missing_ok=True)
            except Exception:
                pass
            logger.warning("ffprobe failed for audio upload %s: %s", file_id, exc)
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Could not read audio metadata",
            ) from exc

        if duration > MAX_AUDIO_DURATION_SECONDS:
            try:
                audio_path.unlink(missing_ok=True)
            except Exception:
                pass
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Audio must be 9 seconds or less",
            )

        return {
            "id": file_id,
            "url": f"/uploads/audio/{file_id}{ext}",
            "duration_ms": int(duration * 1000),
        }
