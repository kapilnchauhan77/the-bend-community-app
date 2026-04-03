"""File upload service - local filesystem for dev, S3 for production."""
import os
import uuid
from pathlib import Path

from app.config import get_settings

settings = get_settings()

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)
(UPLOAD_DIR / "images").mkdir(exist_ok=True)
(UPLOAD_DIR / "guidelines").mkdir(exist_ok=True)


class FileService:
    async def upload_images(self, files: list) -> list[dict]:
        results = []
        for file in files[:5]:  # Max 5
            ext = os.path.splitext(file.filename)[1] or ".jpg"
            file_id = str(uuid.uuid4())
            path = UPLOAD_DIR / "images" / f"{file_id}{ext}"
            content = await file.read()
            with open(path, "wb") as f:
                f.write(content)
            results.append({
                "id": file_id,
                "url": f"/uploads/images/{file_id}{ext}",
                "thumbnail_url": f"/uploads/images/{file_id}{ext}",
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
