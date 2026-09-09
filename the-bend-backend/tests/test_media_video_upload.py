import io
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import HTTPException, UploadFile

from app.services import file_service as file_service_module
from app.services.file_service import FileService


def make_upload(content=b"video", *, filename="clip.mp4", content_type="video/mp4"):
    return UploadFile(
        filename=filename,
        file=io.BytesIO(content),
        headers={"content-type": content_type},
    )


class FakeFfmpeg:
    def __init__(self, *, duration=45.0, format_name="mov,mp4,m4a,3gp,3g2,mj2", codec_name="h264", poster_fails=False):
        self.duration = duration
        self.format_name = format_name
        self.codec_name = codec_name
        self.poster_fails = poster_fails

    def probe(self, _path):
        return {
            "format": {"duration": str(self.duration), "format_name": self.format_name},
            "streams": [{"codec_type": "video", "codec_name": self.codec_name}],
        }

    def input(self, *_args, **_kwargs):
        return self

    def filter(self, *_args, **_kwargs):
        return self

    def output(self, *_args, **_kwargs):
        return self

    def overwrite_output(self):
        return self

    def run(self, *_args, **_kwargs):
        if self.poster_fails:
            raise RuntimeError("poster failed")
        return None


async def upload_with_probe(monkeypatch, tmp_path, *, duration=45.0, content=b"video", **probe):
    fake = FakeFfmpeg(duration=duration, **probe)
    monkeypatch.setitem(sys.modules, "ffmpeg", fake)
    monkeypatch.setattr(file_service_module, "UPLOAD_DIR", tmp_path)
    (tmp_path / "videos").mkdir()
    return await FileService().upload_video(make_upload(content))


@pytest.mark.asyncio
async def test_accepts_browser_playable_mp4_below_sixty_seconds(monkeypatch, tmp_path):
    result = await upload_with_probe(monkeypatch, tmp_path, duration=45.0)
    assert result["duration_ms"] == 45_000
    assert result["url"].endswith(".mp4")


@pytest.mark.asyncio
async def test_accepts_video_at_exactly_sixty_seconds(monkeypatch, tmp_path):
    result = await upload_with_probe(monkeypatch, tmp_path, duration=60.0)
    assert result["duration_ms"] == 60_000


@pytest.mark.asyncio
async def test_rejects_video_over_sixty_seconds_and_cleans_stored_file(monkeypatch, tmp_path):
    with pytest.raises(HTTPException) as exc:
        await upload_with_probe(monkeypatch, tmp_path, duration=60.001)
    assert exc.value.status_code == 422
    assert "60 seconds" in str(exc.value.detail)
    assert not list((tmp_path / "videos").glob("*.mp4"))


@pytest.mark.asyncio
async def test_rejects_video_over_twenty_five_mb(monkeypatch, tmp_path):
    monkeypatch.setitem(sys.modules, "ffmpeg", FakeFfmpeg())
    monkeypatch.setattr(file_service_module, "UPLOAD_DIR", tmp_path)
    (tmp_path / "videos").mkdir()
    with pytest.raises(HTTPException) as exc:
        await FileService().upload_video(make_upload(b"x" * (25 * 1024 * 1024 + 1)))
    assert exc.value.status_code == 413
    assert "25 MB" in str(exc.value.detail)
    assert not list((tmp_path / "videos").iterdir())


@pytest.mark.asyncio
async def test_rejects_unsupported_video_mime_type_at_api_boundary():
    from app.api.v1.upload import upload_media

    with pytest.raises(HTTPException) as exc:
        await upload_media(make_upload(filename="clip.avi", content_type="video/avi"), object())
    assert exc.value.status_code == 415
    assert "Unsupported media type" in str(exc.value.detail)


@pytest.mark.asyncio
async def test_rejects_unsupported_container_or_codec_and_cleans_file(monkeypatch, tmp_path):
    with pytest.raises(HTTPException) as exc:
        await upload_with_probe(monkeypatch, tmp_path, format_name="matroska,webm", codec_name="av1")
    assert exc.value.status_code == 422
    assert "browser-playable" in str(exc.value.detail)
    assert not list((tmp_path / "videos").glob("*.mp4"))


@pytest.mark.asyncio
async def test_rejects_unreadable_metadata_and_cleans_file(monkeypatch, tmp_path):
    class BrokenProbe(FakeFfmpeg):
        def probe(self, _path):
            raise RuntimeError("invalid media")

    monkeypatch.setitem(sys.modules, "ffmpeg", BrokenProbe())
    monkeypatch.setattr(file_service_module, "UPLOAD_DIR", tmp_path)
    (tmp_path / "videos").mkdir()
    with pytest.raises(HTTPException) as exc:
        await FileService().upload_video(make_upload())
    assert exc.value.status_code == 422
    assert exc.value.detail == "Could not read video metadata"
    assert not list((tmp_path / "videos").iterdir())


@pytest.mark.asyncio
@pytest.mark.parametrize("raw_duration", [None, 0, -1, float("nan"), float("inf"), float("-inf")])
async def test_rejects_non_positive_or_non_finite_duration_and_cleans_file(monkeypatch, tmp_path, raw_duration):
    class InvalidDurationProbe(FakeFfmpeg):
        def probe(self, _path):
            format_data = {"format_name": self.format_name}
            if raw_duration is not None:
                format_data["duration"] = str(raw_duration)
            return {"format": format_data, "streams": [{"codec_type": "video", "codec_name": "h264"}]}

    monkeypatch.setitem(sys.modules, "ffmpeg", InvalidDurationProbe())
    monkeypatch.setattr(file_service_module, "UPLOAD_DIR", tmp_path)
    (tmp_path / "videos").mkdir()
    with pytest.raises(HTTPException) as exc:
        await FileService().upload_video(make_upload())
    assert exc.value.status_code == 422
    assert exc.value.detail == "Video must be a browser-playable MP4/H.264 or WebM/VP8/VP9 format with a valid duration"
    assert not list((tmp_path / "videos").iterdir())


@pytest.mark.asyncio
async def test_poster_failure_does_not_fail_video_upload(monkeypatch, tmp_path):
    result = await upload_with_probe(monkeypatch, tmp_path, poster_fails=True)
    assert result["url"].endswith(".mp4")
    assert result["thumbnail_url"] is None
