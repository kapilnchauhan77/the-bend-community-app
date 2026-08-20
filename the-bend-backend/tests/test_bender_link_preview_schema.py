import pytest
from pydantic import ValidationError as PydanticValidationError

from app.schemas.bender import (
    BenderLinkPreview,
    BenderLinkPreviewSnapshot,
)


def test_preview_schema_enforces_public_field_limits():
    preview = BenderLinkPreview(
        source_url="https://example.org/source",
        url="https://example.org/canonical",
        title="T" * 180,
        description="D" * 300,
        site_name="S" * 80,
        image_url="/uploads/link-previews/" + "a" * 64 + ".webp",
    )
    assert preview.title == "T" * 180
    with pytest.raises(PydanticValidationError):
        BenderLinkPreview(
            source_url="https://example.org/source",
            url="https://example.org/canonical",
            title="T" * 181,
        )
    with pytest.raises(PydanticValidationError):
        BenderLinkPreview(
            source_url="https://example.org/source",
            url="https://example.org/canonical",
            title="Title",
            image_url="https://cdn.example.org/hotlink.jpg",
        )


def test_snapshot_is_version_one_and_rejects_unknown_fields():
    snapshot = BenderLinkPreviewSnapshot(
        source_url="https://example.org/source",
        url="https://example.org/canonical",
        title="Title",
    )
    assert snapshot.version == 1
    with pytest.raises(PydanticValidationError):
        BenderLinkPreviewSnapshot.model_validate(
            {**snapshot.model_dump(), "source_html": "<script>x</script>"}
        )
