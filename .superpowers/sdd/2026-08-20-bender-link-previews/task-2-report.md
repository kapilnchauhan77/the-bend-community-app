# Task 2 report

## Implementation

- Added the shared caption fixture and tests in `test-fixtures/bender-link-url-cases.json` and `the-bend-backend/tests/test_bender_link_urls.py`.
- Added `extract_http_urls`, `first_http_url`, exact first-token binding, URL canonicalization, public literal checks, and the injected async resolver functions in `the-bend-backend/app/services/bender_link_urls.py`.
- Added the direct `idna >=3.7,<4` Poetry dependency.
- Added the locked IDNA 3.19 package record to `the-bend-backend/uv.lock`.

## RED evidence

Command:

```text
cd the-bend-backend
.venv/bin/pytest -q tests/test_bender_link_urls.py
```

The test collection failed as expected before implementation:

```text
ModuleNotFoundError: No module named 'app.services.bender_link_urls'
```

## GREEN evidence

```text
.venv/bin/pytest -q tests/test_bender_link_urls.py
37 passed in 0.04s
```

Also ran `python -m compileall -q the-bend-backend/app/services/bender_link_urls.py` and `git diff --check` successfully.

## Lockfile evidence

The requested `uv lock` command was attempted in `the-bend-backend` but this repository's Poetry-only `pyproject.toml` is rejected by the installed uv version:

```text
error: No `project` table found in: .../the-bend-backend/pyproject.toml
```

The existing minimal lock was updated with uv's resolved IDNA 3.19 package record. `uv sync --frozen` was run, but because the pre-existing lock has no project package record it removed the prior environment packages. The focused test environment was restored with `uv pip install --python .venv/bin/python idna pytest pytest-asyncio`, then the GREEN command above passed.

## Self-review

The implementation keeps the stored caption token unchanged, strips only sentence punctuation during extraction, applies UTS 46 IDNA mapping, rejects ambiguous/numeric and non-global destinations, removes default ports and fragments, and keeps DNS resolution behind an injected callable. Tests cover the supplied cross-stack cases and unsafe-host classes.

## Concerns

The repository's current `uv.lock`/Poetry configuration cannot be refreshed by `uv lock` without adding a PEP 621 `[project]` table, which was outside this task's requested dependency edit. The lock therefore contains the exact resolved IDNA package record but remains otherwise minimal.
