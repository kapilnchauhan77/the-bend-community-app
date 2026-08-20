"""Pure extraction and sanitization of link-preview metadata."""

from __future__ import annotations

import html as html_lib
import json
import re
from dataclasses import dataclass
from urllib.parse import urljoin, urlsplit, urlunsplit

from app.services.bender_link_urls import MAX_EXTERNAL_URL_LENGTH

from bs4 import BeautifulSoup, Tag


_WHITESPACE = re.compile(r"\s+", re.UNICODE)
_TRACKING_NAME = re.compile(r"(?:tracking|pixel|spacer|blank)", re.I)
_QUALIFIED_NAME = re.compile(r"(?:hero|banner|cover|logo|brand)", re.I)
_MAIN_NAME = re.compile(r"(?:article|content|main|post|feature)", re.I)
_DIMENSION = re.compile(r"^\s*([0-9]+(?:\.[0-9]+)?)\s*(?:px)?\s*$", re.I)
_STYLE_DIMENSION = re.compile(r"(?:^|;)\s*(width|height)\s*:\s*([0-9]+(?:\.[0-9]+)?)\s*(?:px)?\s*(?:;|$)", re.I)
_JSONLD_BYTES = 128 * 1024
_JSONLD_NODES = 512
_JSONLD_DEPTH = 32


@dataclass(frozen=True)
class ParsedLinkPreview:
    title: str | None
    description: str | None
    site_name: str | None
    destination_candidate: str | None
    image_candidates: tuple[str, ...]
    invalid_destination: bool = False


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


def _meta_values(soup: BeautifulSoup, *, property_name: str | None = None, name: str | None = None) -> list[str]:
    attribute, expected = ("property", property_name) if property_name is not None else ("name", name)
    if expected is None:
        return []
    values: list[str] = []
    for tag in soup.find_all("meta"):
        if str(tag.get(attribute, "")).strip().lower() == expected.lower():
            content = tag.get("content")
            if content is not None:
                values.append(str(content))
    return values


def _meta(soup: BeautifulSoup, *, property_name: str | None = None, name: str | None = None) -> str | None:
    values = _meta_values(soup, property_name=property_name, name=name)
    return values[0] if values else None


def _absolute_url(value: object, base_url: str) -> str | None:
    if value is None:
        return None
    raw = html_lib.unescape(str(value)).strip()
    if not raw or len(raw) > MAX_EXTERNAL_URL_LENGTH:
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
    if parts.username is not None or parts.password is not None or not parts.hostname:
        return None
    try:
        if parts.port not in (None, 80, 443):
            return None
    except ValueError:
        return None
    return urlunsplit((parts.scheme.lower(), parts.netloc, parts.path, parts.query, parts.fragment))


def _metadata_urls(soup: BeautifulSoup, final_url: str) -> list[str]:
    values: list[str] = []
    for property_name, name in (
        ("og:image:secure_url", None),
        ("og:image", None),
        (None, "twitter:image"),
    ):
        for value in _meta_values(soup, property_name=property_name, name=name):
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
    return values


def _structured_image_values(value: object) -> list[str]:
    result: list[str] = []
    stack: list[tuple[object, int]] = [(value, 0)]
    visited: set[int] = set()
    while stack and len(result) < 32:
        item, depth = stack.pop()
        if depth > _JSONLD_DEPTH:
            continue
        if isinstance(item, str):
            result.append(item)
            continue
        if not isinstance(item, (dict, list)):
            continue
        marker = id(item)
        if marker in visited:
            continue
        visited.add(marker)
        if len(visited) > _JSONLD_NODES:
            break
        if isinstance(item, list):
            stack.extend((child, depth + 1) for child in reversed(item[:64]))
        else:
            for key in ("url", "contentUrl"):
                if isinstance(item.get(key), str):
                    result.append(item[key])
            stack.extend((child, depth + 1) for child in reversed(list(item.values())[:64]) if isinstance(child, (dict, list)))
    return result[:32]


def _structured_candidates(soup: BeautifulSoup, final_url: str) -> list[str]:
    candidates: list[str] = []
    for script in soup.find_all("script"):
        if "json" not in str(script.get("type", "")).lower():
            continue
        raw = script.string or script.get_text()
        if len(raw.encode("utf-8", "ignore")) > _JSONLD_BYTES:
            continue
        try:
            data = json.loads(raw)
        except (TypeError, ValueError, json.JSONDecodeError, RecursionError):
            continue
        stack: list[tuple[object, int]] = [(data, 0)]
        visited: set[int] = set()
        nodes = 0
        while stack:
            item, depth = stack.pop()
            if depth > _JSONLD_DEPTH or nodes >= _JSONLD_NODES:
                continue
            nodes += 1
            if isinstance(item, list):
                stack.extend((child, depth + 1) for child in reversed(item[:64]))
            elif isinstance(item, dict):
                marker = id(item)
                if marker in visited:
                    continue
                visited.add(marker)
                for key in ("image", "logo"):
                    for value in _structured_image_values(item.get(key)):
                        candidate = _absolute_url(value, final_url)
                        if candidate and _candidate_is_image(candidate):
                            candidates.append(candidate)
                for value in list(item.values())[:64]:
                    if isinstance(value, (dict, list)):
                        stack.append((value, depth + 1))
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
        or src.lower().startswith("data:")
        or src.lower().split("?", 1)[0].split("#", 1)[0].endswith(".svg")
        or str(tag.get("type", "")).lower().split(";", 1)[0].strip() == "image/svg+xml"
    ):
        return False
    if _hidden(tag):
        return False
    attrs = " ".join(str(tag.get(key, "")) for key in ("id", "class", "alt", "src")).lower()
    if _TRACKING_NAME.search(attrs):
        return False
    dimensions: list[float] = []
    for key in ("width", "height"):
        match = _DIMENSION.match(str(tag.get(key, "")))
        if match:
            dimensions.append(float(match.group(1)))
    for match in _STYLE_DIMENSION.finditer(str(tag.get("style", ""))):
        dimensions.append(float(match.group(2)))
    if any(value <= 2 for value in dimensions):
        return False
    return True


def _candidate_is_image(value: str) -> bool:
    try:
        parts = urlsplit(value)
    except ValueError:
        return False
    return parts.scheme.lower() in {"http", "https"} and not parts.path.lower().endswith(".svg")


def _rank_image_candidates(soup: BeautifulSoup, final_url: str) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()

    def add(value: object) -> None:
        candidate = _absolute_url(value, final_url)
        if candidate and _candidate_is_image(candidate) and candidate not in seen:
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
        if re.search(r"(?:icon|favicon)", context, re.I):
            icons.append(image)
        elif _QUALIFIED_NAME.search(context):
            qualified.append(image)
        elif any(parent.name in {"main", "article"} for parent in image.parents if isinstance(parent, Tag)) or _MAIN_NAME.search(context):
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
            *_meta_values(soup, property_name="og:title"),
            *_meta_values(soup, name="twitter:title"),
            soup.title.get_text(" ", strip=False) if soup.title else None,
            limit=180,
        )
        description = _first_text(
            *_meta_values(soup, property_name="og:description"),
            *_meta_values(soup, name="twitter:description"),
            *_meta_values(soup, name="description"),
            limit=300,
        )
        site_name = _first_text(
            *_meta_values(soup, property_name="og:site_name"),
            urlsplit(final_url).hostname,
            limit=80,
        )
        destination_values = _meta_values(soup, property_name="og:url")
        destination = next((candidate for value in destination_values if (candidate := _absolute_url(value, final_url))), None)
        return ParsedLinkPreview(
            title=title,
            description=description,
            site_name=site_name,
            destination_candidate=destination,
            image_candidates=tuple(_rank_image_candidates(soup, final_url)),
            invalid_destination=bool(destination_values) and destination is None,
        )
