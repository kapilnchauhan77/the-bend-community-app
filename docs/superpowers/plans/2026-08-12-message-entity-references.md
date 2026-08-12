# Message Entity References Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a message reference a Listing, Business (Shop), Bender post, or User, rendered inline as a tappable, server-hydrated preview card.

**Architecture:** Two nullable polymorphic columns (`reference_type`, `reference_id`) on `Message` mirror the existing `attachment_*` pattern. A single `reference_service.resolve_reference()` turns `(type, id, tenant)` into a compact card payload (or `None`), and is reused by send-validation, message hydration, and a new search endpoint. Frontend adds a `MessageReferenceCard`, a composer picker, and "Send in a message" share buttons.

**Tech Stack:** FastAPI, async SQLAlchemy 2, Alembic, Pydantic v2, React 19 + TypeScript, Zustand, axios, react-router 7.

## Global Constraints

- Reference types are exactly: `listing`, `shop`, `bender`, `user` (VARCHAR(16), no Postgres enum).
- No foreign keys on the reference columns (polymorphic; must degrade gracefully).
- One reference per message. A message needs **content OR attachment_url OR reference**. A message must **not** carry both `attachment_url` and a reference (v1 mutual exclusion). Text may accompany either.
- Tenant scoping: a reference must resolve within the thread's tenant, else it is rejected at send / rendered `unavailable`.
- Backend tests use `pytest` run against a venv with deps (`fastapi sqlalchemy[asyncio] asyncpg pydantic-settings stripe httpx email-validator python-jose[cryptography] passlib[bcrypt] pytest pytest-asyncio`), matching the pattern used for `tests/test_sponsor_notify.py`. Resolver/validator unit tests mock the DB session (no live Postgres needed).
- Frontend has no test runner; frontend task gates are `npm run build` + `npm run lint` clean, plus the stated manual/browser check.
- Bender per-post link is `/bender?post={id}` (query param, no new route). User link is `/business/{shop_id}` when the user has a shop, else `null` (non-clickable card).

---

### Task 1: Add reference columns to Message (model + migration)

**Files:**
- Modify: `the-bend-backend/app/models/message.py` (Message class, after `attachment_thumbnail_url`)
- Create: `the-bend-backend/alembic/versions/<rev>_message_reference_columns.py`

**Interfaces:**
- Produces: `Message.reference_type: str | None`, `Message.reference_id: uuid.UUID | None`.

- [ ] **Step 1: Add columns to the model**

In `app/models/message.py`, inside `class Message`, after the `attachment_thumbnail_url` line:

```python
    # A message may reference one community entity (listing/shop/bender/user),
    # rendered as a preview card. Polymorphic + FK-less so a reference degrades
    # gracefully if the target is later deleted. Mirrors the attachment_* pattern.
    reference_type: Mapped[str | None] = mapped_column(String(16))
    reference_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
```

- [ ] **Step 2: Create the Alembic migration**

Find the current head: `cd the-bend-backend && alembic heads` (note the revision id for `down_revision`).

Create `alembic/versions/<rev>_message_reference_columns.py`:

```python
"""message reference columns

Revision ID: msg_ref_cols
Revises: <CURRENT_HEAD>
Create Date: 2026-08-12
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "msg_ref_cols"
down_revision = "<CURRENT_HEAD>"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("messages", sa.Column("reference_type", sa.String(length=16), nullable=True))
    op.add_column("messages", sa.Column("reference_id", UUID(as_uuid=True), nullable=True))


def downgrade():
    op.drop_column("messages", "reference_id")
    op.drop_column("messages", "reference_type")
```

- [ ] **Step 3: Verify migration applies against a scratch check**

Run: `cd the-bend-backend && python -c "import ast; ast.parse(open('alembic/versions/<rev>_message_reference_columns.py').read()); print('ok')"`
Expected: `ok` (full `alembic upgrade head` runs on deploy against Postgres; syntax check here).

- [ ] **Step 4: Commit**

```bash
git add the-bend-backend/app/models/message.py the-bend-backend/alembic/versions/*message_reference*.py
git commit -m "feat(messages): add reference_type/reference_id columns to Message"
```

---

### Task 2: Reference resolver service

**Files:**
- Create: `the-bend-backend/app/services/reference_service.py`
- Test: `the-bend-backend/tests/test_reference_service.py`

**Interfaces:**
- Produces:
  - `REFERENCE_TYPES: set[str] = {"listing", "shop", "bender", "user"}`
  - `async def resolve_reference(db, tenant_id: UUID | None, ref_type: str, ref_id: UUID) -> dict | None`
    returns `{"type","id","title","subtitle","image_url","url"}` or `None`.

- [ ] **Step 1: Write the failing test**

`tests/test_reference_service.py`:

```python
import types, uuid
import pytest
from app.services import reference_service as rs


class _Result:
    def __init__(self, obj): self._obj = obj
    def scalar_one_or_none(self): return self._obj
    def scalars(self): return self
    def all(self): return [self._obj] if self._obj is not None else []


class _DB:
    """Returns queued objects from execute(), in order."""
    def __init__(self, objs): self._objs = list(objs)
    async def execute(self, _q): return _Result(self._objs.pop(0) if self._objs else None)


def _tenant(): return uuid.uuid4()


@pytest.mark.asyncio
async def test_listing_card():
    tid = _tenant()
    listing = types.SimpleNamespace(
        id=uuid.uuid4(), tenant_id=tid, title="Spare oven",
        category=types.SimpleNamespace(value="equipment"),
        urgency=types.SimpleNamespace(value="urgent"),
        images=[types.SimpleNamespace(url="/uploads/a.jpg", thumbnail_url="/uploads/a_t.jpg", sort_order=0)],
    )
    db = _DB([listing])
    card = await rs.resolve_reference(db, tid, "listing", listing.id)
    assert card["type"] == "listing"
    assert card["title"] == "Spare oven"
    assert card["subtitle"] == "equipment · urgent"
    assert card["image_url"] == "/uploads/a_t.jpg"
    assert card["url"] == f"/listing/{listing.id}"


@pytest.mark.asyncio
async def test_cross_tenant_returns_none():
    listing = types.SimpleNamespace(id=uuid.uuid4(), tenant_id=uuid.uuid4(), title="x",
                                    category=types.SimpleNamespace(value="c"),
                                    urgency=types.SimpleNamespace(value="normal"), images=[])
    db = _DB([listing])
    card = await rs.resolve_reference(db, _tenant(), "listing", listing.id)  # different tenant
    assert card is None


@pytest.mark.asyncio
async def test_missing_returns_none():
    db = _DB([None])
    assert await rs.resolve_reference(db, _tenant(), "listing", uuid.uuid4()) is None


@pytest.mark.asyncio
async def test_unknown_type_returns_none():
    assert await rs.resolve_reference(_DB([]), _tenant(), "bogus", uuid.uuid4()) is None


@pytest.mark.asyncio
async def test_user_with_shop_links_to_business():
    tid = _tenant(); sid = uuid.uuid4()
    user = types.SimpleNamespace(id=uuid.uuid4(), tenant_id=tid, name="Dana",
                                 avatar_url=None, shop_id=sid,
                                 role=types.SimpleNamespace(value="shop_admin"))
    card = await rs.resolve_reference(_DB([user]), tid, "user", user.id)
    assert card["url"] == f"/business/{sid}"


@pytest.mark.asyncio
async def test_user_without_shop_has_null_url():
    tid = _tenant()
    user = types.SimpleNamespace(id=uuid.uuid4(), tenant_id=tid, name="Sam",
                                 avatar_url=None, shop_id=None,
                                 role=types.SimpleNamespace(value="individual"))
    card = await rs.resolve_reference(_DB([user]), tid, "user", user.id)
    assert card["url"] is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd the-bend-backend && ../.venv-test/bin/python -m pytest tests/test_reference_service.py -q` (create the venv per Global Constraints if absent)
Expected: FAIL — `ModuleNotFoundError: app.services.reference_service`.

- [ ] **Step 3: Write the resolver**

`app/services/reference_service.py`:

```python
"""Resolve a polymorphic message reference to a compact preview card.

Single source of truth for send-validation, message hydration, and the
composer search endpoint. Returns None when the target does not exist or is
not visible in the given tenant, so callers can reject-on-send or render an
"unavailable" card.
"""
from uuid import UUID
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models.listing import Listing
from app.models.shop import Shop
from app.models.bender import BenderPost
from app.models.user import User

REFERENCE_TYPES: set[str] = {"listing", "shop", "bender", "user"}


def _tenant_ok(obj_tenant_id, tenant_id) -> bool:
    # A reference is visible when the target shares the thread's tenant. Both
    # None (single-tenant/local) also matches.
    return obj_tenant_id == tenant_id


async def resolve_reference(db, tenant_id: UUID | None, ref_type: str, ref_id: UUID) -> dict | None:
    if ref_type not in REFERENCE_TYPES:
        return None

    if ref_type == "listing":
        res = await db.execute(
            select(Listing).options(selectinload(Listing.images)).where(Listing.id == ref_id)
        )
        obj = res.scalar_one_or_none()
        if not obj or not _tenant_ok(obj.tenant_id, tenant_id):
            return None
        imgs = sorted(obj.images or [], key=lambda i: i.sort_order)
        image_url = (imgs[0].thumbnail_url or imgs[0].url) if imgs else None
        return {
            "type": "listing", "id": str(obj.id), "title": obj.title,
            "subtitle": f"{obj.category.value} · {obj.urgency.value}",
            "image_url": image_url, "url": f"/listing/{obj.id}",
        }

    if ref_type == "shop":
        res = await db.execute(select(Shop).where(Shop.id == ref_id))
        obj = res.scalar_one_or_none()
        if not obj or not _tenant_ok(obj.tenant_id, tenant_id):
            return None
        return {
            "type": "shop", "id": str(obj.id), "title": obj.name,
            "subtitle": obj.business_type, "image_url": obj.avatar_url,
            "url": f"/business/{obj.id}",
        }

    if ref_type == "bender":
        res = await db.execute(select(BenderPost).where(BenderPost.id == ref_id))
        obj = res.scalar_one_or_none()
        if not obj or not _tenant_ok(obj.tenant_id, tenant_id):
            return None
        author = await db.execute(select(User).where(User.id == obj.author_user_id))
        author = author.scalar_one_or_none()
        caption = (obj.caption or "").strip()
        title = (caption[:80] + "…") if len(caption) > 80 else (caption or "Bender post")
        return {
            "type": "bender", "id": str(obj.id), "title": title,
            "subtitle": author.name if author else "",
            "image_url": obj.media_thumbnail_url or obj.media_url,
            "url": f"/bender?post={obj.id}",
        }

    # user
    res = await db.execute(select(User).where(User.id == ref_id))
    obj = res.scalar_one_or_none()
    if not obj or not _tenant_ok(obj.tenant_id, tenant_id):
        return None
    subtitle = obj.role.value.replace("_", " ").title()
    return {
        "type": "user", "id": str(obj.id), "title": obj.name,
        "subtitle": subtitle, "image_url": obj.avatar_url,
        "url": f"/business/{obj.shop_id}" if obj.shop_id else None,
    }
```

> Confirmed: `User` has a `tenant_id` column, so the `_tenant_ok` check applies uniformly to all four types. In the `test_user_*` tests, set the user's `tenant_id` equal to the tenant passed in (already done above).

- [ ] **Step 4: Run tests to verify they pass**

Run: `../.venv-test/bin/python -m pytest tests/test_reference_service.py -q`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add the-bend-backend/app/services/reference_service.py the-bend-backend/tests/test_reference_service.py
git commit -m "feat(messages): reference resolver service with per-type cards + tenant scoping"
```

---

### Task 3: Send path — schema, validation, storage

**Files:**
- Modify: `the-bend-backend/app/schemas/message.py` (`SendMessageRequest`)
- Modify: `the-bend-backend/app/services/message_service.py` (`send_message`)
- Modify: `the-bend-backend/app/api/v1/messages.py` (`send_message` route)
- Modify: `the-bend-backend/app/repositories/message_repo.py` (`create_message` — add reference params)
- Test: `the-bend-backend/tests/test_send_message_reference.py`

**Interfaces:**
- Consumes: `reference_service.resolve_reference` (Task 2).
- Produces: `message_service.send_message(..., reference_type=None, reference_id=None)`; `SendMessageRequest.reference_type/reference_id`.

- [ ] **Step 1: Write the failing validator test**

`tests/test_send_message_reference.py`:

```python
import pytest
from pydantic import ValidationError
from app.schemas.message import SendMessageRequest


def test_reference_only_is_valid():
    r = SendMessageRequest(reference_type="listing", reference_id="1a2b")
    assert r.reference_type == "listing"


def test_empty_message_rejected():
    with pytest.raises(ValidationError):
        SendMessageRequest()


def test_attachment_plus_reference_rejected():
    with pytest.raises(ValidationError):
        SendMessageRequest(attachment_url="/u/a.jpg", attachment_type="image",
                           reference_type="listing", reference_id="1a2b")


def test_reference_requires_both_fields():
    with pytest.raises(ValidationError):
        SendMessageRequest(reference_type="listing")  # missing id
```

- [ ] **Step 2: Run to verify it fails**

Run: `../.venv-test/bin/python -m pytest tests/test_send_message_reference.py -q`
Expected: FAIL — `SendMessageRequest` has no `reference_type`.

- [ ] **Step 3: Update the schema**

In `app/schemas/message.py`, add to `SendMessageRequest` (after the attachment fields) and extend the validator:

```python
    reference_type: Literal['listing', 'shop', 'bender', 'user'] | None = None
    reference_id: str | None = None
```

Replace the `_require_content_or_attachment` validator body with:

```python
    @model_validator(mode="after")
    def _require_content_or_attachment(self) -> "SendMessageRequest":
        has_text = bool(self.content and self.content.strip())
        has_attachment = bool(self.attachment_url)
        has_reference = bool(self.reference_type and self.reference_id)
        if self.reference_type and not self.reference_id:
            raise ValueError("reference_id is required when reference_type is set")
        if self.reference_id and not self.reference_type:
            raise ValueError("reference_type is required when reference_id is set")
        if has_attachment and has_reference:
            raise ValueError("A message cannot have both an attachment and a reference")
        if not (has_text or has_attachment or has_reference):
            raise ValueError("Message must include content, an attachment_url, or a reference")
        return self
```

- [ ] **Step 4: Run validator test to verify pass**

Run: `../.venv-test/bin/python -m pytest tests/test_send_message_reference.py -q`
Expected: PASS.

- [ ] **Step 5: Thread reference through the repo + service**

In `app/repositories/message_repo.py`, extend `create_message` signature and the `Message(...)` construction to accept and set `reference_type=None, reference_id=None` (add the two kwargs, pass to the model).

In `app/services/message_service.py` `send_message`, add params `reference_type: str | None = None, reference_id=None`. After the participant check and before creating the message, resolve+validate:

```python
        from uuid import UUID as _UUID
        ref_type = ref_id = None
        if reference_type and reference_id:
            from app.services.reference_service import resolve_reference
            from app.core.exceptions import ValidationError as AppValidationError
            thread = await self.message_repo.get_thread_by_id(thread_id)
            tenant_id = thread.tenant_id if thread else None
            ref_id = reference_id if isinstance(reference_id, _UUID) else _UUID(str(reference_id))
            card = await resolve_reference(self.db, tenant_id, reference_type, ref_id)
            if card is None:
                raise AppValidationError("Referenced item is unavailable")
            ref_type = reference_type
```

Pass `reference_type=ref_type, reference_id=ref_id` into `create_message(...)`. Extend the notification-body branch: after the attachment branch, before the final `else`, add `elif ref_type:` → `notif_body = "You have a new message"` (keep simple; or `f"Shared a {ref_type}"`).

In `app/api/v1/messages.py` `send_message` route, pass the new fields from the request:

```python
    return await service.send_message(
        thread_id, current_user.id, data.content,
        attachment_url=data.attachment_url,
        attachment_type=data.attachment_type,
        attachment_thumbnail_url=data.attachment_thumbnail_url,
        reference_type=data.reference_type,
        reference_id=data.reference_id,
    )
```

> Confirmed: `app/core/exceptions.ValidationError` maps to HTTP 400 — use it directly (`from app.core.exceptions import ValidationError`).

- [ ] **Step 6: Commit**

```bash
git add the-bend-backend/app/schemas/message.py the-bend-backend/app/services/message_service.py the-bend-backend/app/api/v1/messages.py the-bend-backend/app/repositories/message_repo.py the-bend-backend/tests/test_send_message_reference.py
git commit -m "feat(messages): accept + validate + store entity reference on send"
```

---

### Task 4: Hydrate reference into message responses + thread preview

**Files:**
- Modify: `the-bend-backend/app/schemas/message.py` (`MessageResponse`)
- Modify: `the-bend-backend/app/services/message_service.py` (`get_thread_messages` items, thread last-message preview)
- Test: `the-bend-backend/tests/test_message_hydration.py`

**Interfaces:**
- Consumes: `resolve_reference` (Task 2), `Message.reference_type/reference_id` (Task 1).
- Produces: `MessageResponse.reference: dict | None`.

- [ ] **Step 1: Write the failing test (helper that builds a message dict includes reference)**

Add a small pure helper in `message_service.py` so it is unit-testable, then test it.

`tests/test_message_hydration.py`:

```python
import types, uuid, pytest
from app.services.message_service import build_message_reference

class _Result:
    def __init__(self, obj): self._obj = obj
    def scalar_one_or_none(self): return self._obj
    def scalars(self): return self
    def all(self): return []
class _DB:
    def __init__(self, obj): self._obj = obj
    async def execute(self, _q): return _Result(self._obj)

@pytest.mark.asyncio
async def test_present_reference_hydrates_card():
    shop = types.SimpleNamespace(id=uuid.uuid4(), tenant_id=None, name="Bakery",
                                 business_type="Food", avatar_url=None)
    m = types.SimpleNamespace(reference_type="shop", reference_id=shop.id)
    card = await build_message_reference(_DB(shop), None, m)
    assert card["type"] == "shop" and card["title"] == "Bakery"

@pytest.mark.asyncio
async def test_missing_reference_marked_unavailable():
    m = types.SimpleNamespace(reference_type="shop", reference_id=uuid.uuid4())
    card = await build_message_reference(_DB(None), None, m)
    assert card == {"type": "shop", "id": str(m.reference_id), "unavailable": True}

@pytest.mark.asyncio
async def test_no_reference_returns_none():
    m = types.SimpleNamespace(reference_type=None, reference_id=None)
    assert await build_message_reference(_DB(None), None, m) is None
```

- [ ] **Step 2: Run to verify it fails**

Run: `../.venv-test/bin/python -m pytest tests/test_message_hydration.py -q`
Expected: FAIL — `build_message_reference` not defined.

- [ ] **Step 3: Add the helper + wire hydration**

In `message_service.py` (module level or static method):

```python
async def build_message_reference(db, tenant_id, m):
    if not m.reference_type or not m.reference_id:
        return None
    from app.services.reference_service import resolve_reference
    card = await resolve_reference(db, tenant_id, m.reference_type, m.reference_id)
    if card is None:
        return {"type": m.reference_type, "id": str(m.reference_id), "unavailable": True}
    return card
```

In `get_thread_messages`, resolve the thread's tenant once, then set `"reference": await build_message_reference(self.db, tenant_id, m)` on each message dict. In `MessageResponse` add `reference: dict | None = None`.

For the thread list preview (`get_threads`, the `last_message` block), when `last_message.reference_type` is set and there is no text, set the preview text to `f"🔗 Shared a {last_message.reference_type}"` (mirrors the existing 📷/🎤 logic). Include `reference_type` in the `last_message` dict.

- [ ] **Step 4: Run to verify pass**

Run: `../.venv-test/bin/python -m pytest tests/test_message_hydration.py -q`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add the-bend-backend/app/schemas/message.py the-bend-backend/app/services/message_service.py the-bend-backend/tests/test_message_hydration.py
git commit -m "feat(messages): hydrate reference card into message + thread preview"
```

---

### Task 5: Reference search endpoint

**Files:**
- Modify: `the-bend-backend/app/api/v1/messages.py` (new route)
- Modify: `the-bend-backend/app/services/reference_service.py` (add `search_references`)
- Test: `the-bend-backend/tests/test_reference_search.py`

**Interfaces:**
- Produces: `GET /api/v1/messages/reference-search?q=&type=` → `{ "items": [card, ...] }`; `reference_service.search_references(db, tenant_id, q, type_filter) -> list[dict]`.

- [ ] **Step 1: Write the failing test**

`tests/test_reference_search.py`:

```python
import types, uuid, pytest
from app.services import reference_service as rs

class _Result:
    def __init__(self, rows): self._rows = rows
    def scalars(self): return self
    def all(self): return self._rows
class _DB:
    def __init__(self, rows): self._rows = rows
    async def execute(self, _q): return _Result(self._rows)

@pytest.mark.asyncio
async def test_search_shops_returns_cards():
    tid = uuid.uuid4()
    shop = types.SimpleNamespace(id=uuid.uuid4(), tenant_id=tid, name="Blue Bakery",
                                 business_type="Food", avatar_url=None)
    items = await rs.search_references(_DB([shop]), tid, "blue", "shop")
    assert items and items[0]["type"] == "shop" and items[0]["title"] == "Blue Bakery"
```

- [ ] **Step 2: Run to verify it fails**

Run: `../.venv-test/bin/python -m pytest tests/test_reference_search.py -q`
Expected: FAIL — `search_references` not defined.

- [ ] **Step 3: Implement `search_references`**

In `reference_service.py`, add a function that runs a case-insensitive `ILIKE` per requested type (limit 8 each), tenant-scoped, and maps rows to the same card shape as `resolve_reference` (reuse small per-type card builders — extract `_listing_card(obj)`, `_shop_card(obj)`, `_bender_card(obj, author)`, `_user_card(obj)` so `resolve_reference` and `search_references` share them; update Task 2 code to call these builders). Search fields: listing → `title`; shop → `name`; user → `name`; bender → `caption`. When `type_filter` is None, search all four and concatenate.

```python
async def search_references(db, tenant_id, q, type_filter=None):
    q = (q or "").strip()
    if not q:
        return []
    like = f"%{q}%"
    out = []
    types_ = [type_filter] if type_filter in REFERENCE_TYPES else list(REFERENCE_TYPES)
    if "listing" in types_:
        rows = (await db.execute(select(Listing).options(selectinload(Listing.images))
                .where(Listing.tenant_id == tenant_id, Listing.title.ilike(like)).limit(8))).scalars().all()
        out += [_listing_card(o) for o in rows]
    if "shop" in types_:
        rows = (await db.execute(select(Shop).where(Shop.tenant_id == tenant_id, Shop.name.ilike(like)).limit(8))).scalars().all()
        out += [_shop_card(o) for o in rows]
    if "user" in types_:
        rows = (await db.execute(select(User).where(User.name.ilike(like)).limit(8))).scalars().all()
        out += [_user_card(o) for o in rows]
    if "bender" in types_:
        rows = (await db.execute(select(BenderPost).where(BenderPost.tenant_id == tenant_id, BenderPost.caption.ilike(like)).limit(8))).scalars().all()
        out += [await _bender_card_async(db, o) for o in rows]
    return out
```

(Extract the card builders from Task 2; `_bender_card_async` fetches the author name.)

- [ ] **Step 4: Add the route**

In `app/api/v1/messages.py`:

```python
@router.get("/reference-search")
async def reference_search(
    q: str,
    type: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    tenant: Tenant | None = Depends(get_current_tenant),
):
    from app.services.reference_service import search_references
    items = await search_references(db, tenant.id if tenant else None, q, type)
    return {"items": items}
```

(Match the existing auth dependency names used elsewhere in this router.)

- [ ] **Step 5: Run to verify pass**

Run: `../.venv-test/bin/python -m pytest tests/test_reference_search.py tests/test_reference_service.py -q`
Expected: PASS (all).

- [ ] **Step 6: Commit**

```bash
git add the-bend-backend/app/api/v1/messages.py the-bend-backend/app/services/reference_service.py the-bend-backend/tests/test_reference_search.py
git commit -m "feat(messages): reference-search endpoint for composer picker"
```

---

### Task 6: Frontend API + types

**Files:**
- Modify: `the-bend-frontend/src/services/messageApi.ts`
- Modify: message types (find with `grep -rn "attachment_type" the-bend-frontend/src/types the-bend-frontend/src/stores`)

**Interfaces:**
- Produces: `Message.reference?: ReferenceCard | null`; `messageApi.sendMessage(threadId, payload)` accepts `reference_type`/`reference_id`; `messageApi.referenceSearch(q, type?)`.

- [ ] **Step 1: Add the ReferenceCard type + extend Message**

Where the `Message` type is declared, add:

```ts
export interface ReferenceCard {
  type: 'listing' | 'shop' | 'bender' | 'user';
  id: string;
  title?: string;
  subtitle?: string;
  image_url?: string | null;
  url?: string | null;
  unavailable?: boolean;
}
```
Add `reference?: ReferenceCard | null;` to `Message`.

- [ ] **Step 2: Extend the send payload + add search call**

In `messageApi.ts`, extend the send payload type with `reference_type?: string; reference_id?: string;` and add:

```ts
  referenceSearch: (q: string, type?: string) =>
    api.get('/messages/reference-search', { params: { q, ...(type ? { type } : {}) } }),
```

- [ ] **Step 3: Verify build + lint**

Run: `cd the-bend-frontend && npm run build && npm run lint`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add the-bend-frontend/src/services/messageApi.ts the-bend-frontend/src/types the-bend-frontend/src/stores
git commit -m "feat(messages): frontend types + api for entity references"
```

---

### Task 7: MessageReferenceCard + render in bubble & thread list

**Files:**
- Create: `the-bend-frontend/src/components/features/messages/MessageReferenceCard.tsx`
- Modify: `the-bend-frontend/src/pages/MessagesPage.tsx` (`MessageBubble`, `ThreadListItem` preview)

**Interfaces:**
- Consumes: `ReferenceCard` (Task 6).
- Produces: `<MessageReferenceCard card={...} />`.

- [ ] **Step 1: Create the component**

```tsx
import { useNavigate } from 'react-router-dom';
import { resolveAssetUrl } from '@/lib/...'; // match existing import used in MessagesPage
import type { ReferenceCard } from '...'; // match the types import path

const TYPE_LABEL: Record<string, string> = {
  listing: 'Listing', shop: 'Business', bender: 'Bender post', user: 'Person',
};

export function MessageReferenceCard({ card }: { card: ReferenceCard }) {
  const navigate = useNavigate();
  if (card.unavailable) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-2 text-sm text-gray-400">
        This {TYPE_LABEL[card.type] ?? 'item'} is no longer available.
      </div>
    );
  }
  const clickable = !!card.url;
  return (
    <div
      role={clickable ? 'button' : undefined}
      onClick={clickable ? () => navigate(card.url!) : undefined}
      className={`flex items-center gap-2 rounded-lg border border-gray-200 bg-white p-2 ${clickable ? 'cursor-pointer hover:bg-gray-50' : ''}`}
    >
      {card.image_url ? (
        <img src={resolveAssetUrl(card.image_url)} alt="" className="h-10 w-10 rounded object-cover" />
      ) : (
        <div className="h-10 w-10 rounded bg-gray-100" />
      )}
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wide text-gray-400">{TYPE_LABEL[card.type]}</div>
        <div className="truncate text-sm font-medium">{card.title}</div>
        {card.subtitle && <div className="truncate text-xs text-gray-500">{card.subtitle}</div>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Render in MessageBubble**

In `MessageBubble`, where attachments render, add: `{message.reference && <MessageReferenceCard card={message.reference} />}`. Keep it above/below the text consistent with attachment placement.

- [ ] **Step 3: Thread list preview**

In `ThreadListItem`'s `lastPreview`, before the text fallback, add: if `lastMsg.reference_type` (or the preview already contains "🔗 Shared") show that label. (Backend already emits `🔗 Shared a {type}` when text is empty.)

- [ ] **Step 4: Verify build + lint + browser**

Run: `cd the-bend-frontend && npm run build && npm run lint`
Manual/browser: with a message that has a reference (create one via API or Task 8), open the thread and confirm the card renders and navigates on tap; confirm an `unavailable` card renders muted.

- [ ] **Step 5: Commit**

```bash
git add the-bend-frontend/src/components/features/messages/MessageReferenceCard.tsx the-bend-frontend/src/pages/MessagesPage.tsx
git commit -m "feat(messages): render entity reference preview card in chat"
```

---

### Task 8: Composer reference picker

**Files:**
- Create: `the-bend-frontend/src/components/features/messages/ReferencePickerModal.tsx`
- Modify: `the-bend-frontend/src/pages/MessagesPage.tsx` (composer: "＋" menu, pending chip, send payload, mutual exclusion)

**Interfaces:**
- Consumes: `messageApi.referenceSearch` (Task 6), `ReferenceCard`.
- Produces: composer sends `reference_type`/`reference_id`.

- [ ] **Step 1: Build the modal**

`ReferencePickerModal.tsx`: a dialog with a search input, type filter chips (All/Listing/Business/Bender/Person), and a results list. Debounce input (~250ms), call `messageApi.referenceSearch(q, type)`, render each result via a compact row (reuse the visual of `MessageReferenceCard`, non-navigating). `onSelect(card)` returns the chosen card and closes.

- [ ] **Step 2: Wire into the composer**

In the composer area of `MessagesPage`: add a "＋"/paperclip menu entry "Reference" that opens the modal. On select, store `pendingReference` state and show a chip above the input (title + remove ✕). Disable the media-attach button while a reference is pending and vice-versa (mutual exclusion). On send, if `pendingReference` set, include `reference_type: pendingReference.type, reference_id: pendingReference.id` in the `sendMessage` payload and clear it after.

- [ ] **Step 3: Verify build + lint + browser**

Run: `cd the-bend-frontend && npm run build && npm run lint`
Manual/browser: open a thread → ＋ → Reference → search a listing → select → chip appears → send → the reference card appears in the conversation and navigates on tap.

- [ ] **Step 4: Commit**

```bash
git add the-bend-frontend/src/components/features/messages/ReferencePickerModal.tsx the-bend-frontend/src/pages/MessagesPage.tsx
git commit -m "feat(messages): in-chat reference picker"
```

---

### Task 9: Share-from-entity-page buttons + thread picker

**Files:**
- Create: `the-bend-frontend/src/components/features/messages/ShareToMessageButton.tsx` (button + thread-picker dialog)
- Modify: `the-bend-frontend/src/pages/ListingDetailPage.tsx`, `BusinessProfilePage.tsx`, `BenderPage.tsx` (post actions), and a user surface (`DirectoryPage.tsx` or the Talent/Volunteer card)
- Modify: `MessagesPage.tsx` to accept a pre-attached reference via navigation state

**Interfaces:**
- Consumes: `messageApi` (threads list + start thread), `ReferenceCard` shape (type+id).
- Produces: navigation to `/messages/:threadId` with `location.state = { pendingReference: {type, id} }`.

- [ ] **Step 1: Build `ShareToMessageButton`**

Props: `{ refType: 'listing'|'shop'|'bender'|'user'; refId: string }`. Renders a "Send in a message" button; on click opens a dialog listing existing threads (from `messageApi.getThreads`) plus a "Start new" recipient search (reuse the existing new-thread flow). On pick: ensure a thread exists (existing thread id, or `startThread`), then `navigate(`/messages/${threadId}`, { state: { pendingReference: { type: refType, id: refId } } })`.

- [ ] **Step 2: Consume pre-attached reference in MessagesPage**

In `MessagesPage`, read `useLocation().state?.pendingReference`; if present, set the composer's `pendingReference` (resolve its card lazily by calling `referenceSearch` is unnecessary — store `{type,id}` and let send use them; show a minimal chip with the type label until sent). Clear the navigation state after applying.

- [ ] **Step 3: Place the button**

Add `<ShareToMessageButton refType="listing" refId={listing.id} />` to `ListingDetailPage`; `refType="shop"` to `BusinessProfilePage`; `refType="bender"` on each bender post's action row in `BenderPage`; `refType="user"` on the user card in `DirectoryPage` (or Talent/Volunteer). Match each page's existing action-button styling.

- [ ] **Step 4: Verify build + lint + browser**

Run: `cd the-bend-frontend && npm run build && npm run lint`
Manual/browser: on a listing page, click "Send in a message" → pick a thread → land in the thread with the reference chip pre-attached → send → card renders.

- [ ] **Step 5: Commit**

```bash
git add the-bend-frontend/src/components/features/messages/ShareToMessageButton.tsx the-bend-frontend/src/pages/ListingDetailPage.tsx the-bend-frontend/src/pages/BusinessProfilePage.tsx the-bend-frontend/src/pages/BenderPage.tsx the-bend-frontend/src/pages/DirectoryPage.tsx the-bend-frontend/src/pages/MessagesPage.tsx
git commit -m "feat(messages): share-to-message buttons on entity pages"
```

---

### Task 10: Bender per-post deep-link focus

**Files:**
- Modify: `the-bend-frontend/src/pages/BenderPage.tsx`

**Interfaces:**
- Consumes: `?post={id}` query param.

- [ ] **Step 1: Read the query param and scroll**

In `BenderPage`, read `useSearchParams().get('post')`. After the feed loads, if set, `scrollIntoView` the matching post element (give each post a `ref`/`id={`post-${p.id}`}` anchor) and briefly highlight it (a ring class for ~2s).

- [ ] **Step 2: Verify build + lint + browser**

Run: `cd the-bend-frontend && npm run build && npm run lint`
Manual/browser: visit `/bender?post=<real id>` → the post scrolls into view and highlights. Then click a bender reference card in a message and confirm it lands there.

- [ ] **Step 3: Commit**

```bash
git add the-bend-frontend/src/pages/BenderPage.tsx
git commit -m "feat(bender): focus a post via ?post=:id for message references"
```

---

## Deployment (after all tasks)

- Backend: rebuild `bend-backend` image, recreate `backend` + `celery-worker` + `celery-beat` (start script runs `alembic upgrade head` → adds the two columns). Verify disk headroom first (`docker builder prune -af` if needed).
- Frontend: rebuild `bend-frontend`, recreate `frontend` (build sequentially after backend to avoid VM OOM).
- Smoke test in the running service: send a reference message via the composer and confirm the hydrated card renders; confirm a deleted-target message renders `unavailable`.

## Self-Review notes

- Spec §2 (columns) → Task 1. §3 (resolver) → Task 2. §4 (API: send/hydrate/search) → Tasks 3,4,5. §5a picker → Task 8. §5b share → Task 9. §5c rendering → Task 7. Bender deep-link → Task 10. User linking rule → Task 2 (`_user_card`). Frontend types/api → Task 6.
- Both previously-open points are now resolved in-plan: `User.tenant_id` exists (uniform tenant scoping) and `ValidationError` maps to HTTP 400.
