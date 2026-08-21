from typing import Literal

from app.services.bender_link_urls import LinkPreviewURLRejected


class LinkPreviewError(Exception):
    def __init__(self, reason: str, hostname: str | None = None):
        super().__init__(reason)
        self.reason = reason
        self.hostname = hostname


class LinkPreviewResponseTooLarge(LinkPreviewError):
    pass


class LinkPreviewTitleMissing(LinkPreviewError):
    pass


class LinkPreviewUpstreamFailure(LinkPreviewError):
    pass


class LinkPreviewDeadlineExceeded(LinkPreviewError):
    pass


LinkPreviewOutcome = Literal[
    "success",
    "cache_hit",
    "blocked_destination",
    "timeout",
    "invalid_content",
    "oversized_response",
    "image_processing_failure",
]


__all__ = [
    "LinkPreviewURLRejected",
    "LinkPreviewError",
    "LinkPreviewResponseTooLarge",
    "LinkPreviewTitleMissing",
    "LinkPreviewUpstreamFailure",
    "LinkPreviewDeadlineExceeded",
    "LinkPreviewOutcome",
]
