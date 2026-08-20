# Task 14 final fix wave report

Base candidate: `1f9cb96b4bab0cfcb0b6b3`

Chosen limits:

- Unpublished image retention: 25 minutes, five minutes beyond the 20-minute Redis cache/draft TTL.
- Image store cap: 10,000 files and 512 MiB aggregate encoded bytes. The exclusive lock covers accounting and replacement, so concurrent writers cannot cross either limit.
- Per-user preview generation budget: 30 cache-miss generations per rolling hour, enforced by Redis `INCR` and expiry.
- Redis application wait: 1.5 seconds. Redis socket connect/read waits: 1 second.

Verification:

- RED: `pytest -q tests/test_bender_link_urls.py tests/test_link_preview_image_store.py tests/test_bender_link_preview_store.py`, 6 failed, 88 passed before production edits.
- Focused backend: 130 passed, then 99 passed for URL/store/cleanup/fetcher coverage.
- Full backend: 320 passed, 6 unrelated connector tests fail because the local environment lacks installed `feedparser` and `icalendar` modules. The production package declares both dependencies.
- Backend compile and Alembic head: passed, head `bender_link_preview`.
- Frontend build and scoped ESLint: passed. Full Playwright run exercised 57 tests and completed green; Vite emitted only the existing analytics-token and chunk-size warnings.
- `git diff --check`: passed.

The Docker backend build with `the-bend-backend` as context and the frontend production build are run separately. No push, merge, or deployment was performed.
