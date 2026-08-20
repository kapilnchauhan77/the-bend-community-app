"""Application coordinator for authenticated Bender link previews."""

from __future__ import annotations

from uuid import UUID

from app.schemas.bender import (
    BenderLinkPreview,
    BenderLinkPreviewResponse,
    BenderLinkPreviewSnapshot,
)
from app.services.bender_link_urls import LinkPreviewURLRejected
from app.services.link_preview_errors import (
    LinkPreviewDeadlineExceeded,
    LinkPreviewResponseTooLarge,
    LinkPreviewTitleMissing,
    LinkPreviewUpstreamFailure,
)


class BenderLinkPreviewService:
    def __init__(self, store, generator):
        self.store = store
        self.generator = generator

    async def create_preview(
        self,
        source_url: str,
        *,
        user_id: UUID,
        tenant_id: UUID | None,
    ) -> BenderLinkPreviewResponse:
        exact_source = source_url.strip() if isinstance(source_url, str) else source_url
        if not exact_source or len(exact_source) > 2048:
            raise LinkPreviewURLRejected("invalid_length")

        try:
            normalized = self.generator.normalize_request_url(exact_source)
            metadata = await self.store.get_cached_metadata(normalized)
            if metadata is not None:
                if await self.generator.touch_cached_image(metadata.image_url):
                    await self.store.record_outcome("cache_hit")
                else:
                    metadata = None

            if metadata is None:
                generated = await self.generator.generate(exact_source)
                metadata = generated.metadata
                await self.store.cache_metadata(
                    generated.normalized_request_url,
                    metadata,
                    final_url=generated.final_url,
                )
                for outcome in sorted(generated.outcomes):
                    if outcome != "success":
                        await self.store.record_outcome(outcome)

            snapshot = BenderLinkPreviewSnapshot(
                source_url=exact_source,
                **metadata.model_dump(),
            )
            token = await self.store.issue_draft(
                snapshot,
                user_id=user_id,
                tenant_id=tenant_id,
            )
            await self.store.record_outcome("success")
            return BenderLinkPreviewResponse(
                preview_token=token,
                preview=BenderLinkPreview.model_validate(
                    snapshot.model_dump(exclude={"version"})
                ),
            )
        except (LinkPreviewURLRejected, LinkPreviewResponseTooLarge, LinkPreviewDeadlineExceeded, LinkPreviewTitleMissing, LinkPreviewUpstreamFailure) as exc:
            mapping = {
                LinkPreviewURLRejected: "blocked_destination",
                LinkPreviewResponseTooLarge: "oversized_response",
                LinkPreviewDeadlineExceeded: "timeout",
                LinkPreviewTitleMissing: "invalid_content",
                LinkPreviewUpstreamFailure: "invalid_content",
            }
            await self.store.record_outcome(mapping[type(exc)])
            raise


__all__ = ["BenderLinkPreviewService"]
