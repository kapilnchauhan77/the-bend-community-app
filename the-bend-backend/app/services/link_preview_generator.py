"""Coordinate safe link-preview fetching, parsing, and image retention."""

from __future__ import annotations

import asyncio
import inspect
import time
from dataclasses import dataclass
from typing import Callable
from urllib.parse import urlsplit

from app.schemas.bender import LinkPreviewMetadata
from app.services.bender_link_urls import LinkPreviewURLRejected, prepare_external_url
from app.services.link_preview_errors import (
    LinkPreviewDeadlineExceeded,
    LinkPreviewOutcome,
    LinkPreviewResponseTooLarge,
    LinkPreviewTitleMissing,
    LinkPreviewUpstreamFailure,
)
from app.services.link_preview_image_store import LinkPreviewImageProcessingError
from app.services.link_preview_metadata import LinkPreviewMetadataParser
from app.services.safe_external_fetcher import SafeExternalFetcher


@dataclass(frozen=True)
class GeneratedLinkPreview:
    metadata: LinkPreviewMetadata
    normalized_request_url: str
    final_url: str
    outcomes: frozenset[LinkPreviewOutcome] = frozenset()


def _accepts_deadline(callable_obj) -> bool:
    try:
        return "deadline" in inspect.signature(callable_obj).parameters
    except (TypeError, ValueError):
        return False


class BenderLinkPreviewGenerator:
    def __init__(
        self,
        fetcher: SafeExternalFetcher,
        parser: LinkPreviewMetadataParser,
        image_store,
        *,
        clock: Callable[[], float] = time.monotonic,
        deadline_seconds: float = 4.5,
    ):
        self.fetcher = fetcher
        self.parser = parser
        self.image_store = image_store
        self.clock = clock
        self.deadline_seconds = deadline_seconds

    def normalize_request_url(self, source_url: str) -> str:
        return prepare_external_url(source_url).normalized_url

    async def generate(self, source_url: str) -> GeneratedLinkPreview:
        normalized_request_url = self.normalize_request_url(source_url)
        deadline = self.clock() + self.deadline_seconds
        page = await self.fetcher.fetch_html(normalized_request_url, deadline=deadline)
        try:
            async with asyncio.timeout_at(deadline):
                parse_call = self.parser.parse
                if _accepts_deadline(parse_call):
                    parsed = await asyncio.to_thread(parse_call, page.body, final_url=page.final_url, deadline=deadline)
                else:
                    parsed = await asyncio.to_thread(parse_call, page.body, final_url=page.final_url)
        except asyncio.TimeoutError as exc:
            raise LinkPreviewDeadlineExceeded("deadline_exceeded") from exc

        if not parsed.title:
            hostname = urlsplit(page.final_url).hostname
            raise LinkPreviewTitleMissing("title_missing", hostname)

        try:
            destination = prepare_external_url(page.final_url).normalized_url
        except LinkPreviewURLRejected as exc:
            raise LinkPreviewUpstreamFailure("invalid_page_url") from exc
        if parsed.destination_candidate:
            try:
                validated = await self.fetcher.validate_destination(parsed.destination_candidate, deadline=deadline)
                destination = prepare_external_url(validated.normalized_url).normalized_url
            except (LinkPreviewURLRejected, LinkPreviewUpstreamFailure, ValueError):
                destination = page.final_url
        try:
            LinkPreviewMetadata(
                url=destination,
                title=parsed.title,
                description=parsed.description,
                site_name=parsed.site_name,
                image_url=None,
            )
        except ValueError as exc:
            raise LinkPreviewUpstreamFailure("invalid_metadata") from exc

        outcomes: set[LinkPreviewOutcome] = {"success"}
        image_path: str | None = None
        for candidate in parsed.image_candidates[:4]:
            try:
                image_response = await self.fetcher.fetch_image(candidate, deadline=deadline)
                store_call = self.image_store.store
                async with asyncio.timeout_at(deadline):
                    if _accepts_deadline(store_call):
                        stored = await asyncio.to_thread(store_call, image_response.body, deadline=deadline)
                    else:
                        stored = await asyncio.to_thread(store_call, image_response.body)
                candidate_metadata = LinkPreviewMetadata(
                    url=destination,
                    title=parsed.title,
                    description=parsed.description,
                    site_name=parsed.site_name,
                    image_url=stored,
                )
                image_path = candidate_metadata.image_url
                if image_path:
                    break
                raise ValueError("invalid local image path")
            except asyncio.TimeoutError:
                outcomes.update({"image_processing_failure", "timeout"})
            except LinkPreviewURLRejected:
                outcomes.update({"image_processing_failure", "blocked_destination"})
            except LinkPreviewResponseTooLarge:
                outcomes.update({"image_processing_failure", "oversized_response"})
            except LinkPreviewDeadlineExceeded:
                outcomes.update({"image_processing_failure", "timeout"})
            except (LinkPreviewUpstreamFailure, LinkPreviewImageProcessingError, OSError, ValueError):
                outcomes.update({"image_processing_failure", "invalid_content"})

        metadata = LinkPreviewMetadata(
            url=destination,
            title=parsed.title,
            description=parsed.description,
            site_name=parsed.site_name,
            image_url=image_path,
        )
        return GeneratedLinkPreview(metadata, normalized_request_url, page.final_url, frozenset(outcomes))

    async def touch_cached_image(self, image_url: str | None) -> bool:
        if image_url is None:
            return True
        return await asyncio.to_thread(self.image_store.touch, image_url)


__all__ = ["BenderLinkPreviewGenerator", "GeneratedLinkPreview"]
