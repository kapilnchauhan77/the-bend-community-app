# Task 1 report

Status: `DONE_WITH_CONCERNS`

## RED

Command: `pytest -q tests/test_community_faith_event_review.py`

Expected RED output: `2 failed, 1 passed`, with missing `EventSubmitRequest.organization_type` and `EventStatus.REJECTED`.

## GREEN

Command: `pytest -q tests/test_community_faith_event_review.py`

Output: `4 passed, 1 warning`.

## Full backend suite

Command: `pytest -q`

Output: `366 passed, 6 failed, 12 warnings`. The six failures are pre-existing connector image tests blocked by missing `feedparser` and `icalendar` packages. No event-review test failed.

## Checks

- `python -m compileall -q app alembic/versions/20260824_community_faith_event_review.py`: passed.
- `alembic heads`: passed, `20260824_community_faith_event_review (head)`.
- `git diff --check`: passed.
- Alembic offline upgrade/downgrade generation was attempted without Docker. The full-chain offline run is blocked by the pre-existing `westmoreland_sponsor_packages` migration calling a database result during SQL generation. The new migration itself has executable upgrade/downgrade operations and Python compilation passes.

## Changed files and rationale

- `the-bend-backend/app/api/v1/events.py`: organization-type derivation and validation, coupon pricing rules, pending submission persistence, usage timing, and private admin serializer.
- `the-bend-backend/app/api/v1/admin.py`: tenant-scoped pending review list plus approve/reject and scoped update/delete routes.
- `the-bend-backend/app/services/event_service.py`: tenant-scoped event lookup, review listing, and status transitions.
- `the-bend-backend/app/models/event.py`: nullable organization and coupon foreign-key fields.
- `the-bend-backend/app/models/enums.py`: rejected event status.
- `the-bend-backend/alembic/versions/20260824_community_faith_event_review.py`: nullable columns, `ON DELETE SET NULL` foreign key, and safe uppercase PostgreSQL enum additions for `PENDING` and `REJECTED`.
- `the-bend-backend/tests/test_community_faith_event_review.py`: red-green regression coverage for request compatibility, status, and public/private serialization.

## Commit

Implementation commit: `bf172bb40eea7ec366eebee98a847e7ef01d2634`

## Self-review and remaining concerns

The public serializer does not expose submitter identity, nonprofit document URLs, or coupon IDs. Community/faith submissions require a redeemable event coupon that reduces the $19.99 path to exactly zero. Coupon lookup and usage increment each occur once. Admin event mutations are tenant filtered.

Remaining concerns are limited to the unrelated missing parser dependencies and the existing migration's offline SQL-generation defect noted above.
