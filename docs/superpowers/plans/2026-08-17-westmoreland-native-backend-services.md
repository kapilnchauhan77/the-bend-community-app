# Westmoreland Native Backend Services Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the production backend capabilities required by the native launch: device installations, preferences, transactional APNs/FCM delivery, user blocking, complete reporting and public-content filtering, account deletion, and verified native commerce state.

**Architecture:** Persist native installations and a notification outbox in PostgreSQL; a Celery Beat dispatcher claims outbox rows and calls isolated APNs/FCM providers with idempotent retries. Safety capabilities use tenant-scoped generic report and block records enforced in services, not only UI. Account deletion immediately locks the account and runs a bounded Celery erasure job. A public capabilities endpoint controls native commerce and store URLs.

**Tech Stack:** FastAPI, Pydantic, SQLAlchemy async, Alembic, PostgreSQL, Redis, Celery, `firebase-admin`, `aioapns`, Stripe, pytest.

## Global Constraints

- Apply every constraint in `docs/superpowers/plans/2026-08-17-westmoreland-native-apps-roadmap.md`.
- Run this plan only after Plan 1's exit gate passes.
- All new records and queries are tenant-scoped; cross-tenant IDs behave as not found.
- Native push bodies are generic and never contain message text, rejection reasons, contact data, addresses, precise locations, signed URLs, or payment/session identifiers.
- Provider credentials come only from environment/secret storage and are never logged.
- Existing web-push subscriptions remain supported until an explicit later removal.
- Database migrations must upgrade existing production data without destructive backfills.

---

## File structure

### Create

- `app/models/device_installation.py` — APNs/FCM device identity and revocation hash.
- `app/models/notification_preference.py` — four native category preferences.
- `app/models/notification_outbox.py` — durable notification dispatch queue.
- `app/models/user_block.py` — tenant-scoped symmetric messaging/content block rule.
- `app/models/report_audit.py` — immutable moderator actions for generic reports.
- `app/models/account_deletion.py` — deletion request lifecycle.
- `app/schemas/device.py`, `moderation.py`, `account.py`, `capabilities.py` — typed API contracts.
- `app/services/device_service.py` — register, rotate, disable, and revoke installations.
- `app/services/push_provider.py` — APNs and FCM provider adapters.
- `app/services/push_dispatcher.py` — outbox claim, preference filter, send, retry, invalid-token cleanup.
- `app/services/block_service.py` — block creation/removal and enforcement predicates.
- `app/services/report_service.py` — generic report validation, creation, and admin hydration.
- `app/services/content_moderation_service.py` — configurable public-text filter.
- `app/services/account_deletion_service.py` — lock, revoke, anonymize/delete, and finish.
- `app/services/capabilities_service.py` — Westmoreland native runtime capability response.
- `app/api/v1/devices.py`, `safety.py`, `account.py`, `capabilities.py` — new endpoints.
- `app/workers/account_tasks.py` — account-erasure worker.
- Backend tests named in each task.
- One Alembic revision per reviewer-sized model group.

### Modify

- `app/config.py`, `app/models/__init__.py`, `app/models/report.py`, `app/models/user.py`, `app/models/message.py`, `app/models/enums.py`.
- `app/schemas/notification.py`, `app/services/notification_service.py`, `app/services/message_service.py`, `app/services/interest_service.py`, `app/services/admin_service.py`, `app/services/listing_service.py`.
- `app/repositories/message_repo.py` and public-content repositories/services affected by blocks.
- `app/api/v1/notifications.py`, `listings.py`, `shops.py`, `events.py`, `bender.py`, `messages.py`, `admin.py`, `advertising.py`, and `router.py`.
- `app/workers/push_tasks.py`, `scheduled_tasks.py`, and `celery_app.py`.
- `pyproject.toml`, `.env.example`, and root `.env.production.example` with secret names only. Production installs directly from `pyproject.toml`; the unrelated, pre-existing `uv.lock` edit remains untouched.

---

### Task 1: Persist native installations, preferences, and notification outbox rows

**Files:**
- Create: `app/models/device_installation.py`
- Create: `app/models/notification_preference.py`
- Create: `app/models/notification_outbox.py`
- Modify: `app/models/user.py`
- Modify: `app/models/__init__.py`
- Create: `alembic/versions/nat002_add_native_push_models.py`
- Test: `tests/test_native_push_models.py`

**Interfaces:**
- Produces: `DeviceInstallation`, `NotificationPreference`, and `NotificationOutbox`.
- Produces statuses `pending`, `processing`, `delivered`, and `failed` as plain strings, not a PostgreSQL enum.

- [ ] **Step 1: Write failing model/default tests**

```python
def test_notification_preferences_default_to_required_categories_enabled():
    prefs = NotificationPreference(user_id=uuid4(), tenant_id=uuid4())
    assert prefs.push_enabled is True
    assert prefs.message_received is True
    assert prefs.listing_interest_received is True
    assert prefs.registration_decision is True
    assert prefs.urgent_listing_published is True

def test_outbox_starts_pending():
    row = NotificationOutbox(notification_id=uuid4(), tenant_id=uuid4())
    assert row.status == "pending"
    assert row.attempts == 0
```

- [ ] **Step 2: Confirm the new-model tests fail**

Run: `cd the-bend-backend && .venv/bin/pytest tests/test_native_push_models.py -q`

Expected: FAIL because the models do not exist.

- [ ] **Step 3: Implement models and a non-destructive migration**

Core installation fields:

```python
class DeviceInstallation(Base):
    __tablename__ = "device_installations"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    platform: Mapped[str] = mapped_column(String(16), nullable=False)
    provider_token: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    revocation_secret_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    app_version: Mapped[str] = mapped_column(String(32), nullable=False)
    build_number: Mapped[str] = mapped_column(String(32), nullable=False)
    locale: Mapped[str] = mapped_column(String(16), default="en-US", nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_seen_at: Mapped[datetime] = mapped_column(default=datetime.utcnow, nullable=False)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
```

Outbox has a unique `notification_id`, `status`, `attempts`, `available_at`, `locked_at`, `provider_results` JSONB, `last_error_code`, and timestamps. Never persist provider credential material or exception strings that may contain tokens.

Set `revision = "nat002"` and `down_revision = "nat001"` in the migration.

- [ ] **Step 4: Run migration and model tests**

Run:

```bash
cd the-bend-backend
.venv/bin/alembic upgrade head
.venv/bin/pytest tests/test_native_push_models.py -q
```

Expected: migration and tests PASS.

- [ ] **Step 5: Commit the native-push schema**

```bash
git add the-bend-backend/app/models/device_installation.py the-bend-backend/app/models/notification_preference.py the-bend-backend/app/models/notification_outbox.py the-bend-backend/app/models/user.py the-bend-backend/app/models/__init__.py the-bend-backend/alembic/versions/nat002_add_native_push_models.py the-bend-backend/tests/test_native_push_models.py
git commit -m "feat(push): persist native installations and outbox"
```

---

### Task 2: Add installation, preference, and security revocation APIs

**Files:**
- Create: `app/schemas/device.py`
- Create: `app/services/device_service.py`
- Create: `app/api/v1/devices.py`
- Modify: `app/api/v1/router.py`
- Modify: `app/api/v1/notifications.py`
- Modify: `app/schemas/notification.py`
- Test: `tests/test_device_installations.py`

**Interfaces:**
- Produces: `PUT /api/v1/devices/installations/{installation_id}`.
- Produces: `DELETE /api/v1/devices/installations/{installation_id}` for authenticated disablement.
- Produces: `POST /api/v1/devices/installations/{installation_id}/revoke` with opaque revocation secret and no account-data access.
- Produces: `GET` and `PUT /api/v1/notifications/preferences` using the roadmap payload.

- [ ] **Step 1: Write failing tenant, rotation, and revoke tests**

```python
@pytest.mark.asyncio
async def test_registration_rotates_token_and_returns_revoke_secret(client, member_headers):
    response = await client.put("/api/v1/devices/installations/00000000-0000-0000-0000-000000000001", headers=member_headers, json=INSTALLATION)
    assert response.status_code == 200
    assert response.json()["revocation_secret"]

@pytest.mark.asyncio
async def test_revoke_secret_can_only_disable_its_installation(client, installation):
    response = await client.post(f"/api/v1/devices/installations/{installation.id}/revoke", json={"revocation_secret": installation.plain_secret})
    assert response.json() == {"status": "revoked"}
```

- [ ] **Step 2: Confirm API tests fail**

Run: `cd the-bend-backend && .venv/bin/pytest tests/test_device_installations.py -q`

Expected: FAIL with route-not-found responses.

- [ ] **Step 3: Implement schemas, services, endpoints, and preference persistence**

Hash revocation secrets using the existing password-hash primitives and return the plaintext only on registration/rotation:

```python
async def revoke_with_secret(self, installation_id: UUID, secret: str) -> None:
    installation = await self.repo.get(installation_id)
    if not installation or not verify_password(secret, installation.revocation_secret_hash):
        raise NotFoundError("Installation")
    installation.enabled = False
    installation.provider_token = f"revoked:{installation.id}"
```

Validate `platform` against `ios|android`, enforce current tenant/member on authenticated endpoints, and never return provider tokens from read APIs.

- [ ] **Step 4: Run focused and notification regression tests**

Run:

```bash
cd the-bend-backend
.venv/bin/pytest tests/test_device_installations.py -q
.venv/bin/pytest tests -q
```

Expected: all tests PASS.

- [ ] **Step 5: Commit device APIs**

```bash
git add the-bend-backend/app/schemas/device.py the-bend-backend/app/services/device_service.py the-bend-backend/app/api/v1/devices.py the-bend-backend/app/api/v1/router.py the-bend-backend/app/api/v1/notifications.py the-bend-backend/app/schemas/notification.py the-bend-backend/tests/test_device_installations.py
git commit -m "feat(push): manage native device registrations"
```

---

### Task 3: Implement APNs/FCM providers and idempotent outbox dispatch

**Files:**
- Modify: `pyproject.toml`
- Modify: `app/config.py`
- Modify: `the-bend-backend/.env.example`
- Modify: `.env.production.example`
- Create: `app/services/push_provider.py`
- Create: `app/services/push_dispatcher.py`
- Rewrite: `app/workers/push_tasks.py`
- Modify: `app/workers/celery_app.py`
- Test: `tests/test_push_dispatcher.py`

**Interfaces:**
- Produces: `PushProvider.send(installation, payload) -> ProviderResult`.
- Produces: `dispatch_pending_outbox(batch_size: int = 100) -> int`.
- Produces Celery task `app.workers.push_tasks.dispatch_push_outbox` every 10 seconds.

- [ ] **Step 1: Write failing delivery, retry, and invalid-token tests**

```python
@pytest.mark.asyncio
async def test_dispatcher_marks_success_and_never_sends_message_body(dispatcher, outbox):
    await dispatcher.dispatch_one(outbox.id)
    payload = dispatcher.provider.calls[0].payload
    assert payload["body"] == "You have a new message"
    assert "secret message" not in str(payload)

@pytest.mark.asyncio
async def test_invalid_provider_token_disables_installation(dispatcher, invalid_installation):
    dispatcher.provider.result = ProviderResult.invalid_token("UNREGISTERED")
    await dispatcher.dispatch_one(dispatcher.outbox.id)
    assert invalid_installation.enabled is False
```

- [ ] **Step 2: Confirm dispatcher tests fail**

Run: `cd the-bend-backend && .venv/bin/pytest tests/test_push_dispatcher.py -q`

Expected: FAIL because provider and dispatcher services do not exist.

- [ ] **Step 3: Add provider dependencies, configuration, and dispatcher**

Add `firebase-admin = ">=6.5.0"` and `aioapns = ">=3.2.0"` under `[tool.poetry.dependencies]`, then install the editable project exactly as production packaging resolves it.

Run: `cd the-bend-backend && .venv/bin/pip install -e .`

Do not modify `uv.lock`; it is not used by the Dockerfile and already contains an unrelated user change.

Add only secret names to examples: `FIREBASE_SERVICE_ACCOUNT_JSON`, `APNS_TEAM_ID`, `APNS_KEY_ID`, `APNS_PRIVATE_KEY`, `APNS_BUNDLE_ID=community.bend.westmoreland`, and `APNS_USE_SANDBOX`.

Claim rows with `FOR UPDATE SKIP LOCKED`, set `processing`, and construct an allowlisted payload:

```python
payload = {
    "notification_id": str(notification.id),
    "category": outbox.category,
    "title": safe_title(outbox.category),
    "body": safe_body(outbox.category),
    "target_type": notification.data.get("target_type"),
    "target_id": notification.data.get("target_id"),
}
```

Retry transient results with `available_at = now + min(15 * 2**attempts, 900)` plus jitter. Mark failed after five attempts. Disable invalid tokens. Record only provider status/error codes.

- [ ] **Step 4: Run dispatcher tests and validate Celery registration**

Run:

```bash
cd the-bend-backend
.venv/bin/pytest tests/test_push_dispatcher.py -q
.venv/bin/celery -A app.workers.celery_app inspect registered
```

Expected: tests PASS; output lists `app.workers.push_tasks.dispatch_push_outbox`.

- [ ] **Step 5: Commit provider delivery**

```bash
git add the-bend-backend/pyproject.toml the-bend-backend/app/config.py the-bend-backend/.env.example .env.production.example the-bend-backend/app/services/push_provider.py the-bend-backend/app/services/push_dispatcher.py the-bend-backend/app/workers/push_tasks.py the-bend-backend/app/workers/celery_app.py the-bend-backend/tests/test_push_dispatcher.py
git commit -m "feat(push): dispatch APNs and FCM notifications"
```

---

### Task 4: Wire the four required domain events into the outbox

**Files:**
- Modify: `app/services/notification_service.py`
- Modify: `app/services/message_service.py`
- Modify: `app/services/interest_service.py`
- Modify: `app/services/admin_service.py`
- Modify: `app/services/listing_service.py`
- Modify: `app/workers/scheduled_tasks.py`
- Modify: `app/api/ws/chat.py`
- Test: `tests/test_notification_outbox_events.py`

**Interfaces:**
- Changes: `NotificationService.notify(..., category: PushCategory | None, tenant_id: UUID | None)` creates `Notification` and `NotificationOutbox` in one transaction.
- Produces exact target payload keys `target_type` and `target_id`.

- [ ] **Step 1: Write one failing outbox assertion per required event**

```python
@pytest.mark.parametrize("notification_type,category", [
    (NotificationType.NEW_MESSAGE, "message_received"),
    (NotificationType.LISTING_INTEREST, "listing_interest_received"),
    (NotificationType.REGISTRATION_APPROVED, "registration_decision"),
    (NotificationType.NEW_URGENT_LISTING, "urgent_listing_published"),
])
async def test_required_notification_creates_outbox(notification_type, category, db, user):
    await NotificationService(db).notify(user.id, notification_type, "title", "private body", {"target_type": "listing", "target_id": str(uuid4())}, category, user.tenant_id)
    assert (await latest_outbox(db)).category == category
```

- [ ] **Step 2: Confirm event tests fail**

Run: `cd the-bend-backend && .venv/bin/pytest tests/test_notification_outbox_events.py -q`

Expected: FAIL because `notify` does not create outbox rows.

- [ ] **Step 3: Implement transactional event creation and privacy-safe message notifications**

Remove swallowed exceptions around these four required notification writes. Message notifications use body `You have a new message`; rejection reason remains in the authenticated in-app notification only and never enters the push outbox payload.

When a listing is created urgent or the scheduled task promotes it to urgent, create one notification/outbox per eligible active Westmoreland member except the author. Add an idempotency key `urgent-listing:{listing_id}:{user_id}` to prevent duplicates.

Preserve current WebSocket message delivery and include `notification_id` in the real-time event so the client can suppress duplicate foreground presentation.

- [ ] **Step 4: Run event, message, interest, and admin tests**

Run:

```bash
cd the-bend-backend
.venv/bin/pytest tests/test_notification_outbox_events.py tests/test_send_message_reference.py tests/test_message_hydration.py -q
.venv/bin/pytest -q
```

Expected: all tests PASS and no required notification path contains `except Exception: pass`.

- [ ] **Step 5: Commit domain-event wiring**

```bash
git add the-bend-backend/app/services/notification_service.py the-bend-backend/app/services/message_service.py the-bend-backend/app/services/interest_service.py the-bend-backend/app/services/admin_service.py the-bend-backend/app/services/listing_service.py the-bend-backend/app/workers/scheduled_tasks.py the-bend-backend/app/api/ws/chat.py the-bend-backend/tests/test_notification_outbox_events.py
git commit -m "feat(push): queue required community notifications"
```

---

### Task 5: Add user blocking and enforce it in messaging and discovery

**Files:**
- Create: `app/models/user_block.py`
- Create: `app/services/block_service.py`
- Create: `app/schemas/moderation.py`
- Create: `app/api/v1/safety.py`
- Modify: `app/api/v1/router.py`
- Modify: `app/services/message_service.py`
- Modify: `app/repositories/message_repo.py`
- Modify: `app/services/listing_service.py`, `shop_service.py`, `event_service.py`, `bender_service.py`, `volunteer_service.py`, `talent_service.py`, and `reference_service.py`.
- Create: `alembic/versions/nat003_add_user_blocks.py`
- Test: `tests/test_user_blocks.py`

**Interfaces:**
- Produces: `POST /api/v1/safety/blocks/{user_id}`, `DELETE /api/v1/safety/blocks/{user_id}`, and `GET /api/v1/safety/blocks`.
- Produces: `BlockService.is_blocked_between(a: UUID, b: UUID, tenant_id: UUID) -> bool`.

- [ ] **Step 1: Write failing block-enforcement tests**

```python
@pytest.mark.asyncio
async def test_block_prevents_messages_in_both_directions(blocked_pair, message_service):
    for sender in blocked_pair:
        with pytest.raises(ForbiddenError, match="blocked"):
            await message_service.send_message(blocked_pair.thread_id, sender.id, "hello")

@pytest.mark.asyncio
async def test_blocked_authors_are_removed_from_discovery(blocked_pair, listing_service):
    page = await listing_service.browse_listings(viewer_id=blocked_pair.blocker.id, tenant_id=blocked_pair.tenant_id)
    assert blocked_pair.blocked_listing.id not in {item.id for item in page.items}
```

- [ ] **Step 2: Confirm block tests fail**

Run: `cd the-bend-backend && .venv/bin/pytest tests/test_user_blocks.py -q`

Expected: FAIL because the block model/service do not exist.

- [ ] **Step 3: Implement symmetric enforcement over a directional record**

Persist `(tenant_id, blocker_id, blocked_id)` unique records. For messaging, query either direction:

```python
condition = or_(
    and_(UserBlock.blocker_id == a, UserBlock.blocked_id == b),
    and_(UserBlock.blocker_id == b, UserBlock.blocked_id == a),
)
```

Disable thread composers through the API response and reject start/send operations server-side. Discovery hides content only from the blocker; blocking does not globally unpublish the blocked member.

Set `revision = "nat003"` and `down_revision = "nat002"` in the migration. Pass `viewer_id` into every named public-query service; when present, exclude authors blocked by that viewer. Keep anonymous discovery unchanged.

- [ ] **Step 4: Run migration and regressions**

Run:

```bash
cd the-bend-backend
.venv/bin/alembic upgrade head
.venv/bin/pytest tests/test_user_blocks.py tests/test_send_message_reference.py tests/test_reference_search.py -q
```

Expected: tests PASS.

- [ ] **Step 5: Commit blocking**

```bash
git add the-bend-backend/app/models/user_block.py the-bend-backend/app/services/block_service.py the-bend-backend/app/schemas/moderation.py the-bend-backend/app/api/v1/safety.py the-bend-backend/app/api/v1/router.py the-bend-backend/app/services/message_service.py the-bend-backend/app/repositories/message_repo.py the-bend-backend/app/services/listing_service.py the-bend-backend/app/services/shop_service.py the-bend-backend/app/services/event_service.py the-bend-backend/app/services/bender_service.py the-bend-backend/app/services/volunteer_service.py the-bend-backend/app/services/talent_service.py the-bend-backend/app/services/reference_service.py the-bend-backend/alembic/versions/nat003_add_user_blocks.py the-bend-backend/tests/test_user_blocks.py
git commit -m "feat(safety): block users across messages and discovery"
```

---

### Task 6: Generalize reporting and filter public user-authored text

**Files:**
- Modify: `app/models/report.py`
- Create: `app/models/report_audit.py`
- Create: `app/services/report_service.py`
- Create: `app/services/content_moderation_service.py`
- Modify: `app/config.py`
- Modify: `the-bend-backend/.env.example`
- Modify: `app/schemas/moderation.py`
- Modify: `app/api/v1/safety.py`
- Modify: `app/api/v1/listings.py`, `shops.py`, `events.py`, `bender.py`, `messages.py`, and `admin.py`.
- Create: `alembic/versions/nat004_generalize_reports.py`
- Test: `tests/test_generic_reports.py`
- Test: `tests/test_content_moderation.py`

**Interfaces:**
- Produces: `POST /api/v1/safety/reports` body `{target_type,target_id,reason,details}`.
- Produces: `ContentModerationService.validate_public_text(fields: dict[str, str | None]) -> None`.

- [ ] **Step 1: Write failing cross-target and filter tests**

```python
@pytest.mark.parametrize("target_type", ["listing", "shop", "event", "bender", "user", "message"])
async def test_member_can_report_each_supported_target(target_type, report_service, targets):
    report = await report_service.create(target_type, targets[target_type], "spam", None)
    assert report.target_type == target_type

def test_public_filter_rejects_configured_prohibited_term(moderator):
    with pytest.raises(ValidationError):
        moderator.validate_public_text({"title": "known prohibited phrase"})

async def test_admin_resolution_appends_immutable_audit_event(report_service, open_report, admin):
    await report_service.resolve(open_report.id, admin.id, action="content_unpublished")
    event = await latest_report_audit(open_report.id)
    assert event.actor_id == admin.id
    assert event.action == "content_unpublished"
```

- [ ] **Step 2: Confirm report/filter tests fail**

Run: `cd the-bend-backend && .venv/bin/pytest tests/test_generic_reports.py tests/test_content_moderation.py -q`

Expected: FAIL against listing-only reports and absent filter service.

- [ ] **Step 3: Migrate reports and wire validation**

Migration converts existing `listing_id` values to `target_type='listing'` and `target_id=listing_id`, adds `status`, `resolved_at`, `resolved_by_id`, creates immutable `report_audits(report_id, actor_id, action, created_at)`, then removes the listing-only FK/column after validation.

Set `revision = "nat004"` and `down_revision = "nat003"` in the migration.

The filter normalizes Unicode and whitespace, rejects configurable whole-word prohibited terms from `PUBLIC_CONTENT_PROHIBITED_TERMS`, repeated-link spam, and text exceeding existing schema limits. It runs on public listing, shop, event, Bender, volunteer, talent, and profile text before persistence. Private message bodies are not scanned; they are protected by report and block controls.

Admin hydration returns a generic target summary and preserves tenant scope.

- [ ] **Step 4: Run migration and all report/admin tests**

Run:

```bash
cd the-bend-backend
.venv/bin/alembic upgrade head
.venv/bin/pytest tests/test_generic_reports.py tests/test_content_moderation.py -q
.venv/bin/pytest -q
```

Expected: all tests PASS; existing listing reports appear as generic listing reports.

- [ ] **Step 5: Commit moderation and reports**

```bash
git add the-bend-backend/app/models/report.py the-bend-backend/app/models/report_audit.py the-bend-backend/app/services/report_service.py the-bend-backend/app/services/content_moderation_service.py the-bend-backend/app/config.py the-bend-backend/.env.example the-bend-backend/app/schemas/moderation.py the-bend-backend/app/api/v1/safety.py the-bend-backend/app/api/v1/listings.py the-bend-backend/app/api/v1/shops.py the-bend-backend/app/api/v1/events.py the-bend-backend/app/api/v1/bender.py the-bend-backend/app/api/v1/messages.py the-bend-backend/app/api/v1/admin.py the-bend-backend/alembic/versions/nat004_generalize_reports.py the-bend-backend/tests/test_generic_reports.py the-bend-backend/tests/test_content_moderation.py
git commit -m "feat(safety): report and filter all community content"
```

---

### Task 7: Add complete account deletion with immediate lock and background erasure

**Files:**
- Create: `app/models/account_deletion.py`
- Create: `app/schemas/account.py`
- Create: `app/services/account_deletion_service.py`
- Create: `app/api/v1/account.py`
- Create: `app/workers/account_tasks.py`
- Modify: `app/api/v1/router.py`
- Modify: `app/models/user.py`
- Modify: `app/services/auth_service.py`
- Create: `alembic/versions/nat005_add_account_deletions.py`
- Test: `tests/test_account_deletion.py`

**Interfaces:**
- Produces: `POST /api/v1/account/deletion/confirm` with `{password, send_confirmation}`.
- Produces: `GET /api/v1/account/deletion/status`.
- Produces Celery task `app.workers.account_tasks.erase_account(deletion_id: str)`.

- [ ] **Step 1: Write failing immediate-lock and erasure tests**

```python
@pytest.mark.asyncio
async def test_confirm_deletion_locks_account_and_revokes_sessions(service, member):
    request = await service.confirm(member, "correct-password", send_confirmation=False)
    assert request.status == "pending"
    assert member.is_active is False
    assert await active_refresh_count(member.id) == 0
    assert await active_installation_count(member.id) == 0

@pytest.mark.asyncio
async def test_erasure_anonymizes_shared_messages_and_removes_private_media(service, deletion):
    await service.erase(deletion.id)
    member = await load_user(deletion.user_id)
    assert member.name == "Deleted member"
    assert member.email.endswith("@deleted.invalid")
    assert member.phone is None and member.avatar_url is None
    assert (await shared_message()).sender_display_name == "Deleted member"
```

- [ ] **Step 2: Confirm deletion tests fail**

Run: `cd the-bend-backend && .venv/bin/pytest tests/test_account_deletion.py -q`

Expected: FAIL because deletion persistence and services do not exist.

- [ ] **Step 3: Implement confirmation, lock, idempotent erasure, and completion email**

The confirmation transaction verifies the password, creates one active deletion request, sets `User.is_active=False`, revokes all `RefreshSession` rows, disables all installations, and queues the Celery task after commit.

Set `revision = "nat005"` and `down_revision = "nat004"` in the migration.

The worker removes saved items, preferences, device rows, profile/contact fields, volunteer/talent profiles, owned private uploads, and account identity. To preserve current message and moderation foreign keys, retain only an inert referential tombstone row: set the name to `Deleted member`, replace email with `deleted-{user_id}@deleted.invalid`, replace the password hash with an unusable random hash, clear phone/avatar/shop/profile fields, and keep `is_active=False`. This row is not a recoverable account and contains no former identity. Shared messages therefore remain and hydrate the tombstone name without retaining personal fields. Retain only legally required detached transaction/moderation records, send an optional completion email, then clear that email from the request row. Every step is idempotent so retries cannot resurrect or duplicate state.

- [ ] **Step 4: Run migration, worker, and auth regressions**

Run:

```bash
cd the-bend-backend
.venv/bin/alembic upgrade head
.venv/bin/pytest tests/test_account_deletion.py tests/test_refresh_sessions.py -q
.venv/bin/pytest -q
```

Expected: all tests PASS; deleted users cannot refresh or sign in.

- [ ] **Step 5: Commit account deletion**

```bash
git add the-bend-backend/app/models/account_deletion.py the-bend-backend/app/schemas/account.py the-bend-backend/app/services/account_deletion_service.py the-bend-backend/app/api/v1/account.py the-bend-backend/app/workers/account_tasks.py the-bend-backend/app/api/v1/router.py the-bend-backend/app/models/user.py the-bend-backend/app/services/auth_service.py the-bend-backend/alembic/versions/nat005_add_account_deletions.py the-bend-backend/tests/test_account_deletion.py
git commit -m "feat(account): add complete member deletion"
```

---

### Task 8: Add native capabilities and authoritative checkout verification

**Files:**
- Create: `app/schemas/capabilities.py`
- Create: `app/services/capabilities_service.py`
- Create: `app/api/v1/capabilities.py`
- Modify: `app/api/v1/router.py`
- Modify: `app/config.py`
- Modify: `app/api/v1/advertising.py`
- Modify: `app/api/v1/events.py`
- Test: `tests/test_native_capabilities.py`
- Test: `tests/test_checkout_verification.py`

**Interfaces:**
- Produces: `GET /api/v1/capabilities/native` with the roadmap response.
- Produces: `GET /api/v1/checkout/status/{kind}/{session_id}` returning `{status, target_type, target_id}`.
- Status is one of `pending`, `paid`, `complete`, `cancelled`, `not_found`; success requires server-owned record plus Stripe/webhook verification.

- [ ] **Step 1: Write failing capability and forged-session tests**

```python
async def test_native_capabilities_are_westmoreland_scoped(client, westmoreland_headers):
    data = (await client.get("/api/v1/capabilities/native", headers=westmoreland_headers)).json()
    assert data["tenant_slug"] == "westmoreland"

async def test_checkout_status_rejects_foreign_or_unknown_session(client, westmoreland_headers):
    response = await client.get("/api/v1/checkout/status/event/cs_forged", headers=westmoreland_headers)
    assert response.status_code == 404
```

- [ ] **Step 2: Confirm capability/checkout tests fail**

Run: `cd the-bend-backend && .venv/bin/pytest tests/test_native_capabilities.py tests/test_checkout_verification.py -q`

Expected: FAIL because endpoints do not exist.

- [ ] **Step 3: Implement capability switch and unified checkout status**

Add `NATIVE_COMMERCE_ENABLED: bool = True`, support/privacy/deletion URLs, and a capability service that returns commerce false outside Westmoreland or when disabled.

The checkout-status service first finds the tenant-owned sponsor/event/connector record by session ID, then uses the tenant's Stripe key only when local webhook state is not final. It never accepts a success/cancel URL as evidence and never returns the Stripe session ID.

- [ ] **Step 4: Run focused and Stripe regression tests**

Run:

```bash
cd the-bend-backend
.venv/bin/pytest tests/test_native_capabilities.py tests/test_checkout_verification.py tests/test_sponsor_notify.py -q
.venv/bin/pytest -q
```

Expected: all tests PASS.

- [ ] **Step 5: Commit native capability and checkout verification**

```bash
git add the-bend-backend/app/schemas/capabilities.py the-bend-backend/app/services/capabilities_service.py the-bend-backend/app/api/v1/capabilities.py the-bend-backend/app/api/v1/router.py the-bend-backend/app/config.py the-bend-backend/app/api/v1/advertising.py the-bend-backend/app/api/v1/events.py the-bend-backend/tests/test_native_capabilities.py the-bend-backend/tests/test_checkout_verification.py
git commit -m "feat(native): verify commerce and publish capabilities"
```

---

## Plan 2 exit gate

Run all migrations against a disposable copy of production-shaped PostgreSQL, then:

```bash
cd the-bend-backend
.venv/bin/pytest -q
.venv/bin/celery -A app.workers.celery_app inspect registered
```

Use APNs sandbox and a Firebase test project on real registered devices to prove all four push categories, invalid-token cleanup, preference opt-out, and notification routing payloads. Also prove cross-tenant rejection, bidirectional message blocking, hidden blocked content, every report target, moderator resolution, immediate deletion lock plus completed erasure, capability-off behavior, and forged checkout rejection. Provider mocks alone do not satisfy this gate.
