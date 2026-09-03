import struct
from pathlib import Path

from PIL import Image

from app.api.share import _DEFAULT_IMAGE_PATH, _render


def test_default_share_preview_uses_white_full_wordmark_asset():
    assert _DEFAULT_IMAGE_PATH == "/images/the-bend-community-preview-v4.png"

    frontend = Path(__file__).parents[2] / "the-bend-frontend"
    asset = frontend / "public" / _DEFAULT_IMAGE_PATH.removeprefix("/")
    with asset.open("rb") as preview:
        assert preview.read(8) == b"\x89PNG\r\n\x1a\n"
        assert preview.read(4) == struct.pack(">I", 13)
        assert preview.read(4) == b"IHDR"
        width, height = struct.unpack(">II", preview.read(8))

    assert (width, height) == (1200, 630)
    with Image.open(asset) as preview:
        rgb = preview.convert("RGB")
        assert rgb.getpixel((100, 100)) == (255, 255, 255)
        assert rgb.getpixel((404, 250)) == (217, 208, 195)

    index_markup = (frontend / "index.html").read_text()
    assert index_markup.count("the-bend-community-preview-v4.png") == 3
    assert "the-bend-community-preview-v3.png" not in index_markup


def test_share_preview_includes_secure_and_accessible_image_metadata():
    image = "https://bend.community/images/the-bend-community-preview-v4.png"
    markup = _render(
        title="The Bend Community",
        description="Preview",
        image=image,
        canonical="https://bend.community/",
        site_name="The Bend Community",
    )

    assert f'<meta property="og:image" content="{image}">' in markup
    assert f'<meta property="og:image:secure_url" content="{image}">' in markup
    assert '<meta property="og:image:alt" content="The Bend Community">' in markup
    assert '<meta name="twitter:card" content="summary_large_image">' in markup
    assert '<meta name="twitter:image:alt" content="The Bend Community">' in markup
