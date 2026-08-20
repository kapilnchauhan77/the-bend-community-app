"""Pure extraction and sanitization of link-preview metadata."""

from __future__ import annotations

import html as html_lib
import json
import re
from dataclasses import dataclass
from urllib.parse import urljoin, urlsplit, urlunsplit

from bs4 import BeautifulSoup, Tag


_WHITESPACE = re.compile(r"\s+", re.UNICODE)
_TRACKING_NAME = re.compile(r"(?:tracking|pixel|spacer|blank)", re.I)
_QUALIFIED_NAME = re.compile(r"(?:hero|banner|cover|logo|brand)", re.I)
_MAIN_NAME = re.compile(r"(?:article|content|main|post|feature)", re.I)


@dataclass(frozen=True)
class ParsedLinkPreview:
    title: str | None
    description: str | None
    site_name: str | None
    destination_candidate: str | None
    image_candidates: tuple[str, ...]


def _first_text(*values: object, limit: int) -> str | None:
    for value in values:
        if value is None:
            continue
        decoded = html_lib.unescape(str(value))
        fragment = BeautifulSoup(decoded, "lxml")
        for element in fragment.find_all(("script", "style", "noscript")):
            element.decompose()
        clean = _WHITESPACE.sub(" ", fragment.get_text(" ", strip=False)).strip()
        if clean:
            return clean[:limit]
    return None


def _meta(soup: BeautifulSoup, *, property_name: str | None = None, name: str | None = None) -> str | None:
    attribute, expected = ("property", property_name) if property_name is not None else ("name", name)
    if expected is None:
        return None
    for tag in soup.find_all("meta"):
        if str(tag.get(attribute, "")).strip().lower() == expected.lower():
            content = tag.get("content")
            if content is not None:
                return str(content)
    return None


def _absolute_url(value: object, base_url: str) -> str | None:
    if value is None:
        return None
    raw = html_lib.unescape(str(value)).strip()
    if not raw:
        return None
    if any(ord(char) < 32 for char in raw) or "\\" in raw:
        return None
    if re.search(r"%(?![0-9A-Fa-f]{2})", raw):
        return None
    try:
        absolute = urljoin(base_url, raw)
        parts = urlsplit(absolute)
    except ValueError:
        return None
    if parts.scheme.lower() not in {"http", "https"} or not parts.netloc:
        return None
    if parts.username is not None or parts.password is not None:
        return None
    return urlunsplit((parts.scheme.lower(), parts.netloc, parts.path, parts.query, parts.fragment))


def _metadata_urls(soup: BeautifulSoup, final_url: str) -> list[str]:
    values: list[str] = []
    for property_name, name in (
        ("og:image:secure_url", None),
        ("og:image", None),
        (None, "twitter:image"),
    ):
        value = _meta(soup, property_name=property_name, name=name)
        candidate = _absolute_url(value, final_url)
        if candidate and _candidate_is_image(candidate):
            values.append(candidate)
    for link in soup.find_all("link"):
        rel = link.get("rel", [])
        rels = {str(item).lower() for item in (rel if isinstance(rel, list) else [rel])}
        if "image_src" in rels:
            candidate = _absolute_url(link.get("href"), final_url)
            if candidate and _candidate_is_image(candidate):
                values.append(candidate)
            break
    return values


def _structured_image_values(value: object) -> list[str]:
    if isinstance(value, str):
        return [value]
    if isinstance(value, list):
        result: list[str] = []
        for item in value:
            result.extend(_structured_image_values(item))
        return result
    if isinstance(value, dict):
        for key in ("url", "contentUrl"):
            if isinstance(value.get(key), str):
                return [value[key]]
    return []


def _structured_candidates(soup: BeautifulSoup, final_url: str) -> list[str]:
    candidates: list[str] = []
    for script in soup.find_all("script"):
        if "json" not in str(script.get("type", "")).lower():
            continue
        try:
            data = json.loads(script.string or script.get_text())
        except (TypeError, ValueError, json.JSONDecodeError):
            continue
        stack = [data]
        while stack:
            item = stack.pop(0)
            if isinstance(item, list):
                stack[0:0] = item
            elif isinstance(item, dict):
                for key in ("image", "logo"):
                    for value in _structured_image_values(item.get(key)):
                        candidate = _absolute_url(value, final_url)
                        if candidate:
                            candidates.append(candidate)
                for value in item.values():
                    if isinstance(value, (dict, list)):
                        stack.append(value)
    return candidates


def _hidden(tag: Tag) -> bool:
    current: Tag | None = tag
    while current is not None:
        if current.has_attr("hidden") or str(current.get("aria-hidden", "")).lower() == "true":
            return True
        style = str(current.get("style", "")).replace(" ", "").lower()
        if "display:none" in style or "visibility:hidden" in style:
            return True
        current = current.parent if isinstance(current.parent, Tag) else None
    return False


def _image_usable(tag: Tag) -> bool:
    src = str(tag.get("src", "")).strip()
    if (
        not src
        or not _candidate_is_image(src)
        or src.lower().startswith("data:")
        or str(tag.get("type", "")).lower().split(";", 1)[0].strip() == "image/svg+xml"
    ):
        return False
    if _hidden(tag):
        return False
    attrs = " ".join(str(tag.get(key, "")) for key in ("id", "class", "alt", "src")).lower()
    if _TRACKING_NAME.search(attrs):
        return False
    try:
        width = int(str(tag.get("width", "")))
        height = int(str(tag.get("height", "")))
    except ValueError:
        width = height = 0
    if (width and width <= 2) or (height and height <= 2):
        return False
    return True


def _candidate_is_image(value: str) -> bool:
    lowered = value.lower().split("?", 1)[0]
    return not lowered.startswith("data:") and not lowered.endswith(".svg")


def _rank_image_candidates(soup: BeautifulSoup, final_url: str) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()

    def add(value: object) -> None:
        candidate = _absolute_url(value, final_url)
        if candidate and candidate not in seen:
            seen.add(candidate)
            result.append(candidate)

    for candidate in _metadata_urls(soup, final_url):
        add(candidate)
    for candidate in _structured_candidates(soup, final_url):
        add(candidate)

    images = [tag for tag in soup.find_all("img", limit=32) if _image_usable(tag)]
    qualified: list[Tag] = []
    main: list[Tag] = []
    icons: list[Tag] = []
    for image in images:
        context = " ".join(
            str(node.get(key, ""))
            for node in [image, *[parent for parent in image.parents if isinstance(parent, Tag)][:2]]
            for key in ("id", "class", "alt", "role")
        )
        if _QUALIFIED_NAME.search(context):
            qualified.append(image)
        elif any(parent.name in {"main", "article"} for parent in image.parents if isinstance(parent, Tag)) or _MAIN_NAME.search(context):
            main.append(image)
        elif re.search(r"(?:icon|favicon)", context, re.I):
            icons.append(image)
        else:
            main.append(image)
    for image in [*qualified, *main]:
        add(image.get("src"))

    for link in soup.find_all("link"):
        rel = link.get("rel", [])
        rels = {str(item).lower() for item in (rel if isinstance(rel, list) else [rel])}
        if rels.intersection({"icon", "shortcut", "apple-touch-icon"}):
            add(link.get("href"))
    for image in icons:
        add(image.get("src"))
    return result[:4]


class LinkPreviewMetadataParser:
    def parse(self, html_bytes: bytes, *, final_url: str) -> ParsedLinkPreview:
        soup = BeautifulSoup(html_bytes, "lxml")
        title = _first_text(
            _meta(soup, property_name="og:title"),
            _meta(soup, name="twitter:title"),
            soup.title.get_text(" ", strip=False) if soup.title else None,
            limit=180,
        )
        description = _first_text(
            _meta(soup, property_name="og:description"),
            _meta(soup, name="twitter:description"),
            _meta(soup, name="description"),
            limit=300,
        )
        site_name = _first_text(
            _meta(soup, property_name="og:site_name"),
            urlsplit(final_url).hostname,
            limit=80,
        )
        return ParsedLinkPreview(
            title=title,
            description=description,
            site_name=site_name,
            destination_candidate=_absolute_url(_meta(soup, property_name="og:url"), final_url),
            image_candidates=tuple(_rank_image_candidates(soup, final_url)),
        )
