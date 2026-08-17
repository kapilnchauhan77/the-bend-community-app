import pytest
from pathlib import Path
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

@pytest.mark.parametrize("value", ["ＢＡＤ　ＰＨＲＡＳＥ", "bad\u200b phrase", "bad---phrase", "bad\n phrase", "bad\tphrase"])
def test_normalizer_handles_nfkc_zero_width_punctuation_and_whitespace(value):
    with pytest.raises(ValidationError): ContentModerationService(["bad phrase"]).validate_public_text({"title": value})

@pytest.mark.parametrize("value", ["badminton", "bad phrases", "notbad phrasebook"])
def test_whole_phrase_matching_avoids_harmless_substrings(value):
    ContentModerationService(["bad phrase"]).validate_public_text({"title": value})

def test_multiword_term_split_by_punctuation_and_fields():
    service = ContentModerationService(["forbidden words"])
    with pytest.raises(ValidationError): service.validate_public_text({"title": "forbidden", "description": "words"})

@pytest.mark.parametrize("fields", [{}, {"title": "https://a.test"}, {"title": "https://a.test", "description": "https://b.test"}])
def test_zero_one_two_http_links_are_allowed(fields):
    ContentModerationService([]).validate_public_text(fields)

@pytest.mark.parametrize("fields", [{"title": "https://a.test", "description": "https://b.test", "location": "https://c.test"}, {"title": "https://a.test https://a.test https://a.test"}])
def test_three_http_links_across_public_fields_are_rejected(fields):
    with pytest.raises(ValidationError): ContentModerationService([]).validate_public_text(fields)

def test_malformed_and_non_http_links_do_not_count_as_spam():
    ContentModerationService([]).validate_public_text({"title": "ftp://a.test www.example.test https//missing-scheme"})

def test_public_write_call_graph_contains_moderation_before_persistence_services():
    root = Path(__file__).resolve().parents[1] / "app"
    paths = [root/"services/listing_service.py", root/"services/shop_service.py", root/"services/event_service.py", root/"services/bender_service.py", root/"services/auth_service.py", root/"api/v1/volunteers.py", root/"api/v1/talent.py", root/"api/v1/events.py"]
    for path in paths:
        source = path.read_text()
        assert "ContentModerationService" in source, path

def test_private_message_and_inquiry_services_are_excluded_from_public_filter():
    root = Path(__file__).resolve().parents[1] / "app"
    for rel in ("services/message_service.py", "services/talent_service.py", "services/volunteer_service.py"):
        source = (root / rel).read_text()
        assert "ContentModerationService" not in source
