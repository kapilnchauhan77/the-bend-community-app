import io
import os
import re
import subprocess
import sys
import time
from multiprocessing import Process
from pathlib import Path

import pytest
from PIL import Image, ImageDraw

from app.services.link_preview_image_store import (
    LinkPreviewImageStore,
    LinkPreviewImageProcessingError,
    link_preview_directory_lock,
)


def _image_bytes(fmt="JPEG", size=(80, 40), *, image=None, **save_kwargs):
    image = image or Image.new("RGB", size, (40, 100, 180))
    output = io.BytesIO()
    image.save(output, format=fmt, **save_kwargs)
    return output.getvalue()


def _saved_path(root, url):
    return root / url.removeprefix("/uploads/")


def test_store_accepts_jpeg_png_and_webp_and_returns_strict_public_path(tmp_path):
    store = LinkPreviewImageStore(tmp_path)
    for fmt in ("JPEG", "PNG", "WEBP"):
        url = store.store(_image_bytes(fmt))
        assert re.fullmatch(r"/uploads/link-previews/[0-9a-f]{64}\.webp", url)
        assert _saved_path(tmp_path, url).is_file()


def test_store_rejects_malformed_and_unsupported_decoded_formats(tmp_path):
    store = LinkPreviewImageStore(tmp_path)
    with pytest.raises(LinkPreviewImageProcessingError):
        store.store(b"not an image")
    with pytest.raises(LinkPreviewImageProcessingError):
        store.store(_image_bytes("BMP"))


def test_store_keeps_only_first_frame_of_animated_webp(tmp_path):
    first = Image.new("RGBA", (24, 12), (255, 0, 0, 255))
    second = Image.new("RGBA", (24, 12), (0, 255, 0, 255))
    payload = _image_bytes("WEBP", image=first, save_all=True, append_images=[second], duration=1, loop=0)
    path = _saved_path(tmp_path, LinkPreviewImageStore(tmp_path).store(payload))
    with Image.open(path) as image:
        assert image.n_frames == 1
        assert image.getpixel((0, 0))[0] > 240 and image.getpixel((0, 0))[1] < 20


def test_store_applies_exif_orientation_and_drops_metadata(tmp_path):
    image = Image.new("RGB", (20, 10), "white")
    ImageDraw.Draw(image).rectangle((0, 0, 4, 9), fill="red")
    exif = image.getexif()
    exif[274] = 6
    exif[36867] = "2026:08:20 00:00:00"
    payload = _image_bytes("JPEG", image=image, exif=exif)
    path = _saved_path(tmp_path, LinkPreviewImageStore(tmp_path).store(payload))
    with Image.open(path) as saved:
        assert (saved.width, saved.height) == (10, 20)
        assert saved.n_frames == 1
        assert not {"exif", "icc_profile", "xmp"}.intersection(saved.info)


def test_dimensions_over_20_megapixels_fail_before_load(tmp_path, monkeypatch):
    store = LinkPreviewImageStore(tmp_path)
    original = Image.Image.load

    def fail_if_loaded(self, *args, **kwargs):
        raise AssertionError("load must not run for oversized dimensions")

    # Header is generated without allocating pixels, then the decoder must reject it.
    payload = _image_bytes("PNG", size=(5001, 4000))
    monkeypatch.setattr(Image.Image, "load", fail_if_loaded)
    with pytest.raises(LinkPreviewImageProcessingError):
        store.store(payload)
    monkeypatch.setattr(Image.Image, "load", original)


def test_pillow_decompression_warning_is_a_controlled_failure(tmp_path, monkeypatch):
    store = LinkPreviewImageStore(tmp_path)

    def warn_open(*args, **kwargs):
        import warnings

        warnings.warn("bomb", Image.DecompressionBombWarning)

    monkeypatch.setattr("app.services.link_preview_image_store.Image.open", warn_open)
    with pytest.raises(LinkPreviewImageProcessingError):
        store.store(b"source")


def test_no_upscale_and_bounded_dimensions(tmp_path):
    store = LinkPreviewImageStore(tmp_path)
    with Image.open(_saved_path(tmp_path, store.store(_image_bytes("PNG", size=(100, 100))))) as saved:
        assert (saved.width, saved.height) == (100, 100)
    with Image.open(_saved_path(tmp_path, store.store(_image_bytes("PNG", size=(2400, 1200))))) as saved:
        assert saved.width <= 1200 and saved.height <= 630


def test_encoding_is_deterministic_and_reuses_existing_digest(tmp_path, monkeypatch):
    store = LinkPreviewImageStore(tmp_path)
    payload = _image_bytes("JPEG", size=(1600, 900))
    first = store.store(payload)
    target = _saved_path(tmp_path, first)
    before = target.stat().st_mtime_ns
    time.sleep(0.001)
    second = store.store(payload)
    assert first == second
    assert target.stat().st_mtime_ns >= before
    assert target.read_bytes() == _saved_path(tmp_path, first).read_bytes()


def test_store_reuse_race_never_touches_outside_symlink_target(tmp_path, monkeypatch):
    store = LinkPreviewImageStore(tmp_path)
    payload = _image_bytes()
    url = store.store(payload)
    target = _saved_path(tmp_path, url)
    outside = tmp_path / "outside.webp"
    outside.write_bytes(b"outside")
    old_mtime = outside.stat().st_mtime_ns
    original_stat = Path.stat
    swapped = False

    def swap_after_stat(path, *, follow_symlinks=True):
        result = original_stat(path, follow_symlinks=follow_symlinks)
        nonlocal swapped
        if path == target and follow_symlinks is False and not swapped:
            swapped = True
            target.unlink()
            target.symlink_to(outside)
        return result

    monkeypatch.setattr(Path, "stat", swap_after_stat)
    assert store.store(payload) == url
    assert swapped is True
    assert outside.stat().st_mtime_ns == old_mtime
    assert outside.read_bytes() == b"outside"


@pytest.mark.parametrize("failure", ["write", "replace"])
def test_temporary_files_are_removed_after_storage_failure(tmp_path, monkeypatch, failure):
    store = LinkPreviewImageStore(tmp_path)
    if failure == "write":
        monkeypatch.setattr("app.services.link_preview_image_store.os.write", lambda fd, data: (_ for _ in ()).throw(OSError("write failed")))
    else:
        real_replace = os.replace

        def fail_replace(source, destination):
            if Path(source).name.endswith(".tmp"):
                raise OSError("replace failed")
            return real_replace(source, destination)

        monkeypatch.setattr("app.services.link_preview_image_store.os.replace", fail_replace)
    with pytest.raises(OSError):
        store.store(_image_bytes())
    assert not list((tmp_path / "link-previews").glob(".*.tmp"))


def test_temp_name_collision_does_not_follow_symlink_and_retries(tmp_path, monkeypatch):
    store = LinkPreviewImageStore(tmp_path)
    outside = tmp_path / "outside.tmp"
    outside.write_bytes(b"outside")
    tokens = iter(("collision", "fresh"))
    monkeypatch.setattr("app.services.link_preview_image_store.secrets.token_hex", lambda n: next(tokens))
    store.image_dir.mkdir(parents=True)
    digest = store._encode(_image_bytes())
    import hashlib

    name = hashlib.sha256(digest).hexdigest()
    (store.image_dir / f".{name}.collision.tmp").symlink_to(outside)
    store.store(_image_bytes())
    assert outside.read_bytes() == b"outside"
    assert (store.image_dir / f".{name}.collision.tmp").is_symlink()


def test_touch_only_accepts_regular_exact_public_paths_and_missing_is_false(tmp_path):
    store = LinkPreviewImageStore(tmp_path)
    url = store.store(_image_bytes())
    assert store.touch(url) is True
    assert store.touch("/uploads/link-previews/missing.webp") is False
    for invalid in (
        "/uploads/link-previews/../images/x.webp",
        "/uploads/images/" + url.rsplit("/", 1)[-1],
        url.upper(),
        url + ".bak",
        "/uploads/link-previews/not-a-digest.webp",
    ):
        assert store.touch(invalid) is False


def test_touch_rejects_symlink_and_non_regular_file(tmp_path):
    store = LinkPreviewImageStore(tmp_path)
    digest = "a" * 64
    image_dir = tmp_path / "link-previews"
    image_dir.mkdir(parents=True)
    (image_dir / f"{digest}.webp").symlink_to(tmp_path / "outside")
    assert store.touch(f"/uploads/link-previews/{digest}.webp") is False
    (image_dir / f"{digest}.webp").unlink()
    (image_dir / f"{digest}.webp").mkdir()
    assert store.touch(f"/uploads/link-previews/{digest}.webp") is False


def test_touch_detects_inode_swap_before_updating_mtime(tmp_path, monkeypatch):
    store = LinkPreviewImageStore(tmp_path)
    url = store.store(_image_bytes())
    original_open = store._open_no_follow

    def swap_before_check(path):
        descriptor = original_open(path)
        replacement = path.with_suffix(".replacement")
        replacement.write_bytes(path.read_bytes())
        os.replace(replacement, path)
        return descriptor

    monkeypatch.setattr(store, "_open_no_follow", swap_before_check)
    assert store.touch(url) is False


def _hold_lock(path, ready, release):
    with link_preview_directory_lock(path, shared=False):
        Path(ready).write_text("ready")
        while not Path(release).exists():
            time.sleep(0.01)


def test_shared_lock_coordinates_with_exclusive_lock_across_processes(tmp_path):
    ready = tmp_path / "ready"
    release = tmp_path / "release"
    process = Process(target=_hold_lock, args=(tmp_path, ready, release))
    process.start()
    contender = None
    try:
        for _ in range(100):
            if ready.exists():
                break
            time.sleep(0.01)
        assert ready.exists()
        started = time.monotonic()
        contender = subprocess.Popen(
            [sys.executable, "-c", "from pathlib import Path; from app.services.link_preview_image_store import link_preview_directory_lock; import sys; p=Path(sys.argv[1]);\nwith link_preview_directory_lock(p, shared=True): pass" , str(tmp_path)],
            cwd=Path(__file__).parents[1],
        )
        time.sleep(0.1)
        assert contender.poll() is None
        release.write_text("release")
        contender.wait(timeout=2)
        process.join(timeout=2)
        assert contender.returncode == 0
        assert process.exitcode == 0
        assert time.monotonic() - started >= 0.1
    finally:
        release.touch()
        if contender is not None and contender.poll() is None:
            contender.terminate()
            try:
                contender.wait(timeout=1)
            except subprocess.TimeoutExpired:
                contender.kill()
                contender.wait(timeout=1)
        if process.is_alive():
            process.terminate()
        process.join(timeout=2)
        if process.is_alive():
            process.kill()
            process.join(timeout=2)
        assert not process.is_alive()
