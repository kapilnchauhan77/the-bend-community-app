import pytest
from app.services.content_moderation_service import ContentModerationService
from app.core.exceptions import ValidationError

def test_rejects_normalized_prohibited_phrase_and_evasion():
    service = ContentModerationService(["bad phrase"])
    with pytest.raises(ValidationError): service.validate_public_text({"title": "BAD\u200b-phrase"})

def test_allows_harmless_substring_and_one_or_two_links():
    service = ContentModerationService(["spam"])
    service.validate_public_text({"title": "spammer", "description": "https://one.test https://two.test"})

def test_rejects_repeated_link_spam():
    service = ContentModerationService([])
    with pytest.raises(ValidationError): service.validate_public_text({"caption": "https://a.test https://b.test https://c.test"})
