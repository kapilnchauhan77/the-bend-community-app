from __future__ import annotations
import re
import unicodedata
from urllib.parse import urlparse
from app.config import get_settings
from app.core.exceptions import ValidationError

_URL_RE = re.compile(r"https?://[^\s<>\"']+", re.I)
_ZERO_WIDTH = re.compile(r"[\u200b-\u200f\u2060\ufeff]")

class ContentModerationService:
    def __init__(self, terms: list[str] | None = None):
        self.terms = terms if terms is not None else get_settings().PUBLIC_CONTENT_PROHIBITED_TERMS

    @staticmethod
    def normalize(value: str) -> str:
        value = unicodedata.normalize("NFKC", value).casefold()
        value = _ZERO_WIDTH.sub("", value)
        value = re.sub(r"[\W_]+", " ", value, flags=re.UNICODE)
        return re.sub(r"\s+", " ", value).strip()

    def validate_public_text(self, fields: dict[str, str | None]) -> None:
        raw_values = [v for v in fields.values() if v]
        values = [self.normalize(v) for v in raw_values]
        terms = [self.normalize(t) for t in self.terms if t]
        all_urls = [u for raw in raw_values for u in _URL_RE.findall(raw)]
        valid_urls = [u for u in all_urls if urlparse(u).scheme in ("http", "https") and urlparse(u).netloc]
        if len(valid_urls) >= 3:
            raise ValidationError("Public content contains repeated-link spam")
        for raw, value in zip(raw_values, values):
            for term in terms:
                if re.search(r"(?<!\w)" + re.escape(term) + r"(?!\w)", value):
                    raise ValidationError("Public content contains a prohibited term")
            urls = [u for u in _URL_RE.findall(raw)]
            valid = [u for u in urls if urlparse(u).scheme in ("http", "https") and urlparse(u).netloc]
