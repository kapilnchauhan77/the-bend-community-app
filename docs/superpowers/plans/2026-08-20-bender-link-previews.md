# Bender Link Previews Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Bender authors preview the first public HTTP or HTTPS link in the composer and publish a stable Facebook-style card backed by Bend-cached metadata and images.

**Architecture:** An authenticated preview endpoint uses a dedicated SSRF-safe fetcher, pure metadata parser, Bend-managed image store, and 20-minute Redis handoff token. Post creation accepts only the opaque token, verifies its user, tenant, and caption binding, and stores an immutable nullable JSONB snapshot. The frontend debounces the first URL, handles cancellation and dismissal, and renders saved snapshots without fetching third-party sites from the feed.

**Tech Stack:** Python 3.11+, FastAPI, Pydantic v2, async SQLAlchemy 2, Alembic, PostgreSQL JSONB, Redis 7, aiohttp, idna, Beautiful Soup, Pillow, Celery Beat, React 19, TypeScript 5.9, axios, Tailwind CSS, and Playwright.

**Spec:** `docs/superpowers/specs/2026-08-20-bender-link-previews-design.md`

## Global Constraints

- Generate a card for the first explicit HTTP or HTTPS URL only. One post has at most one link preview.
- The browser submits only `preview_token`; it never submits source metadata as trusted post data.
- Store the normalized caption unchanged apart from the existing leading and trailing whitespace trim. Hide the accepted `source_url` only while rendering.
- The public feed and post reads never contact source websites.
- Preview failures, Redis failures during post creation, expired tokens, and mismatched tokens never block normal post creation.
- The preview endpoint requires authentication and allows 10 requests per user per 60 seconds.
- A preview draft and metadata cache entry expire after 1,200 seconds.
- One monotonic server deadline of 4.5 seconds covers DNS, redirects, decoded streaming, parsing, image attempts, decoding, and storage.
- Allow HTTP and HTTPS on ports 80 and 443 only. Revalidate and pin every redirect and image destination.
- HTML is capped at 512 KiB after content decoding. Images are capped at 3 MiB after content decoding and 20 megapixels after decode.
- Store only plain sanitized metadata and locally re-encoded WebP images. Never store source HTML or render it with `dangerouslySetInnerHTML`.
- Treat Facebook, Instagram, login-gated, anti-bot, and metadata-poor pages as best effort. They fall back to a normal clickable caption link rather than a blank or blocking state.
- Accept a preview `image_url` only when it exactly matches `/uploads/link-previews/{64 lowercase hex}.webp`; reject remote or malformed image values at both backend validation and frontend rendering boundaries.
- Log hostname and bounded error class only. Never log full URLs, query strings, preview tokens, source text, image bytes, resolved addresses, or Redis record values.
- `link_preview` is nullable and additive. Existing clients and legacy rows remain valid.
- Implement every task test-first, run the named RED command before production code, then run the named GREEN command before committing.
- Preserve unrelated changes. Work only in `/Users/kapil/Desktop/projects/the_bend_community_app/.worktrees/bender-link-previews` on `codex/bender-link-previews`.

## File Structure

Create backend modules with one responsibility each:

- `app/services/bender_link_urls.py`: caption URL extraction and URL syntax helpers shared by post binding.
- `app/services/link_preview_errors.py`: typed fixed-category preview failures.
- `app/services/safe_external_fetcher.py`: URL preparation, DNS policy, pinned transport, redirects, decoded byte limits, and deadline enforcement.
- `app/services/link_preview_metadata.py`: pure HTML metadata extraction and image-candidate ranking.
- `app/services/link_preview_image_store.py`: Pillow validation, deterministic WebP encoding, and atomic content-addressed storage.
- `app/services/link_preview_generator.py`: page fetch, metadata selection, canonical URL validation, and image fallback orchestration.
- `app/services/bender_link_preview_store.py`: Redis metadata cache, bound draft tokens, and live image references.
- `app/services/bender_link_preview_service.py`: authenticated preview-use case coordinating generator and Redis.
- `app/services/link_preview_cleanup.py`: conservative deletion of old unreferenced preview images.

Create frontend modules that keep the existing `BenderPage` manageable:

- `src/lib/benderLinks.ts`: URL extraction, source-URL omission, and safe caption tokenization.
- `src/hooks/useBenderLinkPreview.ts`: debounce, cancellation, dismissal, stale-response rejection, and submit settlement.
- `src/components/features/bender/BenderCaption.tsx`: plain text plus safe HTTP and HTTPS anchors.
- `src/components/features/bender/BenderLinkPreviewCard.tsx`: composer and feed cards.

The backend and Playwright suites consume `test-fixtures/bender-link-url-cases.json` so punctuation and first-link behavior cannot drift.

---

### Task 1: Add the nullable preview snapshot contract and migration

**Files:**
- Modify: `the-bend-backend/app/models/bender.py`
- Modify: `the-bend-backend/app/schemas/bender.py`
- Modify: `the-bend-backend/app/services/bender_service.py`
- Modify: `the-bend-backend/app/api/v1/bender.py`
- Create: `the-bend-backend/alembic/versions/bender_link_preview.py`
- Create: `the-bend-backend/tests/test_bender_link_preview_schema.py`
- Create: `the-bend-backend/tests/test_bender_link_preview_migration.py`

**Interfaces:**
- Produces `BenderLinkPreview`, `BenderLinkPreviewSnapshot`, `BenderLinkPreviewRequest`, and `BenderLinkPreviewResponse` Pydantic models.
- Produces `BenderPost.link_preview: dict[str, object] | None`.
- Adds `BenderPostResponse.link_preview: BenderLinkPreview | None = None`.
- The migration revision is exactly `bender_link_preview` with parent `westmoreland_pricing` unless `origin/main` gains a newer head before implementation.

- [ ] **Step 1: Write the schema and migration tests**

Create focused tests that assert field bounds and the additive migration:

```python
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
```

In the migration test, load `bender_link_preview.py`, monkeypatch `op.add_column` and `op.drop_column`, and assert:

```python
assert migration.revision == "bender_link_preview"
assert migration.down_revision == "westmoreland_pricing"
assert captured_table == "bender_posts"
assert captured_column.name == "link_preview"
assert isinstance(captured_column.type, postgresql.JSONB)
assert captured_column.nullable is True
```

- [ ] **Step 2: Run the tests and confirm RED**

Run:

```bash
cd the-bend-backend
.venv/bin/pytest -q tests/test_bender_link_preview_schema.py tests/test_bender_link_preview_migration.py
```

Expected: FAIL because the preview schemas and migration do not exist.

- [ ] **Step 3: Add the Pydantic contracts**

Add these models to `app/schemas/bender.py`, using `ConfigDict(extra="forbid")` for stored and Redis-facing records:

```python
class LinkPreviewMetadata(BaseModel):
    model_config = ConfigDict(extra="forbid")

    url: str = Field(..., min_length=1, max_length=2048)
    title: str = Field(..., min_length=1, max_length=180)
    description: str | None = Field(None, max_length=300)
    site_name: str | None = Field(None, max_length=80)
    image_url: str | None = Field(None, max_length=500)


class BenderLinkPreview(LinkPreviewMetadata):
    source_url: str = Field(..., min_length=1, max_length=2048)


class BenderLinkPreviewSnapshot(BenderLinkPreview):
    version: Literal[1] = 1


class BenderLinkPreviewRequest(BaseModel):
    url: str


class BenderLinkPreviewResponse(BaseModel):
    preview_token: str
    preview: BenderLinkPreview
```

Add one `field_validator("image_url")` on `LinkPreviewMetadata` that permits `None` or the exact regex `^/uploads/link-previews/[0-9a-f]{64}\.webp$` and rejects everything else. This validator protects database snapshots, Redis records, endpoint responses, and feed responses from ever carrying a remote image URL. Keep `BenderLinkPreviewRequest.url` unbounded at the Pydantic layer so the endpoint can apply the documented 2,048-character check before URL parsing and return the approved `400`, rather than FastAPI's default `422`.

Add `link_preview: BenderLinkPreview | None = None` to `BenderPostResponse`. Do not add client-supplied metadata fields to `BenderPostCreate`.

- [ ] **Step 4: Add the model column and migration**

Import PostgreSQL `JSONB` and add:

```python
link_preview: Mapped[dict[str, object] | None] = mapped_column(JSONB)
```

Create the migration:

```python
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "bender_link_preview"
down_revision = "westmoreland_pricing"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "bender_posts",
        sa.Column(
            "link_preview",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("bender_posts", "link_preview")
```

- [ ] **Step 5: Serialize nullable snapshots from create and feed paths**

Add a defensive helper in `BenderService`:

```python
@staticmethod
def _preview_block(value: dict[str, object] | None) -> BenderLinkPreview | None:
    if value is None:
        return None
    try:
        snapshot = BenderLinkPreviewSnapshot.model_validate(value)
        return BenderLinkPreview.model_validate(
            snapshot.model_dump(exclude={"version"})
        )
    except PydanticValidationError:
        return None
```

Use it for every `BenderPostResponse` built in `BenderService.feed()` and the create route. Existing rows return `link_preview: null`; invalid legacy JSON fails closed to `null` rather than breaking the feed.

- [ ] **Step 6: Run GREEN verification and commit**

Run:

```bash
.venv/bin/pytest -q tests/test_bender_link_preview_schema.py tests/test_bender_link_preview_migration.py
.venv/bin/alembic heads
```

Expected: tests PASS and `bender_link_preview (head)` is the only Alembic head.

Commit:

```bash
git add app/models/bender.py app/schemas/bender.py app/services/bender_service.py \
  app/api/v1/bender.py alembic/versions/bender_link_preview.py \
  tests/test_bender_link_preview_schema.py tests/test_bender_link_preview_migration.py
git commit -m "feat(bender): add link preview snapshot persistence"
```

---

### Task 2: Establish shared caption URL extraction and public-destination policy

**Files:**
- Create: `test-fixtures/bender-link-url-cases.json`
- Modify: `the-bend-backend/pyproject.toml`
- Modify: `the-bend-backend/uv.lock`
- Create: `the-bend-backend/app/services/bender_link_urls.py`
- Create: `the-bend-backend/tests/test_bender_link_urls.py`

**Interfaces:**
- Produces `extract_http_urls(text: str | None) -> list[str]`.
- Produces `first_http_url(text: str | None) -> str | None`.
- Produces `caption_contains_source_url(caption: str | None, source_url: str) -> bool`.
- Produces `PreparedExternalUrl` and `prepare_external_url(raw_url: str) -> PreparedExternalUrl`.
- Produces `socket_resolver(hostname: str, port: int) -> tuple[str, ...]`.
- Produces `resolve_public_addresses(target, resolver) -> tuple[ipaddress.IPv4Address | ipaddress.IPv6Address, ...]`.

- [ ] **Step 1: Add the cross-stack fixture and failing backend tests**

Create `test-fixtures/bender-link-url-cases.json` with exact expected tokens:

```json
[
  {"caption":"See https://example.org/event.","urls":["https://example.org/event"]},
  {"caption":"Join (https://example.org/a_(b)).","urls":["https://example.org/a_(b)"]},
  {"caption":"First https://a.example/x then https://b.example/y","urls":["https://a.example/x","https://b.example/y"]},
  {"caption":"Query https://example.org/search?q=town#results","urls":["https://example.org/search?q=town#results"]},
  {"caption":"Not ftp://example.org/file","urls":[]},
  {"caption":"Bracket https://example.org/path]","urls":["https://example.org/path"]},
  {"caption":"Curly ‘https://example.org/news’","urls":["https://example.org/news"]}
]
```

Load this fixture from `tests/test_bender_link_urls.py` and assert `extract_http_urls`, `first_http_url`, and exact caption binding. Add parametrized rejection tests for credentials, invalid ports, controls, whitespace, backslashes, localhost, `.localhost`, single-label hosts, private IPv4 and IPv6, metadata addresses, carrier-grade NAT, documentation ranges, zone-scoped IPv6, and the browser-ambiguous forms `2130706433`, `0177.0.0.1`, `0x7f000001`, `127.1`, `１２７。０。０。１`, and `１２７.０.０.１`.

- [ ] **Step 2: Run the tests and confirm RED**

Run:

```bash
cd the-bend-backend
.venv/bin/pytest -q tests/test_bender_link_urls.py
```

Expected: FAIL because `app.services.bender_link_urls` does not exist.

- [ ] **Step 3: Add the direct IDNA dependency and URL interfaces**

Add `idna = ">=3.7,<4"` under `[tool.poetry.dependencies]`, then refresh and install the locked environment:

```bash
uv lock
uv sync --frozen
```

Implement these exact types and functions:

```python
@dataclass(frozen=True)
class PreparedExternalUrl:
    normalized_url: str
    hostname: str
    port: int
    scheme: Literal["http", "https"]


class LinkPreviewURLRejected(ValueError):
    def __init__(self, reason: str, hostname: str | None = None):
        super().__init__(reason)
        self.reason = reason
        self.hostname = hostname


def extract_http_urls(text: str | None) -> list[str]:
    """Return exact HTTP(S) caption tokens after sentence punctuation cleanup."""


def first_http_url(text: str | None) -> str | None:
    urls = extract_http_urls(text)
    return urls[0] if urls else None


def caption_contains_source_url(caption: str | None, source_url: str) -> bool:
    return first_http_url(caption) == source_url


def prepare_external_url(raw_url: str) -> PreparedExternalUrl:
    """Canonicalize one outbound URL without performing DNS or I/O."""
```

`prepare_external_url()` must apply UTS 46 with `idna.encode(host, uts46=True, std3_rules=True)`, lowercase the ASCII hostname, remove a trailing DNS dot and fragment, normalize an empty path to `/`, remove only a scheme-default port, and reject every case named in the test. Literal IP input is valid only when its spelling equals canonical `ipaddress` output and `is_global` is true. DNS names that look numeric after UTS 46 mapping are rejected before resolution.

Implement an injected resolver seam:

```python
Resolver = Callable[[str, int], Awaitable[tuple[str, ...]]]


async def socket_resolver(hostname: str, port: int) -> tuple[str, ...]:
    rows = await asyncio.to_thread(
        socket.getaddrinfo,
        hostname,
        port,
        type=socket.SOCK_STREAM,
    )
    return tuple(dict.fromkeys(row[4][0] for row in rows))


async def resolve_public_addresses(
    target: PreparedExternalUrl,
    resolver: Resolver,
) -> tuple[ipaddress.IPv4Address | ipaddress.IPv6Address, ...]:
    raw_addresses = await resolver(target.hostname, target.port)
    addresses = tuple(ipaddress.ip_address(item) for item in raw_addresses)
    if not addresses or any(not address.is_global for address in addresses):
        raise LinkPreviewURLRejected("destination_not_public", target.hostname)
    return addresses
```

The production resolver later calls `socket.getaddrinfo()` through `asyncio.to_thread()`.

- [ ] **Step 4: Run GREEN verification and commit**

Run:

```bash
.venv/bin/pytest -q tests/test_bender_link_urls.py
```

Expected: PASS for every shared fixture and unsafe-host case.

Commit from the repository root:

```bash
git add test-fixtures/bender-link-url-cases.json the-bend-backend/pyproject.toml \
  the-bend-backend/uv.lock \
  the-bend-backend/app/services/bender_link_urls.py \
  the-bend-backend/tests/test_bender_link_urls.py
git commit -m "feat(bender): validate preview URLs"
```

---

### Task 3: Build the pinned, bounded external fetcher

**Files:**
- Modify: `the-bend-backend/pyproject.toml`
- Modify: `the-bend-backend/uv.lock`
- Create: `the-bend-backend/app/services/link_preview_errors.py`
- Create: `the-bend-backend/app/services/safe_external_fetcher.py`
- Create: `the-bend-backend/tests/test_safe_external_fetcher.py`

**Interfaces:**
- Consumes `PreparedExternalUrl`, `prepare_external_url`, and `resolve_public_addresses` from Task 2.
- Produces `SafeFetchResponse(final_url: str, body: bytes, content_type: str)`.
- Produces `SafeExternalFetcher.validate_destination(raw_url, deadline)`, `fetch_html(raw_url, deadline)`, and `fetch_image(raw_url, deadline)`.

- [ ] **Step 1: Write failing transport and limit tests**

Use fake resolver, session, response, and monotonic clock seams to assert:

```python
@pytest.mark.asyncio
async def test_mixed_public_and_private_dns_answers_are_rejected():
    resolver = _Resolver("93.184.216.34", "127.0.0.1")
    fetcher = SafeExternalFetcher(resolver=resolver)
    with pytest.raises(LinkPreviewURLRejected):
        await fetcher.fetch_html("https://example.org/", deadline=time.monotonic() + 1)


@pytest.mark.asyncio
async def test_redirect_destination_is_resolved_and_validated_again():
    resolver = _ResolverForHosts({"example.org": ("93.184.216.34",), "internal.test": ("10.0.0.2",)})
    session_factory = _SessionFactory.redirecting_to("http://internal.test/private")
    fetcher = SafeExternalFetcher(resolver=resolver, session_factory=session_factory)
    with pytest.raises(LinkPreviewURLRejected):
        await fetcher.fetch_html("https://example.org/", deadline=time.monotonic() + 1)


@pytest.mark.asyncio
async def test_decoded_body_cannot_exceed_html_limit():
    response = _FakeResponse(content_type="text/html", chunks=(b"x" * 524288, b"y"))
    fetcher = _fetcher_for(response)
    with pytest.raises(LinkPreviewResponseTooLarge):
        await fetcher.fetch_html("https://example.org/", deadline=time.monotonic() + 1)
```

Also cover proxy environment variables, peer-address mismatch, DNS answer changes, 301/302/303/307/308, relative locations, redirect loops, a fourth redirect, invalid Content-Length, decoded gzip expansion, non-HTML page types, unsupported image types, and the shared deadline.

- [ ] **Step 2: Run the tests and confirm RED**

Run:

```bash
cd the-bend-backend
.venv/bin/pytest -q tests/test_safe_external_fetcher.py
```

Expected: FAIL because the error and fetcher modules do not exist.

- [ ] **Step 3: Add aiohttp and the typed errors**

Add `aiohttp = ">=3.10,<4"` under `[tool.poetry.dependencies]`.

Define fixed-category exceptions in `link_preview_errors.py`:

```python
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
```

Import and re-export Task 2's exact class from this module; do not subclass or redefine it:

```python
from app.services.bender_link_urls import LinkPreviewURLRejected

__all__ = [
    "LinkPreviewURLRejected",
    "LinkPreviewError",
    "LinkPreviewResponseTooLarge",
    "LinkPreviewTitleMissing",
    "LinkPreviewUpstreamFailure",
    "LinkPreviewDeadlineExceeded",
    "LinkPreviewOutcome",
]
```

After adding `aiohttp = ">=3.10,<4"`, refresh and install the lock:

```bash
uv lock
uv sync --frozen
```

- [ ] **Step 4: Implement pinned aiohttp sessions**

Implement:

```python
@dataclass(frozen=True)
class SafeFetchResponse:
    final_url: str
    body: bytes
    content_type: str


class PinnedResolver(aiohttp.abc.AbstractResolver):
    def __init__(
        self,
        hostname: str,
        addresses: tuple[ipaddress.IPv4Address | ipaddress.IPv6Address, ...],
    ):
        self.hostname = hostname
        self.addresses = addresses

    async def resolve(self, host: str, port: int = 0, family: int = socket.AF_UNSPEC):
        if host != self.hostname:
            raise OSError("unexpected resolver host")
        return [
            {
                "hostname": host,
                "host": str(address),
                "port": port,
                "family": socket.AF_INET6 if address.version == 6 else socket.AF_INET,
                "proto": 0,
                "flags": socket.AI_NUMERICHOST,
            }
            for address in self.addresses
        ]

    async def close(self) -> None:
        return None
```

For each hop, create a fresh `aiohttp.TCPConnector` with the pinned resolver, `use_dns_cache=False`, and `limit=1`, then a fresh `ClientSession(trust_env=False, auto_decompress=True, cookie_jar=DummyCookieJar())`. Pass `proxy=None`, `allow_redirects=False`, fixed `User-Agent` and `Accept`, and no forwarded request headers. Verify `response.connection.transport.get_extra_info("peername")[0]` belongs to the validated address set before reading bytes.

Expose:

```python
class SafeExternalFetcher:
    def __init__(self, resolver: Resolver = socket_resolver, clock: Callable[[], float] = time.monotonic, session_factory: SessionFactory = aiohttp_session_factory):
        self.resolver = resolver
        self.clock = clock
        self.session_factory = session_factory

    async def fetch_html(self, raw_url: str, *, deadline: float) -> SafeFetchResponse:
        return await self._fetch(raw_url, deadline=deadline, kind="html")

    async def fetch_image(self, raw_url: str, *, deadline: float) -> SafeFetchResponse:
        return await self._fetch(raw_url, deadline=deadline, kind="image")

    async def validate_destination(self, raw_url: str, *, deadline: float) -> PreparedExternalUrl:
        async with asyncio.timeout_at(deadline):
            target = prepare_external_url(raw_url)
            await resolve_public_addresses(target, self.resolver)
            return target
```

Define the injected session-factory contract:

```python
class SingleRequestSession(Protocol):
    def get(
        self,
        url: str,
        *,
        headers: Mapping[str, str],
        allow_redirects: bool,
        proxy: str | None,
    ) -> AsyncContextManager[ClientResponseLike]: ...


SessionFactory = Callable[
    [
        PreparedExternalUrl,
        tuple[ipaddress.IPv4Address | ipaddress.IPv6Address, ...],
    ],
    AsyncContextManager[SingleRequestSession],
]
```

`ClientResponseLike` is a local Protocol exposing status, headers, connection peer information, and decoded async chunks. The production `aiohttp_session_factory` creates the connector and session described above; tests provide a fake factory without opening sockets. Treat missing peer information as a failed pin check.

`_fetch` uses one `asyncio.timeout_at(deadline)`, follows at most three redirects manually, resolves relative `Location` with `urljoin`, calls `prepare_external_url` and `resolve_public_addresses` on every hop, and streams decoded chunks while checking 512 KiB for HTML or 3 MiB for images. Map `asyncio.TimeoutError` to `LinkPreviewDeadlineExceeded` and aiohttp connection/protocol failures to `LinkPreviewUpstreamFailure` without exposing the URL.

- [ ] **Step 5: Run GREEN verification and commit**

Run:

```bash
.venv/bin/pytest -q tests/test_safe_external_fetcher.py tests/test_bender_link_urls.py
```

Expected: PASS, including proxy isolation, peer pinning, decoded limits, and redirects.

Commit:

```bash
git add pyproject.toml uv.lock app/services/link_preview_errors.py \
  app/services/safe_external_fetcher.py tests/test_safe_external_fetcher.py
git commit -m "feat(bender): pin and bound preview fetches"
```

---
### Task 4: Parse and sanitize preview metadata without network access

**Files:**
- Create: `the-bend-backend/app/services/link_preview_metadata.py`
- Create: `the-bend-backend/tests/test_link_preview_metadata.py`

**Interfaces:**
- Produces `ParsedLinkPreview(title, description, site_name, destination_candidate, image_candidates)`.
- Produces `LinkPreviewMetadataParser.parse(html_bytes: bytes, final_url: str) -> ParsedLinkPreview`.
- This task performs no DNS resolution, HTTP requests, file writes, or Redis calls.

- [ ] **Step 1: Write failing table-driven parser tests**

Cover Open Graph, Twitter, and HTML fallback precedence; relative URLs; entity decoding; markup removal; exact truncation; JSON-LD `image` and `logo`; hero, banner, brand, main-content, and icon fallbacks; hidden and tiny-image rejection; duplicate candidates; and the four-candidate ceiling.

Use an assertion shaped like:

```python
def test_metadata_precedence_and_plain_text_sanitization():
    parsed = LinkPreviewMetadataParser().parse(
        b"""
        <html><head>
          <meta property="og:title" content="  Town &amp; River  ">
          <meta name="twitter:title" content="Ignored Twitter Title">
          <meta property="og:description" content="Meet <b>neighbors</b> today">
          <meta property="og:image" content="/images/event.jpg">
          <title>Ignored Document Title</title>
        </head></html>
        """,
        final_url="https://example.org/events/1",
    )
    assert parsed.title == "Town & River"
    assert parsed.description == "Meet neighbors today"
    assert parsed.site_name == "example.org"
    assert parsed.image_candidates == ("https://example.org/images/event.jpg",)
```

Add a test proving an HTML document with no usable title returns `title=None`, which the generator will convert to `LinkPreviewTitleMissing`.

- [ ] **Step 2: Run the tests and confirm RED**

Run:

```bash
cd the-bend-backend
.venv/bin/pytest -q tests/test_link_preview_metadata.py
```

Expected: FAIL because the parser module does not exist.

- [ ] **Step 3: Implement the pure parser**

Define:

```python
@dataclass(frozen=True)
class ParsedLinkPreview:
    title: str | None
    description: str | None
    site_name: str | None
    destination_candidate: str | None
    image_candidates: tuple[str, ...]


class LinkPreviewMetadataParser:
    def parse(self, html_bytes: bytes, *, final_url: str) -> ParsedLinkPreview:
        soup = BeautifulSoup(html_bytes, "lxml")
        title = _first_text(
            _meta(soup, property_name="og:title"),
            _meta(soup, name="twitter:title"),
            soup.title.string if soup.title else None,
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
        destination = _absolute_url(
            _meta(soup, property_name="og:url"),
            final_url,
        )
        candidates = _rank_image_candidates(soup, final_url)[:4]
        return ParsedLinkPreview(
            title=title,
            description=description,
            site_name=site_name,
            destination_candidate=destination,
            image_candidates=tuple(candidates),
        )
```

Implement the named private helpers in the same file. `_first_text` must HTML entity-decode, parse any embedded markup as text, collapse Unicode whitespace, trim, and slice to the supplied character limit. `_rank_image_candidates` examines at most 32 `<img>` elements and returns unique absolute HTTP or HTTPS strings in the approved order: secure Open Graph, Open Graph, Twitter, `image_src`, structured-data image or logo, qualified hero/banner/logo images, main-content images, then icons. It skips data URLs, SVG, hidden elements, 1-by-1 and tracking dimensions, and empty values.

- [ ] **Step 4: Run GREEN verification and commit**

Run:

```bash
.venv/bin/pytest -q tests/test_link_preview_metadata.py
```

Expected: PASS.

Commit:

```bash
git add app/services/link_preview_metadata.py tests/test_link_preview_metadata.py
git commit -m "feat(bender): parse preview metadata"
```

---

### Task 5: Validate and store deterministic Bend-managed preview images

**Files:**
- Create: `the-bend-backend/app/services/link_preview_image_store.py`
- Modify: `the-bend-backend/app/main.py`
- Modify: `the-bend-backend/Dockerfile`
- Create: `the-bend-backend/tests/test_link_preview_image_store.py`

**Interfaces:**
- Produces `LinkPreviewImageStore.store(image_bytes: bytes) -> str`.
- Produces `LinkPreviewImageStore.touch(public_url: str) -> bool` for safe cache-hit retention; `False` means the cache points to a missing file and the caller must regenerate.
- Produces `link_preview_directory_lock(upload_dir, shared)` for cross-process image-store and cleanup coordination.
- Returns only `/uploads/link-previews/{64 lowercase hex}.webp` paths.

- [ ] **Step 1: Write failing image tests**

Generate in-memory JPEG, PNG, WebP, animated WebP, EXIF-oriented JPEG, malformed bytes, and a highly compressed image over 20 megapixels. Assert format sniffing, first-frame behavior, orientation, no upscaling, 1,200-by-630 bounds, metadata removal, deterministic digest, atomic replacement, temporary-file cleanup, strict public-path validation, a `False` result for a missing cache file, and shared/exclusive cleanup-lock coordination.

Core success assertion:

```python
def test_store_reencodes_to_content_addressed_webp(tmp_path):
    store = LinkPreviewImageStore(upload_dir=tmp_path)
    first_url = store.store(_jpeg_bytes(size=(1600, 900), exif_orientation=6))
    second_url = store.store(_jpeg_bytes(size=(1600, 900), exif_orientation=6))
    assert first_url == second_url
    assert re.fullmatch(r"/uploads/link-previews/[0-9a-f]{64}\.webp", first_url)
    saved = tmp_path / first_url.removeprefix("/uploads/")
    with Image.open(saved) as image:
        assert image.format == "WEBP"
        assert image.width <= 1200
        assert image.height <= 630
        assert image.n_frames == 1
        assert "exif" not in image.info
```

- [ ] **Step 2: Run the tests and confirm RED**

Run:

```bash
cd the-bend-backend
.venv/bin/pytest -q tests/test_link_preview_image_store.py
```

Expected: FAIL because the image store does not exist.

- [ ] **Step 3: Implement validation and atomic storage**

Implement:

```python
class LinkPreviewImageStore:
    def __init__(self, upload_dir: Path = UPLOAD_DIR):
        self.image_dir = Path(upload_dir) / "link-previews"

    def store(self, image_bytes: bytes) -> str:
        encoded = self._encode(image_bytes)
        digest = hashlib.sha256(encoded).hexdigest()
        final_path = self.image_dir / f"{digest}.webp"
        self.image_dir.mkdir(parents=True, exist_ok=True)
        with link_preview_directory_lock(self.image_dir, shared=True):
            if final_path.is_file():
                final_path.touch()
                return f"/uploads/link-previews/{final_path.name}"
            temporary = self.image_dir / f".{digest}.{secrets.token_hex(8)}.tmp"
            try:
                temporary.write_bytes(encoded)
                os.replace(temporary, final_path)
            finally:
                temporary.unlink(missing_ok=True)
        return f"/uploads/link-previews/{final_path.name}"
```

`_encode` accepts decoded JPEG, PNG, or WebP only; catches decompression warnings and errors; rejects dimensions over 20 megapixels before `load()`; selects frame zero; applies `ImageOps.exif_transpose`; uses `thumbnail((1200, 630), Image.Resampling.LANCZOS)` without upscaling; converts to RGB or RGBA; and saves a fresh non-animated WebP with fixed `quality=82`, `method=6`, and no copied metadata.

Implement `link_preview_directory_lock()` with a stable `uploads/link-previews/.cleanup.lock` file and `fcntl.flock`. `store` and `touch` acquire its shared form before inspecting or mutating an image; the cleanup task in Task 10 acquires the exclusive form before its final file scan and deletion pass. `touch` accepts only the exact Bend preview-path regex, compares the locked path's inode to the opened file descriptor before updating mtime, never follows a caller-provided filesystem path, and returns `False` if the file disappeared. This closes the cache-hit versus cleanup race without holding a database transaction across filesystem work.

Add `uploads/link-previews` creation beside the existing upload directories in `app/main.py` and the backend `Dockerfile`.

- [ ] **Step 4: Run GREEN verification and commit**

Run:

```bash
.venv/bin/pytest -q tests/test_link_preview_image_store.py
```

Expected: PASS and no temporary files remain in the test directory.

Commit:

```bash
git add app/services/link_preview_image_store.py app/main.py Dockerfile \
  tests/test_link_preview_image_store.py
git commit -m "feat(bender): cache preview images"
```

---

### Task 6: Coordinate page metadata, canonical URL, and image fallback

**Files:**
- Create: `the-bend-backend/app/services/link_preview_generator.py`
- Create: `the-bend-backend/tests/test_link_preview_generator.py`

**Interfaces:**
- Consumes Tasks 1 through 5.
- Produces `GeneratedLinkPreview(metadata, normalized_request_url, final_url)`.
- Produces `BenderLinkPreviewGenerator.normalize_request_url(source_url)` and `generate(source_url)`.

- [ ] **Step 1: Write failing generator tests**

Use fake fetcher, parser, image store, and clock. Cover safe and unsafe `og:url`, relative metadata, no title, first successful image, four-candidate ceiling, image timeout, oversized and malformed images, text-only fallback, local image URL only, and one 4.5-second deadline passed to every dependency.

```python
@pytest.mark.asyncio
async def test_image_failures_return_text_only_preview():
    fetcher = _FakeFetcher(
        page=_html_response("https://example.org/event"),
        image_error=LinkPreviewUpstreamFailure("image_failed", "cdn.example.org"),
    )
    generator = _generator(fetcher=fetcher, image_candidates=("https://cdn.example.org/a.jpg",))
    generated = await generator.generate("https://example.org/event")
    assert generated.metadata.title == "Community Event"
    assert generated.metadata.image_url is None
    assert fetcher.deadlines and len(set(fetcher.deadlines)) == 1
```

- [ ] **Step 2: Run the tests and confirm RED**

Run:

```bash
cd the-bend-backend
.venv/bin/pytest -q tests/test_link_preview_generator.py
```

Expected: FAIL because the generator module does not exist.

- [ ] **Step 3: Implement the generator**

Define:

```python
@dataclass(frozen=True)
class GeneratedLinkPreview:
    metadata: LinkPreviewMetadata
    normalized_request_url: str
    final_url: str
    outcomes: frozenset[LinkPreviewOutcome] = frozenset()


class BenderLinkPreviewGenerator:
    def __init__(
        self,
        fetcher: SafeExternalFetcher,
        parser: LinkPreviewMetadataParser,
        image_store: LinkPreviewImageStore,
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

    async def touch_cached_image(self, image_url: str | None) -> bool:
        if not image_url:
            return True
        return await asyncio.to_thread(self.image_store.touch, image_url)
```

`generate()` creates `deadline = self.clock() + self.deadline_seconds`, fetches HTML, parses it through `asyncio.to_thread` inside `asyncio.timeout_at(deadline)`, and raises `LinkPreviewTitleMissing("title_missing", hostname)` when no title exists. It validates but does not fetch `destination_candidate`; an unsafe candidate falls back to the fetched final URL. It attempts at most four image candidates through `fetch_image`, calls `image_store.store` through `asyncio.to_thread` inside the same absolute deadline, stops on the first stored image, and treats every image-only error or image-stage deadline as text-only when title metadata is ready. A page fetch or metadata-parse deadline remains a `LinkPreviewDeadlineExceeded`.

`outcomes` is request-level and deduplicated by category. Every failed image attempt contributes `image_processing_failure`; also add `blocked_destination` for an unsafe image URL, `timeout` for an image-stage deadline, `oversized_response` for an oversized image body, or `invalid_content` for an upstream/image-decode failure. The returned `LinkPreviewMetadata` contains no `source_url` and no remote `image_url`.

- [ ] **Step 4: Run GREEN verification and commit**

Run:

```bash
.venv/bin/pytest -q tests/test_link_preview_generator.py \
  tests/test_link_preview_metadata.py tests/test_link_preview_image_store.py \
  tests/test_safe_external_fetcher.py
```

Expected: PASS.

Commit:

```bash
git add app/services/link_preview_generator.py tests/test_link_preview_generator.py
git commit -m "feat(bender): generate safe link previews"
```

---

### Task 7: Add Redis metadata caching and bound draft tokens

**Files:**
- Modify: `the-bend-backend/app/schemas/bender.py`
- Create: `the-bend-backend/app/services/bender_link_preview_store.py`
- Create: `the-bend-backend/tests/test_bender_link_preview_store.py`

**Interfaces:**
- Produces `LinkPreviewCacheRecord` and `LinkPreviewDraftRecord`.
- Produces `BenderLinkPreviewStore.get_cached_metadata`, `cache_metadata`, `issue_draft`, `resolve_draft`, `record_outcome`, and `live_image_urls`.
- Redis connection failures escape from this store. The endpoint maps them to 503; post creation catches them and continues without a preview.

- [ ] **Step 1: Write failing fake-Redis tests**

Use `_FakeRedis` and `_FailingRedis` classes. Assert 1,200-second TTLs, hashed keys, cache aliases, request-independent cache values, new random token per draft, SHA-256 token keys, user and nullable tenant binding, first-URL caption binding, expiry, overlong token rejection, corrupt JSON rejection, unknown-field rejection, image reference enumeration, and bounded daily outcome keys.

```python
@pytest.mark.asyncio
async def test_cache_never_reuses_another_requests_source_url():
    redis = _FakeRedis()
    store = BenderLinkPreviewStore(redis)
    metadata = LinkPreviewMetadata(url="https://example.org/final", title="Title")
    await store.cache_metadata("https://example.org/start", metadata, final_url=metadata.url)
    raw_values = tuple(redis.values())
    assert raw_values
    assert all("source_url" not in value for value in raw_values)
```

- [ ] **Step 2: Run the tests and confirm RED**

Run:

```bash
cd the-bend-backend
.venv/bin/pytest -q tests/test_bender_link_preview_store.py
```

Expected: FAIL because the Redis store does not exist.

- [ ] **Step 3: Add the draft model and store**

Add:

```python
class LinkPreviewCacheRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: Literal[1] = 1
    metadata: LinkPreviewMetadata


class LinkPreviewDraftRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")

    user_id: UUID
    tenant_id: UUID | None
    source_url: str = Field(..., max_length=2048)
    created_at: datetime
    preview: BenderLinkPreviewSnapshot
```

Implement:

```python
class BenderLinkPreviewStore:
    CACHE_PREFIX = "bender:link-preview:cache:"
    DRAFT_PREFIX = "bender:link-preview:draft:"

    def __init__(self, redis: Redis, *, ttl_seconds: int = 1200):
        self.redis = redis
        self.ttl_seconds = ttl_seconds

    async def get_cached_metadata(self, normalized_request_url: str) -> LinkPreviewMetadata | None:
        key = self.CACHE_PREFIX + _sha256(normalized_request_url)
        return await self._validated_metadata(key)

    async def issue_draft(
        self,
        snapshot: BenderLinkPreviewSnapshot,
        *,
        user_id: UUID,
        tenant_id: UUID | None,
    ) -> str:
        token = secrets.token_urlsafe(32)
        key = self.DRAFT_PREFIX + _sha256(token)
        record = LinkPreviewDraftRecord(
            user_id=user_id,
            tenant_id=tenant_id,
            source_url=snapshot.source_url,
            created_at=datetime.now(UTC),
            preview=snapshot,
        )
        await self.redis.setex(key, self.ttl_seconds, record.model_dump_json())
        return token
```

`cache_metadata` wraps sanitized metadata in `LinkPreviewCacheRecord` and writes it under hashes of both normalized request and final URLs, never `source_url`. `resolve_draft` immediately returns `None` for tokens over 128 characters, hashes the token, validates the record, requires exact user and tenant equality, and requires `first_http_url(caption) == record.source_url`. It returns the versioned snapshot or `None`. `live_image_urls` uses `scan_iter` over both prefixes, validates bounded JSON, and returns only local preview image paths.

`record_outcome(outcome: LinkPreviewOutcome)` increments only an allow-listed key shaped as `bender:link-preview:metric:{YYYYMMDD}:{outcome}` and sets an eight-day expiry. No hostname, URL, query, token, or user identifier appears in metric keys or values.

- [ ] **Step 4: Run GREEN verification and commit**

Run:

```bash
.venv/bin/pytest -q tests/test_bender_link_preview_store.py tests/test_bender_link_urls.py
```

Expected: PASS.

Commit:

```bash
git add app/schemas/bender.py app/services/bender_link_preview_store.py \
  tests/test_bender_link_preview_store.py
git commit -m "feat(bender): cache preview drafts"
```

---

### Task 8: Expose the authenticated preview endpoint

**Files:**
- Create: `the-bend-backend/app/services/bender_link_preview_service.py`
- Modify: `the-bend-backend/app/core/rate_limit.py`
- Modify: `the-bend-backend/app/api/v1/bender.py`
- Create: `the-bend-backend/tests/test_bender_link_preview_service.py`
- Create: `the-bend-backend/tests/test_bender_link_preview_api.py`
- Create: `the-bend-backend/tests/test_bender_link_preview_rate_limit.py`

**Interfaces:**
- Consumes generator and Redis store from Tasks 6 and 7.
- Produces `BenderLinkPreviewService.create_preview(source_url, user_id, tenant_id)`.
- Produces `POST /api/v1/bender/link-preview` returning `BenderLinkPreviewResponse`.

- [ ] **Step 1: Write failing coordinator and route tests**

Use a fake generator and store to cover cache miss, cache hit, stale cache image regeneration, a fresh draft on every cache hit, exact current `source_url` injection, bounded outcome recording, authentication, successful response shape, rate limiting, and fixed error mappings: 400 URL rejection, 413 size, 422 missing title, 429 rate limit, 502 upstream, 503 Redis, and 504 deadline. Prove an empty or 2,049-character request returns 400 before the URL parser or generator is called.

In `test_bender_link_preview_rate_limit.py`, freeze the clock and prove 11 requests receive unique sorted-set members even at the same timestamp, the Redis transaction admits only the first 10 for one authenticated user, different users have independent keys, and a Redis failure becomes the approved generic 503 rather than an unhandled 500.

Build the route test app using the existing `test_sponsor_logo_upload.py` pattern: include the Bender router, register the `AppException` handler, override `get_db`, `get_current_user`, and the new `get_link_preview_service` dependency, and never contact a live database, Redis, or website.

- [ ] **Step 2: Run the tests and confirm RED**

Run:

```bash
cd the-bend-backend
.venv/bin/pytest -q tests/test_bender_link_preview_service.py \
  tests/test_bender_link_preview_api.py tests/test_bender_link_preview_rate_limit.py
```

Expected: FAIL because the coordinator and route do not exist.

- [ ] **Step 3: Implement the coordinator**

Define:

```python
class BenderLinkPreviewService:
    def __init__(
        self,
        store: BenderLinkPreviewStore,
        generator: BenderLinkPreviewGenerator,
    ):
        self.store = store
        self.generator = generator

    async def create_preview(
        self,
        source_url: str,
        *,
        user_id: UUID,
        tenant_id: UUID | None,
    ) -> BenderLinkPreviewResponse:
        exact_source = source_url.strip()
        if not exact_source or len(exact_source) > 2048:
            raise LinkPreviewURLRejected("invalid_length")
        normalized = self.generator.normalize_request_url(exact_source)
        metadata = await self.store.get_cached_metadata(normalized)
        if metadata is not None and not await self.generator.touch_cached_image(
            metadata.image_url
        ):
            metadata = None
        if metadata is None:
            generated = await self.generator.generate(exact_source)
            metadata = generated.metadata
            await self.store.cache_metadata(
                generated.normalized_request_url,
                metadata,
                final_url=generated.final_url,
            )
        snapshot = BenderLinkPreviewSnapshot(
            source_url=exact_source,
            **metadata.model_dump(),
        )
        token = await self.store.issue_draft(
            snapshot,
            user_id=user_id,
            tenant_id=tenant_id,
        )
        return BenderLinkPreviewResponse(
            preview_token=token,
            preview=BenderLinkPreview.model_validate(
                snapshot.model_dump(exclude={"version"})
            ),
        )
```

When cached metadata survives the image touch check, record `cache_hit` before issuing the fresh draft. A missing cached image makes the cache entry stale and regenerates the page rather than issuing a draft with a broken image. On a generated result, record each bounded `generated.outcomes` value. Record `success` after a draft is issued. The counters are event counters, so a successful cache hit increments both `cache_hit` and `success`.

Catch typed generator failures only long enough to record this exact bounded mapping, then re-raise for the route mapping:

- `LinkPreviewURLRejected` -> `blocked_destination`
- `LinkPreviewResponseTooLarge` -> `oversized_response`
- `LinkPreviewDeadlineExceeded` -> `timeout`
- `LinkPreviewTitleMissing` and `LinkPreviewUpstreamFailure` -> `invalid_content`
- failed image candidates with usable text -> `image_processing_failure` in `GeneratedLinkPreview.outcomes`

- [ ] **Step 4: Add dependency factories and the route**

First harden the existing shared Redis transaction in `app/core/rate_limit.py`: replace `str(now)` with a collision-proof member such as `f"{now:.9f}:{secrets.token_hex(16)}"`. Keep the current transactional pipeline so prune, add, count, and expiry execute atomically.

Add to `app/api/v1/bender.py`:

```python
async def enforce_link_preview_rate_limit(
    request: Request,
    current_user: User = Depends(get_current_user),
) -> None:
    try:
        await check_rate_limit(
            request,
            str(current_user.id),
            max_requests=10,
            window_seconds=60,
        )
    except RedisError as exc:
        raise AppException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "LINK_PREVIEW_UNAVAILABLE",
            "Link preview is temporarily unavailable",
        ) from exc


async def get_link_preview_store(
    redis: Redis = Depends(get_redis),
) -> BenderLinkPreviewStore:
    return BenderLinkPreviewStore(redis)


def get_link_preview_generator() -> BenderLinkPreviewGenerator:
    return BenderLinkPreviewGenerator(
        fetcher=SafeExternalFetcher(),
        parser=LinkPreviewMetadataParser(),
        image_store=LinkPreviewImageStore(),
    )


def get_link_preview_service(
    store: BenderLinkPreviewStore = Depends(get_link_preview_store),
    generator: BenderLinkPreviewGenerator = Depends(get_link_preview_generator),
) -> BenderLinkPreviewService:
    return BenderLinkPreviewService(store, generator)
```

Add the authenticated route with `dependencies=[Depends(enforce_link_preview_rate_limit)]`. Because the dependency itself requires `get_current_user`, unauthenticated callers receive 401 before rate-limit storage is touched, and FastAPI reuses the same resolved user in the route. Catch only typed preview exceptions and Redis connection errors, then raise `AppException` instances with the approved fixed status and generic message. Log the normalized hostname and fixed error class only. Do not interpolate exception text, full URL, query, resolved address, or token. The existing router registration requires no change.

- [ ] **Step 5: Run GREEN verification and commit**

Run:

```bash
.venv/bin/pytest -q tests/test_bender_link_preview_service.py \
  tests/test_bender_link_preview_api.py tests/test_bender_link_preview_store.py \
  tests/test_bender_link_preview_rate_limit.py tests/test_link_preview_generator.py
```

Expected: PASS.

Commit:

```bash
git add app/services/bender_link_preview_service.py app/core/rate_limit.py \
  app/api/v1/bender.py tests/test_bender_link_preview_service.py \
  tests/test_bender_link_preview_api.py tests/test_bender_link_preview_rate_limit.py
git commit -m "feat(bender): add link preview endpoint"
```

---

### Task 9: Resolve draft tokens and persist immutable post snapshots

**Files:**
- Modify: `the-bend-backend/app/schemas/bender.py`
- Modify: `the-bend-backend/app/services/bender_service.py`
- Modify: `the-bend-backend/app/api/v1/bender.py`
- Create: `the-bend-backend/tests/test_bender_post_link_preview.py`

**Interfaces:**
- Adds `BenderPostCreate.preview_token: str | None = None` as an untrusted handoff value.
- Changes `BenderService.__init__(db, link_preview_store=None)`.
- Keeps the public `BenderService.create_post(data, current_user)` call shape unchanged.
- Adds a create-only FastAPI dependency so anonymous feed reads never depend on Redis.

- [ ] **Step 1: Write failing post-creation tests**

Use a recording fake database plus fake store. Cover valid, absent, expired, over-128-character, cross-user, cross-tenant, changed-first-URL, corrupt, and Redis-failing tokens. Assert media fields, caption trimming, counters, and existing author and tenant behavior are unchanged.

```python
@pytest.mark.asyncio
async def test_valid_bound_token_persists_versioned_snapshot():
    snapshot = BenderLinkPreviewSnapshot(
        source_url="https://example.org/event",
        url="https://example.org/event",
        title="Community Event",
    )
    store = _PreviewStore(snapshot=snapshot)
    db = _RecordingDB()
    service = BenderService(db, link_preview_store=store)
    user = _user()
    post = await service.create_post(
        BenderPostCreate(
            caption="  Join https://example.org/event  ",
            preview_token="draft-token",
        ),
        user,
    )
    assert post.caption == "Join https://example.org/event"
    assert post.link_preview == snapshot.model_dump(mode="json")
    assert store.calls[0]["user_id"] == user.id
    assert store.calls[0]["tenant_id"] == user.tenant_id
```

Add response tests proving feed and create return a public `link_preview` without exposing `version`, and legacy `NULL` rows return JSON `null`.

- [ ] **Step 2: Run the tests and confirm RED**

Run:

```bash
cd the-bend-backend
.venv/bin/pytest -q tests/test_bender_post_link_preview.py
```

Expected: FAIL because post creation neither accepts nor resolves the token.

- [ ] **Step 3: Add the token field and create-only service dependency**

Add the token without a Pydantic maximum so an abusive overlong value is ignored rather than rejecting a legitimate caption or media post:

```python
class BenderPostCreate(BaseModel):
    preview_token: str | None = None
```

Change the service constructor:

```python
def __init__(
    self,
    db: AsyncSession,
    link_preview_store: BenderLinkPreviewStore | None = None,
):
    self.db = db
    self.link_preview_store = link_preview_store
```

In `create_post`, trim the caption once. When a token is present and no longer than 128 characters, call `resolve_draft` with the authenticated user's ID, tenant ID, and normalized caption. Catch `redis.exceptions.RedisError` and use no snapshot. Persist only `snapshot.model_dump(mode="json")`, never client metadata.

Add:

```python
def get_create_post_service(
    db: AsyncSession = Depends(get_db),
    store: BenderLinkPreviewStore = Depends(get_link_preview_store),
) -> BenderService:
    return BenderService(db, link_preview_store=store)
```

Use this dependency only on `POST /bender/posts`. Keep the existing `get_service()` dependency for public feed, likes, comments, deletion, and all reads.

- [ ] **Step 4: Add snapshot serialization to every post response**

Pass `BenderService._preview_block(post.link_preview)` into the create response and the existing feed response builder. The response Pydantic model omits the storage-only `version` field and rejects invalid stored data to `null`.

- [ ] **Step 5: Run GREEN verification and commit**

Run:

```bash
.venv/bin/pytest -q tests/test_bender_post_link_preview.py \
  tests/test_bender_link_preview_store.py tests/test_bender_link_preview_schema.py
.venv/bin/pytest -q
```

Expected: focused and full backend suites PASS.

Commit:

```bash
git add app/schemas/bender.py app/services/bender_service.py app/api/v1/bender.py \
  tests/test_bender_post_link_preview.py
git commit -m "feat(bender): persist verified previews on posts"
```

---

### Task 10: Clean old unreferenced preview images conservatively

**Files:**
- Create: `the-bend-backend/app/services/link_preview_cleanup.py`
- Modify: `the-bend-backend/app/workers/scheduled_tasks.py`
- Modify: `the-bend-backend/app/workers/celery_app.py`
- Create: `the-bend-backend/tests/test_link_preview_cleanup.py`

**Interfaces:**
- Produces `LinkPreviewCleanupStats` with bounded counts.
- Produces `cleanup_link_preview_image_files(db, redis, upload_dir, now)`.
- Produces Celery task `app.workers.scheduled_tasks.cleanup_link_preview_images` at 04:00 UTC daily.

- [ ] **Step 1: Write failing cleanup and schedule tests**

Create files under a temporary `uploads/link-previews` directory and test recent, database-referenced, cache-referenced, draft-referenced, unreferenced, malformed-name, symlink, missing-file, Redis-outage, repeated-run, and image-touch-versus-cleanup coordination cases.

```python
@pytest.mark.asyncio
async def test_cleanup_deletes_only_old_unreferenced_digest_files(tmp_path):
    old_unreferenced = _preview_file(tmp_path, "a" * 64, age_days=31)
    old_database_reference = _preview_file(tmp_path, "b" * 64, age_days=31)
    recent = _preview_file(tmp_path, "c" * 64, age_days=2)
    db = _DBWithPreviewUrls({_public_url(old_database_reference)})
    redis = _RedisWithPreviewUrls(set())
    stats = await cleanup_link_preview_image_files(
        db,
        redis,
        upload_dir=tmp_path,
        now=datetime(2026, 8, 20, tzinfo=UTC),
    )
    assert not old_unreferenced.exists()
    assert old_database_reference.exists()
    assert recent.exists()
    assert stats.deleted == 1
```

Assert the beat schedule points to the exact registered task name and force Celery to import its configured modules before asserting the task exists in `celery_app.tasks`. Assert a Redis error produces `deleted == 0` because the task cannot prove that drafts are unreferenced. Add a deterministic lock test proving cleanup waits for a shared store/touch lock, then rechecks mtime and preserves the newly touched file.

- [ ] **Step 2: Run the tests and confirm RED**

Run:

```bash
cd the-bend-backend
.venv/bin/pytest -q tests/test_link_preview_cleanup.py
```

Expected: FAIL because the cleanup service and task do not exist.

- [ ] **Step 3: Implement the conservative cleanup service**

Define:

```python
@dataclass(frozen=True)
class LinkPreviewCleanupStats:
    scanned: int = 0
    deleted: int = 0
    recent: int = 0
    database_referenced: int = 0
    redis_referenced: int = 0
    skipped: int = 0


async def cleanup_link_preview_image_files(
    db: AsyncSession,
    redis: Redis,
    *,
    upload_dir: Path = UPLOAD_DIR,
    now: datetime | None = None,
) -> LinkPreviewCleanupStats:
    """Delete only proven-unreferenced digest WebPs older than 30 days."""
```

Query non-null `BenderPost.link_preview` values and collect exact local `image_url` strings after Pydantic validation. Collect live Redis references through `BenderLinkPreviewStore.live_image_urls()`. If either reference lookup fails, return without deleting.

Run the final filesystem phase through `asyncio.to_thread`. Inside that thread, acquire `link_preview_directory_lock(image_dir, shared=False)`, then inspect only non-symlink regular files matching `[0-9a-f]{64}\.webp` directly under `uploads/link-previews`. Re-read each candidate's mtime while holding the exclusive lock, skip files newer than 30 days, and use `unlink(missing_ok=True)` only when absent from both reference sets. New stores and cache-hit touches take the shared lock: a touch completed first makes the file recent, while a touch that arrives after cleanup sees a missing file and forces regeneration in Task 8. A post created from an already-issued draft is safe because every 20-minute draft points to a file touched less than 20 minutes ago, far inside the 30-day grace period. Log counts only.

- [ ] **Step 4: Register the worker task and schedule**

Add a synchronous Celery wrapper that opens `async_session`, obtains the shared Redis client, and calls the async cleanup with `asyncio.run()`, matching the existing scheduled-task pattern. Ensure the worker imports the module by adding `imports=("app.workers.scheduled_tasks",)` to `celery_app.conf.update`; the current autodiscovery does not target this nonstandard filename. Add this beat entry:

```python
"cleanup-link-preview-images": {
    "task": "app.workers.scheduled_tasks.cleanup_link_preview_images",
    "schedule": crontab(hour=4, minute=0),
},
```

The production `celery-worker` already mounts `./data/uploads:/app/uploads` and performs deletion. Celery Beat only publishes the task, so it does not need the upload volume.

- [ ] **Step 5: Run GREEN verification and commit**

Run:

```bash
.venv/bin/pytest -q tests/test_link_preview_cleanup.py
.venv/bin/pytest -q
```

Expected: focused and full backend suites PASS.

Commit:

```bash
git add app/services/link_preview_cleanup.py app/workers/scheduled_tasks.py \
  app/workers/celery_app.py tests/test_link_preview_cleanup.py
git commit -m "feat(bender): clean unused preview images"
```

---

### Task 11: Render safe preview cards and linkified captions in the feed

**Files:**
- Modify: `the-bend-frontend/src/types/index.ts`
- Create: `the-bend-frontend/src/lib/benderLinks.ts`
- Create: `the-bend-frontend/src/components/features/bender/BenderCaption.tsx`
- Create: `the-bend-frontend/src/components/features/bender/BenderLinkPreviewCard.tsx`
- Modify: `the-bend-frontend/src/pages/BenderPage.tsx`
- Create: `the-bend-frontend/e2e/bender-link-previews.spec.ts`

**Interfaces:**
- Produces `BenderLinkPreview` and nullable `BenderPost.link_preview`.
- Produces `extractHttpUrls`, `extractFirstHttpUrl`, `removeFirstExactUrl`, `tokenizeBenderCaption`, `isSafeHttpUrl`, and `isBendLinkPreviewImageUrl`.
- Produces `BenderCaption` and `BenderLinkPreviewCard`.
- Consumes `test-fixtures/bender-link-url-cases.json` in Playwright to keep browser extraction aligned with Task 2.

- [ ] **Step 1: Write the failing feed Playwright scenarios**

Create one route helper that authenticates a member, handles exact method and pathname pairs for `GET /tenant/current` and `GET /bender/posts`, and returns empty responses for unrelated calls. Do not use broad substring matching.

Add these named tests:

1. `published preview hides only its source URL and linkifies the remaining URL`
2. `legacy post linkifies every HTTP URL and renders no preview card`
3. `text-only preview renders without an image`
4. `preview image resolves through the API host`
5. `preview card contains long metadata at desktop and mobile widths`
6. `browser URL extraction matches the shared caption fixture`

Use a post caption containing surrounding text, the previewed URL, a line break, and a second URL. Assert the first URL text is absent only when a valid card renders; surrounding text and line break remain; the second URL keeps its original `href`; all external anchors use `_blank` plus `noopener noreferrer`; and a malformed canonical destination omits the card and restores the raw source URL. Return a remote or malformed `image_url` in a separate case and assert the text card remains, no `<img>` renders, and the browser makes no request to that host.

For containment, test 320, 390, 430, and 1,280 pixel widths with unbroken 180-character title, 300-character description, and 80-character site name. Assert `scrollWidth <= clientWidth`, every child remains inside the card, the image wrapper ratio is approximately 1.91, and keyboard Tab reaches the card link.

- [ ] **Step 2: Run the targeted tests and confirm RED**

Run:

```bash
cd the-bend-frontend
npm run test:e2e -- e2e/bender-link-previews.spec.ts
```

Expected: FAIL because captions are plain text and `link_preview` is ignored.

- [ ] **Step 3: Add frontend types and exact URL helpers**

Add:

```typescript
export interface BenderLinkPreview {
  source_url: string;
  url: string;
  title: string;
  description: string | null;
  site_name: string | null;
  image_url: string | null;
}
```

Add `link_preview: BenderLinkPreview | null` to `BenderPost`.

Create `benderLinks.ts` with:

```typescript
export type BenderCaptionPart =
  | { type: 'text'; text: string }
  | { type: 'link'; text: string; href: string };

export function extractHttpUrls(text: string): string[];
export function extractFirstHttpUrl(text: string): string | null;
export function removeFirstExactUrl(caption: string, sourceUrl: string): string;
export function tokenizeBenderCaption(
  caption: string,
  omittedSourceUrl?: string | null,
): BenderCaptionPart[];
export function isSafeHttpUrl(value: string): boolean;
export function isBendLinkPreviewImageUrl(value: string): boolean;
```

Match explicit case-insensitive HTTP and HTTPS tokens only. Stop at whitespace, angle brackets, and straight or curly quotes. Strip sentence punctuation and only unmatched closing brackets. Validate with `new URL()`, preserve the exact accepted token, remove only the first exact source token, and never convert text into HTML. `isBendLinkPreviewImageUrl` accepts only `^/uploads/link-previews/[0-9a-f]{64}\.webp$`; it never accepts an absolute or protocol-relative URL.

- [ ] **Step 4: Add the caption and card components**

`BenderCaption` accepts:

```typescript
export interface BenderCaptionProps {
  caption: string | null;
  authorName: string;
  omittedSourceUrl?: string | null;
}
```

It owns the current expand state, computes the 140-character threshold after source omission, and renders text plus safe anchors. If omission leaves no text, it returns `null`.

`BenderLinkPreviewCard` uses this discriminated union:

```typescript
export type BenderLinkPreviewCardProps =
  | { mode: 'composer'; state: 'loading' }
  | {
      mode: 'composer';
      state: 'ready';
      preview: BenderLinkPreview;
      onRemove: () => void;
    }
  | { mode: 'feed'; state: 'ready'; preview: BenderLinkPreview };
```

Loading mode has `role="status"` and `Loading link preview` text. Composer-ready mode is not a navigation target and provides `Remove link preview`. Feed mode is one external anchor whose accessible name uses title and optional site name. It validates `preview.url`, accepts `preview.image_url` only through `isBendLinkPreviewImageUrl`, then resolves that local path with `resolveAssetUrl()`. It renders no image wrapper for `null` or an invalid image path, reserves `aspect-[1.91/1]`, uses `object-cover`, and applies `min-w-0`, `overflow-hidden`, `break-words`, and `[overflow-wrap:anywhere]` throughout.

- [ ] **Step 5: Integrate without changing legacy post order**

For a valid preview, render caption, preview card, uploaded media, then existing actions. For `null` or malformed preview, retain the current media, actions, caption order. Omit `source_url` from the caption only when the card itself is valid and visible.

- [ ] **Step 6: Run GREEN verification and commit**

Run:

```bash
npm run test:e2e -- e2e/bender-link-previews.spec.ts
npx eslint src/types/index.ts src/lib/benderLinks.ts \
  src/components/features/bender/BenderCaption.tsx \
  src/components/features/bender/BenderLinkPreviewCard.tsx \
  src/pages/BenderPage.tsx e2e/bender-link-previews.spec.ts
```

Expected: targeted Playwright and scoped ESLint PASS.

Commit from the repository root:

```bash
git add the-bend-frontend/src/types/index.ts the-bend-frontend/src/lib/benderLinks.ts \
  the-bend-frontend/src/components/features/bender/BenderCaption.tsx \
  the-bend-frontend/src/components/features/bender/BenderLinkPreviewCard.tsx \
  the-bend-frontend/src/pages/BenderPage.tsx \
  the-bend-frontend/e2e/bender-link-previews.spec.ts
git commit -m "feat(bender): render link preview cards"
```

---

### Task 12: Add composer preview generation, dismissal, and stale-response safety

**Files:**
- Modify: `the-bend-frontend/src/services/benderApi.ts`
- Create: `the-bend-frontend/src/hooks/useBenderLinkPreview.ts`
- Modify: `the-bend-frontend/src/pages/BenderPage.tsx`
- Modify: `the-bend-frontend/e2e/bender-link-previews.spec.ts`

**Interfaces:**
- Produces `benderApi.generateLinkPreview(url, signal)`.
- Produces `useBenderLinkPreview(caption, enabled)`.
- The hook exposes `detectedUrl`, status, preview, token, `dismiss`, `waitForPreviewToken`, and `reset`.

- [ ] **Step 1: Add failing composer-state Playwright tests**

Add these named scenarios:

1. `composer debounces a link and replaces loading with a preview`
2. `composer shows a text-only preview`
3. `removing a preview keeps it dismissed until the first URL changes`
4. `failed preview leaves Post usable`
5. `stale response cannot replace the current URL preview`
6. `closing the composer cancels and resets preview state`

Use `page.clock` for the 400 ms debounce. Capture `POST /api/v1/bender/link-preview` request bodies and hold responses where needed. Assert surrounding caption edits do not refetch the same URL, AbortController cancellation is silent, and no preview failure sets the composer's blocking upload or post error.

- [ ] **Step 2: Run the tests and confirm RED**

Run:

```bash
cd the-bend-frontend
npm run test:e2e -- e2e/bender-link-previews.spec.ts
```

Expected: new composer scenarios FAIL because the endpoint is never called.

- [ ] **Step 3: Add the API method**

Add:

```typescript
export interface BenderLinkPreviewResponse {
  preview_token: string;
  preview: BenderLinkPreview;
}

generateLinkPreview: (url: string, signal?: AbortSignal) =>
  api.post<BenderLinkPreviewResponse>(
    '/bender/link-preview',
    { url },
    { signal },
  ),
```

- [ ] **Step 4: Implement the hook state machine**

Expose:

```typescript
export type BenderLinkPreviewStatus =
  | 'idle'
  | 'loading'
  | 'success'
  | 'dismissed'
  | 'unavailable';

export interface UseBenderLinkPreviewResult {
  detectedUrl: string | null;
  status: BenderLinkPreviewStatus;
  preview: BenderLinkPreview | null;
  previewToken: string | null;
  dismiss: () => void;
  waitForPreviewToken: (
    sourceUrl: string | null,
    timeoutMs?: number,
  ) => Promise<string | null>;
  reset: () => void;
}
```

Use `generationRef`, `controllerRef`, `debounceRef`, and an `activeRequestRef` containing generation, exact source URL, and settlement promise. Derive the first URL from the caption, but make the request effect depend on `enabled` and that URL rather than the full caption. On a URL change, increment generation, clear the timer, abort the controller, clear stale preview state, clear any prior dismissal, and start after 400 ms. Apply a result only when generation and URL still match. `dismiss()` remembers the current URL until it changes. `reset()` cancels all work and clears every state field. No preview path throws into the composer.

`waitForPreviewToken(sourceUrl, timeoutMs = 5000)` returns a matching ready token immediately, returns `null` for idle, unavailable, dismissed, or mismatched state, and otherwise races the matching active promise against a cleared timeout. It never throws.

- [ ] **Step 5: Render composer states and reset on close**

Render the loading or ready `BenderLinkPreviewCard` directly below the caption textarea. Keep the raw URL editable. Wire the remove button to `dismiss()`. Call `reset()` when the dialog closes and after a successful post.

- [ ] **Step 6: Run GREEN verification and commit**

Run:

```bash
npm run test:e2e -- e2e/bender-link-previews.spec.ts
npx eslint src/services/benderApi.ts src/hooks/useBenderLinkPreview.ts \
  src/pages/BenderPage.tsx e2e/bender-link-previews.spec.ts
```

Expected: targeted Playwright and scoped ESLint PASS.

Commit from the repository root:

```bash
git add the-bend-frontend/src/services/benderApi.ts \
  the-bend-frontend/src/hooks/useBenderLinkPreview.ts \
  the-bend-frontend/src/pages/BenderPage.tsx \
  the-bend-frontend/e2e/bender-link-previews.spec.ts
git commit -m "feat(bender): preview links in the composer"
```

---

### Task 13: Settle preview loading during post submission

**Files:**
- Modify: `the-bend-frontend/src/services/benderApi.ts`
- Modify: `the-bend-frontend/src/hooks/useBenderLinkPreview.ts`
- Modify: `the-bend-frontend/src/pages/BenderPage.tsx`
- Modify: `the-bend-frontend/e2e/bender-link-previews.spec.ts`

**Interfaces:**
- Adds `CreatePostPayload.preview_token?: string`.
- Composer submission captures one normalized caption and source URL, waits at most five seconds, and sends only a matching token.

- [ ] **Step 1: Add failing submission Playwright tests**

Add these named scenarios:

1. `Post waits for an active preview and sends only its token`
2. `Post continues after the five-second preview wait expires`
3. `unusable token response still creates a plain-link post`
4. `successful create response prepends the immutable preview`

Capture every `POST /api/v1/bender/posts` JSON body. Assert the first scenario sends exactly caption and `preview_token`, with no metadata keys. Hold the preview route for the timeout scenario, advance 5,000 ms, and assert post creation proceeds without a token. Return `link_preview: null` for the unusable-token case and assert the raw URL becomes a safe feed anchor.

- [ ] **Step 2: Run the tests and confirm RED**

Run:

```bash
cd the-bend-frontend
npm run test:e2e -- e2e/bender-link-previews.spec.ts
```

Expected: submission scenarios FAIL because create requests neither wait nor send a token.

- [ ] **Step 3: Wire the captured submit state**

Add `preview_token?: string` to `CreatePostPayload`.

At the start of `handleSubmit`, set `submitting`, then capture:

```typescript
const submittedCaption = caption.trim();
const submittedSourceUrl = extractFirstHttpUrl(submittedCaption);
const previewToken = await waitForPreviewToken(submittedSourceUrl, 5000);

const payload: CreatePostPayload = {};
if (submittedCaption) payload.caption = submittedCaption;
if (previewToken) payload.preview_token = previewToken;
```

Add existing media fields after this block. Disable textarea, media selection, camera, removal controls, and close-by-backdrop while submitting so the visible draft cannot drift from the captured caption. On any preview settlement, post creation remains governed only by the existing caption-or-media rule.

- [ ] **Step 4: Run GREEN verification and commit**

Run:

```bash
npm run test:e2e -- e2e/bender-link-previews.spec.ts
npm run build
npx eslint src/services/benderApi.ts src/hooks/useBenderLinkPreview.ts \
  src/pages/BenderPage.tsx e2e/bender-link-previews.spec.ts
```

Expected: targeted Playwright, production build, and scoped ESLint PASS.

Commit from the repository root:

```bash
git add the-bend-frontend/src/services/benderApi.ts \
  the-bend-frontend/src/hooks/useBenderLinkPreview.ts \
  the-bend-frontend/src/pages/BenderPage.tsx \
  the-bend-frontend/e2e/bender-link-previews.spec.ts
git commit -m "feat(bender): attach preview tokens to posts"
```

---

### Task 14: Run full verification, merge, deploy, and validate production

**Files:**
- Verify: all files changed in Tasks 1 through 13
- Verify: `docker-compose.prod.yml`
- Verify: `the-bend-backend/railway-start.sh`
- Verify: `deploy.sh`
- No planned source edit in this task unless verification exposes a real defect, which must receive its own failing regression test and focused commit.

**Interfaces:**
- Produces one reviewed merge on `main`.
- Deploys the merged `origin/main` SHA through the existing GCE Docker Compose path.
- Produces local, migration, container, API, and user-visible production evidence.

- [ ] **Step 1: Run the complete local backend gate**

Run:

```bash
cd the-bend-backend
.venv/bin/pytest -q
.venv/bin/python -m compileall -q app
.venv/bin/alembic heads
```

Expected: all backend tests PASS, compilation exits 0, and `bender_link_preview (head)` is the only migration head.

- [ ] **Step 2: Apply, downgrade, and reapply the migration on an isolated PostgreSQL 16 container**

Run from `the-bend-backend`:

```bash
set -Eeuo pipefail
preview_pg_name=bend-link-preview-postgres
cleanup_preview_postgres() {
  docker rm -f "$preview_pg_name" >/dev/null 2>&1 || true
}
trap cleanup_preview_postgres EXIT
cleanup_preview_postgres
docker run --rm --name "$preview_pg_name" \
  -e POSTGRES_DB=thebend \
  -e POSTGRES_USER=thebend \
  -e POSTGRES_PASSWORD=thebend \
  -p 55432:5432 -d postgres:16-alpine
preview_pg_ready=0
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  if docker exec "$preview_pg_name" pg_isready -U thebend; then
    preview_pg_ready=1
    break
  fi
  sleep 1
done
test "$preview_pg_ready" -eq 1
DATABASE_URL=postgresql+asyncpg://thebend:thebend@127.0.0.1:55432/thebend \
  .venv/bin/alembic upgrade head
DATABASE_URL=postgresql+asyncpg://thebend:thebend@127.0.0.1:55432/thebend \
  .venv/bin/alembic downgrade westmoreland_pricing
DATABASE_URL=postgresql+asyncpg://thebend:thebend@127.0.0.1:55432/thebend \
  .venv/bin/alembic upgrade head
```

Expected: readiness, both upgrades, and the one-revision downgrade succeed. The `EXIT` trap removes the explicitly named temporary container on success or failure.

- [ ] **Step 3: Run the complete frontend gate**

Run:

```bash
cd ../the-bend-frontend
npm run test:e2e
npm run build
npx eslint src/types/index.ts src/services/benderApi.ts src/lib/benderLinks.ts \
  src/hooks/useBenderLinkPreview.ts \
  src/components/features/bender/BenderCaption.tsx \
  src/components/features/bender/BenderLinkPreviewCard.tsx \
  src/pages/BenderPage.tsx e2e/bender-link-previews.spec.ts
npm run lint
```

Expected: Playwright, build, and scoped ESLint PASS. The untouched baseline has existing full-repository lint failures, so save the full lint output and require that none point to changed files. Do not claim the global lint gate is clean unless it actually exits 0.

- [ ] **Step 4: Build and inspect the production backend image**

Run from the repository root:

```bash
docker build -t bend-backend-link-preview-test the-bend-backend
docker run --rm --entrypoint sh bend-backend-link-preview-test \
  -c 'python -c "import aiohttp,idna; print(\"dependencies ok\")" && test -d /app/uploads/link-previews'
git diff --check
git status --short
```

Expected: dependency import, preview directory check, and diff check exit 0. Git status lists only intentional feature commits and no generated test output. Validate the production Compose file on the VM in Step 8, where the required deployment `.env` exists.

- [ ] **Step 5: Run two-stage code review before merge**

Invoke `superpowers:requesting-code-review`, `blast-radius`, and `superpowers:verification-before-completion`. Review `origin/main...HEAD` against the approved spec, with separate attention to:

- DNS pinning and every redirect hop;
- environment proxy isolation and decoded body limits;
- token owner, tenant, TTL, and first-caption-URL binding;
- fail-open post creation;
- no remote image URL reaching the browser;
- cleanup refusing deletion when Redis or database references are uncertain;
- legacy Bender media, likes, comments, deletion, pagination, and anonymous feed reads;
- composer cancellation and five-second settlement races;
- mobile containment and external-link safety.

Resolve every Critical, Important, P0, or P1 finding with a regression test and focused commit. Rerun the affected focused suite and the complete gates.

- [ ] **Step 6: Rebase on current main, push, and merge through a PR**

Run:

```bash
git fetch origin
git rebase origin/main
git push -u origin codex/bender-link-previews
gh pr create \
  --base main \
  --head codex/bender-link-previews \
  --title "Add Bender link previews" \
  --body 'Adds authenticated, SSRF-safe link preview generation for Bender; stores immutable snapshots and Bend-managed images; adds fail-open composer and feed behavior; covers backend security, migration, cleanup, and Playwright flows.'
gh pr view --json number,mergeable,reviewDecision,statusCheckRollup
```

If the rebase conflicts, invoke `resolving-merge-conflicts`, preserve unrelated mainline changes, rerun all gates, and push with `--force-with-lease` only for this feature branch. Merge only when the PR is mergeable, reviews are resolved, and any available checks pass:

```bash
gh pr merge --merge
git fetch origin
git rev-parse origin/main
```

Record the merged `origin/main` SHA. Do not deploy the pre-merge feature SHA.

- [ ] **Step 7: Revalidate the production host and deploy the merged SHA**

The last verified deployment path was GCE instance `instance-20260429-055340`, zone `us-central1-f`, project `mythic-lattice-455715-q1`, checkout `/opt/bend`. Revalidate it because infrastructure can drift:

```bash
gcloud compute instances describe instance-20260429-055340 \
  --zone us-central1-f \
  --project mythic-lattice-455715-q1 \
  --format='value(name,status,networkInterfaces[0].accessConfigs[0].natIP)'
gcloud compute ssh instance-20260429-055340 \
  --zone us-central1-f \
  --project mythic-lattice-455715-q1 \
  --command='cd /opt/bend && git status --short && git branch --show-current && git rev-parse HEAD'
```

Stop if the VM checkout is dirty, is not on `main`, or cannot fast-forward. Update the checkout and record its SHA:

```bash
gcloud compute ssh instance-20260429-055340 \
  --zone us-central1-f \
  --project mythic-lattice-455715-q1 \
  --command='set -Eeuo pipefail; cd /opt/bend; git fetch origin; git checkout main; git pull --ff-only origin main; git rev-parse HEAD; docker compose -f docker-compose.prod.yml config -q; docker compose -f docker-compose.prod.yml build backend frontend'
```

Require the printed VM SHA to equal the merged `origin/main` SHA from Step 6. Deploy backend first and wait for its startup migration and health before exposing the new frontend:

```bash
gcloud compute ssh instance-20260429-055340 \
  --zone us-central1-f \
  --project mythic-lattice-455715-q1 \
  --command='set -Eeuo pipefail
    cd /opt/bend
    docker compose -f docker-compose.prod.yml up -d --no-deps backend
    backend_ready=0
    for attempt in 1 2 3 4 5 6 7 8 9 10 11 12; do
      if docker compose -f docker-compose.prod.yml exec -T backend python -c "import urllib.request; urllib.request.urlopen(\"http://127.0.0.1:8000/api/v1/health\", timeout=2).read()"; then
        backend_ready=1
        break
      fi
      sleep 5
    done
    test "$backend_ready" -eq 1
    docker compose -f docker-compose.prod.yml exec -T backend alembic current
    docker compose -f docker-compose.prod.yml exec -T redis redis-cli ping
    docker compose -f docker-compose.prod.yml up -d --no-deps celery-worker celery-beat
    docker compose -f docker-compose.prod.yml exec -T celery-worker celery -A app.workers.celery_app inspect ping
    docker compose -f docker-compose.prod.yml up -d --no-deps frontend
    docker compose -f docker-compose.prod.yml ps'
```

`railway-start.sh` applies the additive migration before backend health succeeds. Caddy stays online and continues serving the old frontend until the final `frontend` recreation, so the new browser code cannot call an old API during migration. This intentionally stages the existing Compose services instead of calling the all-at-once `deploy.sh`.

- [ ] **Step 8: Verify production services and the exact deployed revision**

Run:

```bash
gcloud compute ssh instance-20260429-055340 \
  --zone us-central1-f \
  --project mythic-lattice-455715-q1 \
  --command='set -e; cd /opt/bend; git rev-parse HEAD; docker compose -f docker-compose.prod.yml ps; docker compose -f docker-compose.prod.yml exec -T backend alembic current; docker compose -f docker-compose.prod.yml exec -T redis redis-cli ping; docker compose -f docker-compose.prod.yml exec -T celery-worker celery -A app.workers.celery_app inspect ping; docker compose -f docker-compose.prod.yml exec -T backend test -d /app/uploads/link-previews'
curl -fsS https://api.bend.community/api/v1/health
curl -fsS -H 'X-Tenant-Slug: westmoreland' \
  https://api.bend.community/api/v1/tenant/current
curl -fsS -H 'X-Tenant-Slug: westmoreland' \
  'https://api.bend.community/api/v1/bender/posts?limit=1'
```

Expected: VM SHA equals the merged `origin/main` SHA, all services are running, migration current includes `bender_link_preview`, Redis returns `PONG`, a Celery worker replies, the directory exists, health reports healthy database state, tenant resolves to Westmoreland, and the public feed remains readable.

- [ ] **Step 9: Run authenticated production UX and security smoke checks**

Use the Codex in-app browser with an existing signed-in test account. Do not expose credentials or tokens in logs or chat.

1. Open `https://westmoreland.bend.community/bender` on desktop.
2. Paste `Join the Open Graph community: https://ogp.me/`.
3. Confirm loading appears, then a title and Bend-hosted image or a valid text-only card.
4. Confirm the raw URL remains editable before posting.
5. Publish and confirm the raw previewed URL is hidden, surrounding text remains, and the card opens the safe destination.
6. Inspect the image request and confirm its source is `https://api.bend.community/uploads/link-previews/...`, not the third-party image host.
7. Reload and confirm the same immutable card returns without any browser request to `ogp.me`.
8. Repeat at a 390-by-844 mobile viewport and confirm no horizontal overflow.
9. Paste `http://127.0.0.1/` into a new draft. Confirm no preview appears and Post remains available for a normal plain-link post. Do not publish this private-address smoke draft.
10. Remove the public smoke-test post unless it is intended to remain in the community feed.

Verify logs show only bounded hostname and error categories. Check Redis TTLs by count and TTL only; do not print record values or tokens.

- [ ] **Step 10: Prepare rollback and report evidence**

If preview generation fails while posting and feed remain healthy, disable use by reverting the frontend preview commit through a PR and redeploy; saved snapshots remain harmless. If backend availability or security is affected, revert the merge through a reviewed PR and deploy the revert. Leave the nullable JSONB column in place because old code ignores it and a migration downgrade would add unnecessary production risk.

Report:

- merged and deployed SHA;
- backend test, frontend Playwright, build, scoped lint, migration, and image-build results;
- service, health, Redis, Celery, and migration evidence;
- desktop and mobile composer and feed results;
- source-image host confirmation;
- private-address fallback result;
- smoke-post cleanup result;
- any remaining full-repository baseline lint failures, clearly separated from changed-file results.
