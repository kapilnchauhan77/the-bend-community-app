# Task 14 final fix wave report

Base candidate: `1f9cb96b4bab0cfcb0b6b3`

Chosen limits:

- Unpublished image retention: 25 minutes, five minutes beyond the 20-minute Redis cache/draft TTL.
- Image store cap: 10,000 files and 512 MiB aggregate encoded bytes. The exclusive lock covers accounting and replacement, so concurrent writers cannot cross either limit.
- Per-user preview generation budget: 30 cache-miss generations per rolling hour, enforced by one Redis sorted-set transaction that prunes, adds, counts, and expires.
- Redis application wait: 1.5 seconds. Redis socket connect/read waits: 1 second.

Verification:

- RED: `pytest -q tests/test_bender_link_urls.py tests/test_link_preview_image_store.py tests/test_bender_link_preview_store.py`, 6 failed, 88 passed before production edits.
- Focused backend: 130 passed, then 99 passed for URL/store/cleanup/fetcher coverage.
- Full backend: 320 passed, 6 unrelated connector tests fail because the local environment lacks installed `feedparser` and `icalendar` modules. The production package declares both dependencies.
- Backend compile and Alembic head: passed, head `bender_link_preview`.
- Frontend build and scoped ESLint: passed. Full Playwright run exercised 57 tests and completed green; Vite emitted only the existing analytics-token and chunk-size warnings.
- `git diff --check`: passed.

Follow-up verification:

- Focused backend regressions and affected suites: 128 passed.
- Exact project command `.venv/bin/pytest -q`: 345 passed, 12 warnings.
- Frontend build and scoped ESLint: passed. Full Playwright: 57 passed in 28.9 seconds. Existing analytics-token and bundle-size warnings remain.
- Backend compile, Alembic head (`bender_link_preview`), and `git diff --check`: passed.
- Docker builds remain pending Docker Desktop storage recovery. No image-build success is claimed.
- No push, merge, or deployment was performed.

Parity follow-up:

- Added raw-authority percent rejection for frontend URLs, matching backend behavior for encoded hostname authorities.
- RED shared-fixture Playwright: 1 failed before the frontend change.
- GREEN shared-fixture Playwright: 1 passed in 7.8 seconds.
- Frontend build, scoped ESLint, and `git diff --check`: passed.
