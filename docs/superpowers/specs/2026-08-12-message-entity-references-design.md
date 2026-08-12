# Message Entity References — Design Spec

**Date:** 2026-08-12
**Status:** Approved (design), pending spec review
**Feature:** Let a message reference a Listing, Business (Shop), Bender post, or User, rendered inline as a tappable preview card.

---

## 1. Summary

Users can attach a **reference** to one of four entity types inside a direct message:

- **Listing** (`/listing/:id`)
- **Business / Shop** (`/business/:shopId`)
- **Bender post** (community feed)
- **User** (person)

A message may carry text, and optionally **one** reference. The reference renders as a preview card (thumbnail + title + subtitle + type badge) that navigates to the entity on tap. Two entry points create the same underlying reference: an in-chat picker and "Send in a message" buttons on entity pages.

Non-goals (v1): multiple references per message; a reference **and** a media attachment in the same message; editing a reference after send; notification/email changes.

---

## 2. Data model (backend)

Add two nullable columns to `Message` (`app/models/message.py`), mirroring the existing `attachment_*` pattern (plain columns, no Postgres enum):

```python
reference_type: Mapped[str | None] = mapped_column(String(16))   # 'listing' | 'shop' | 'bender' | 'user'
reference_id:   Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
```

- **No foreign key.** The column is polymorphic across four tables, and FK-less storage lets a reference degrade gracefully (render "no longer available") if the target is later deleted.
- One reference per message.
- Alembic migration adds both columns (nullable) — legacy messages stay valid.

**Allowed types constant** lives in one place (e.g. `app/services/reference_service.py`): `{"listing", "shop", "bender", "user"}`.

---

## 3. Reference resolver service

New `app/services/reference_service.py` with one function used by both send-validation and message hydration:

```
async def resolve_reference(db, tenant_id, ref_type, ref_id) -> ReferenceCard | None
```

- Returns a compact card dict, or `None` if the entity does not exist / is not visible in `tenant_id`.
- **Tenant scoping:** the resolved entity must belong to the same tenant as the thread. A cross-tenant or invisible target resolves to `None`.

Card shape per type:

| type | title | subtitle | image_url | url |
|---|---|---|---|---|
| `listing` | `listing.title` | `category · urgency` | first listing photo | `/listing/{id}` |
| `shop` | `shop.name` | `business_type` | `shop.avatar_url` | `/business/{id}` |
| `bender` | caption snippet (≤80 chars) | author display name | first media / thumbnail | `/bender?post={id}` |
| `user` | `user.name` | role label (e.g. "Business owner · {shop name}") | `user.avatar_url` | see User linking below |

**Card payload returned to the client:**
```json
{ "type": "listing", "id": "...", "title": "...", "subtitle": "...", "image_url": "... | null", "url": "/listing/..." }
```
Unavailable target (deleted / not visible at hydration time):
```json
{ "type": "listing", "id": "...", "unavailable": true }
```

### User linking decision
No dedicated user-profile page exists (only `/directory` and `/business/:shopId`).
- If the user is shop-affiliated → `url = /business/{shop_id}`.
- If the user is an individual (no shop) → `url = null`; the card renders identity (name + avatar + role) but is **not** clickable.

(Open to revisiting if a public user-profile page is added later; the resolver is the single place to change.)

### Bender deep-link decision
No per-post route exists. Add a lightweight query param: `BenderPage` reads `?post={id}` and scrolls to / highlights that post. No new route entry needed.

---

## 4. API changes

**`SendMessageRequest`** (`app/schemas/message.py`) gains:
```python
reference_type: Literal['listing', 'shop', 'bender', 'user'] | None = None
reference_id: str | None = None
```
- Validator update: a message requires **content OR attachment_url OR reference**. If `reference_type` is set, `reference_id` must be set (and vice versa).
- v1 rule: reject a message that has **both** an `attachment_url` and a reference (mutually exclusive "extra"). Text may accompany either.

**Send handler** (`app/services/message_service.py`): before persisting, call `resolve_reference(...)`; if it returns `None`, raise a 400 ("Referenced item is unavailable"). On success, store `reference_type` + `reference_id`.

**`MessageResponse`** gains:
```python
reference: dict | None = None   # the resolved card, or {type,id,unavailable:true}
```
Message hydration resolves the card server-side so the client makes no extra fetches. (Batch note: hydrate references per message list; N is small per page — acceptable. If it becomes hot, batch by type later.)

**New search endpoint for the composer picker:** `GET /api/v1/messages/reference-search?q=&type=` (auth, tenant-scoped) returns up to ~8 matches per requested type across listings / shops / bender posts / users, each as a card payload. `type` optional (all types when omitted).

---

## 5. Frontend

### 5a. Composer picker (in-chat)
- A "＋" attach menu in the `MessagesPage` composer gains a **Reference** option (beside the existing media attach).
- Opens a search modal: a search box + type filter chips (All / Listing / Business / Bender / Person). Results come from `reference-search`. Tapping a result sets a **pending reference chip** shown above the input.
- Send includes `reference_type` + `reference_id`. The composer enforces: not both a media attachment and a reference pending at once.

### 5b. Share-from-entity-page
- A "Send in a message" action on: `ListingDetailPage`, `BusinessProfilePage`, a Bender post (in `BenderPage`), and a user surface (e.g. Directory entry / talent / volunteer card).
- Opens a **thread picker** (existing threads + "start new" recipient search). Selecting a target navigates to `/messages/:threadId` with the reference pre-attached in the composer (pending chip), ready to send with optional text.

### 5c. Rendering (`MessageBubble`)
- A new `MessageReferenceCard` component renders `message.reference`: thumbnail (or type icon fallback), title, subtitle, and a small type badge.
- Tap → `navigate(reference.url)` when `url` is present; non-clickable when `url` is null or `unavailable`.
- `unavailable: true` → muted card: "This item is no longer available."
- Thread list last-message preview: show a label like "🔗 Shared a listing" when the last message is reference-only (mirrors the existing "📷 Photo" / "🎤 Voice note" previews).

---

## 6. Components & boundaries

- **`reference_service.resolve_reference`** — the single source of truth for (a) send validation, (b) message hydration, (c) search-result cards. One place to change linking rules.
- **`MessageReferenceCard`** (frontend) — pure presentational, takes a card payload; no data fetching.
- **Reference search modal** and **thread picker** — self-contained components reused by both entry points.

---

## 7. Edge cases

- Cross-tenant / invisible target → rejected at send (400); if it becomes invisible later → `unavailable` card at hydration.
- Deleted entity → `unavailable` card (no crash; no FK).
- Individual user (no shop) → non-clickable identity card.
- Bender post with no media → type-icon fallback thumbnail.
- Both attachment and reference supplied → 400 (v1 mutual exclusion).
- Reference to self / the other participant is allowed (harmless).

---

## 8. Testing

**Backend (pytest, mirrors existing test style):**
- `resolve_reference` returns correct card per type; returns `None` for cross-tenant, missing, and wrong-type ids.
- Send validation: content-only, reference-only, text+reference all succeed; empty (no content/attachment/reference) rejected; attachment+reference rejected; unresolvable reference → 400.
- `MessageResponse` hydration includes the card; deleted target → `unavailable`.

**Frontend:**
- `MessageReferenceCard` renders each type and the unavailable state; navigates on tap only when `url` present.
- Composer enforces attachment/reference mutual exclusion.

---

## 9. Migration & rollout

- One Alembic migration (two nullable columns). No backfill.
- Backend deploy (rebuild backend image); frontend deploy (rebuild frontend image). No enum changes.
- Fully backward compatible: existing messages have `reference_type/id = NULL` and hydrate with `reference = null`.
