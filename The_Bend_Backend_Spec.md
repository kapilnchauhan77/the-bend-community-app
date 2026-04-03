# The Bend — Backend Specification

**Version:** 1.0
**Date:** April 3, 2026
**Stack:** Python 3.11+ · FastAPI · PostgreSQL · Redis · SQLAlchemy 2.0
**Companion Docs:** The_Bend_PRD.md, The_Bend_Frontend_Spec.md

---

## 1. Architecture Overview

```
                    ┌─────────────────┐
                    │   React PWA     │
                    │   (Frontend)    │
                    └────────┬────────┘
                             │
                    HTTPS / WSS
                             │
                    ┌────────▼────────┐
                    │   Nginx / CDN   │
                    │   (Reverse Proxy)│
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
     ┌────────▼──────┐ ┌────▼────┐ ┌──────▼───────┐
     │   FastAPI      │ │  WS     │ │  Background  │
     │   REST API     │ │  Server │ │  Workers     │
     │   (Uvicorn)    │ │  (Chat) │ │  (Celery)    │
     └───────┬────────┘ └────┬────┘ └──────┬───────┘
             │               │              │
     ┌───────▼───────────────▼──────────────▼──────┐
     │              PostgreSQL                      │
     │              (Primary DB)                    │
     └──────────────────┬──────────────────────────┘
                        │
     ┌──────────────────▼──────────────────────────┐
     │              Redis                           │
     │   (Cache · Sessions · Pub/Sub · Task Queue)  │
     └──────────────────────────────────────────────┘
                        │
     ┌──────────────────▼──────┐    ┌──────────────┐
     │      AWS S3 / Cloudinary│    │  SendGrid    │
     │      (File Storage)     │    │  (Email)     │
     └─────────────────────────┘    └──────────────┘
```

### Key Design Decisions
- **Async everywhere:** FastAPI with async SQLAlchemy (asyncpg driver) for non-blocking I/O
- **Repository pattern:** Database access through repository classes, not directly in route handlers
- **Service layer:** Business logic in service classes between routes and repositories
- **Dependency injection:** FastAPI's `Depends()` for auth, DB sessions, and services
- **Background tasks:** Celery + Redis for emails, push notifications, and scheduled jobs (expiry checks)

---

## 2. Project Structure

```
the-bend-backend/
├── alembic/                      # Database migrations
│   ├── versions/
│   └── env.py
├── app/
│   ├── __init__.py
│   ├── main.py                   # FastAPI app factory, middleware, startup/shutdown
│   ├── config.py                 # Settings (Pydantic BaseSettings, env vars)
│   ├── database.py               # Async engine, session factory, Base
│   │
│   ├── models/                   # SQLAlchemy ORM models
│   │   ├── __init__.py
│   │   ├── user.py
│   │   ├── shop.py
│   │   ├── listing.py
│   │   ├── message.py
│   │   ├── notification.py
│   │   ├── interest.py
│   │   ├── guideline.py
│   │   └── push_subscription.py
│   │
│   ├── schemas/                  # Pydantic request/response schemas
│   │   ├── __init__.py
│   │   ├── auth.py
│   │   ├── user.py
│   │   ├── shop.py
│   │   ├── listing.py
│   │   ├── message.py
│   │   ├── notification.py
│   │   └── admin.py
│   │
│   ├── api/                      # Route handlers (thin controllers)
│   │   ├── __init__.py
│   │   ├── deps.py               # Shared dependencies (get_db, get_current_user, etc.)
│   │   ├── v1/
│   │   │   ├── __init__.py
│   │   │   ├── router.py         # Aggregates all v1 routers
│   │   │   ├── auth.py
│   │   │   ├── shops.py
│   │   │   ├── listings.py
│   │   │   ├── messages.py
│   │   │   ├── notifications.py
│   │   │   ├── admin.py
│   │   │   ├── upload.py
│   │   │   └── health.py
│   │   └── ws/
│   │       ├── __init__.py
│   │       └── chat.py           # WebSocket chat handler
│   │
│   ├── services/                 # Business logic
│   │   ├── __init__.py
│   │   ├── auth_service.py
│   │   ├── shop_service.py
│   │   ├── listing_service.py
│   │   ├── message_service.py
│   │   ├── notification_service.py
│   │   ├── admin_service.py
│   │   ├── file_service.py
│   │   └── email_service.py
│   │
│   ├── repositories/             # Data access layer
│   │   ├── __init__.py
│   │   ├── base.py               # Generic CRUD base repository
│   │   ├── user_repo.py
│   │   ├── shop_repo.py
│   │   ├── listing_repo.py
│   │   ├── message_repo.py
│   │   └── notification_repo.py
│   │
│   ├── core/                     # Cross-cutting concerns
│   │   ├── __init__.py
│   │   ├── security.py           # JWT creation/validation, password hashing
│   │   ├── permissions.py        # Role-based access control decorators
│   │   ├── exceptions.py         # Custom exception classes
│   │   └── pagination.py         # Cursor/offset pagination helpers
│   │
│   └── workers/                  # Background tasks (Celery)
│       ├── __init__.py
│       ├── celery_app.py
│       ├── email_tasks.py
│       ├── push_tasks.py
│       └── scheduled_tasks.py    # Expiry checker, digest generator
│
├── tests/
│   ├── conftest.py               # Fixtures (test DB, client, auth helpers)
│   ├── test_auth.py
│   ├── test_shops.py
│   ├── test_listings.py
│   ├── test_messages.py
│   └── test_admin.py
│
├── .env.example
├── alembic.ini
├── pyproject.toml                # Dependencies (Poetry or pip)
├── Dockerfile
├── docker-compose.yml            # App + Postgres + Redis
└── README.md
```

---

## 3. Database Schema

### 3.1 Enums

```sql
CREATE TYPE user_role AS ENUM ('community_admin', 'shop_admin', 'shop_employee');
CREATE TYPE shop_status AS ENUM ('pending', 'active', 'suspended');
CREATE TYPE listing_type AS ENUM ('offer', 'request');
CREATE TYPE listing_category AS ENUM ('staff', 'materials', 'equipment');
CREATE TYPE urgency_level AS ENUM ('normal', 'urgent', 'critical');
CREATE TYPE listing_status AS ENUM ('active', 'fulfilled', 'expired', 'deleted');
CREATE TYPE notification_type AS ENUM (
    'registration_submitted', 'registration_approved', 'registration_rejected',
    'listing_interest', 'new_message', 'listing_expiring',
    'new_critical_listing', 'new_urgent_listing', 'shop_suspended'
);
```

### 3.2 Tables

#### `users`
```sql
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           VARCHAR(255) UNIQUE NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    name            VARCHAR(100) NOT NULL,
    phone           VARCHAR(20),
    role            user_role NOT NULL DEFAULT 'shop_admin',
    shop_id         UUID REFERENCES shops(id) ON DELETE SET NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_shop_id ON users(shop_id);
CREATE INDEX idx_users_role ON users(role);
```

#### `shops`
```sql
CREATE TABLE shops (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(150) NOT NULL,
    business_type   VARCHAR(50) NOT NULL,
    address         VARCHAR(255),
    contact_phone   VARCHAR(20) NOT NULL,
    whatsapp        VARCHAR(20),
    status          shop_status NOT NULL DEFAULT 'pending',
    admin_user_id   UUID REFERENCES users(id) ON DELETE SET NULL,
    rejection_reason TEXT,
    guidelines_accepted BOOLEAN NOT NULL DEFAULT FALSE,
    guidelines_accepted_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_shops_status ON shops(status);
CREATE INDEX idx_shops_admin ON shops(admin_user_id);
```

#### `listings`
```sql
CREATE TABLE listings (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id         UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    type            listing_type NOT NULL,
    category        listing_category NOT NULL,
    title           VARCHAR(100) NOT NULL,
    description     TEXT NOT NULL,
    quantity         VARCHAR(50),
    unit            VARCHAR(20),
    expiry_date     TIMESTAMPTZ,
    price           DECIMAL(10,2),
    is_free         BOOLEAN NOT NULL DEFAULT TRUE,
    urgency         urgency_level NOT NULL DEFAULT 'normal',
    status          listing_status NOT NULL DEFAULT 'active',
    views_count     INTEGER NOT NULL DEFAULT 0,
    interest_count  INTEGER NOT NULL DEFAULT 0,
    fulfilled_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_listings_shop_id ON listings(shop_id);
CREATE INDEX idx_listings_status ON listings(status);
CREATE INDEX idx_listings_category ON listings(category);
CREATE INDEX idx_listings_urgency ON listings(urgency);
CREATE INDEX idx_listings_type ON listings(type);
CREATE INDEX idx_listings_created_at ON listings(created_at DESC);
CREATE INDEX idx_listings_expiry ON listings(expiry_date) WHERE expiry_date IS NOT NULL;

-- Composite index for the main feed query
CREATE INDEX idx_listings_feed ON listings(status, urgency, created_at DESC)
    WHERE status = 'active';
```

#### `listing_images`
```sql
CREATE TABLE listing_images (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id      UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    url             VARCHAR(500) NOT NULL,
    thumbnail_url   VARCHAR(500),
    sort_order      SMALLINT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_listing_images_listing ON listing_images(listing_id);
```

#### `interests`
```sql
CREATE TABLE interests (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id      UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message         TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(listing_id, user_id)
);

CREATE INDEX idx_interests_listing ON interests(listing_id);
CREATE INDEX idx_interests_user ON interests(user_id);
```

#### `message_threads`
```sql
CREATE TABLE message_threads (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id      UUID REFERENCES listings(id) ON DELETE SET NULL,
    participant_a   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    participant_b   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    last_message_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(listing_id, participant_a, participant_b)
);

CREATE INDEX idx_threads_participant_a ON message_threads(participant_a);
CREATE INDEX idx_threads_participant_b ON message_threads(participant_b);
CREATE INDEX idx_threads_last_message ON message_threads(last_message_at DESC);
```

#### `messages`
```sql
CREATE TABLE messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id       UUID NOT NULL REFERENCES message_threads(id) ON DELETE CASCADE,
    sender_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content         TEXT NOT NULL,
    read_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_thread ON messages(thread_id, created_at);
CREATE INDEX idx_messages_sender ON messages(sender_id);
CREATE INDEX idx_messages_unread ON messages(thread_id, read_at) WHERE read_at IS NULL;
```

#### `notifications`
```sql
CREATE TABLE notifications (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type            notification_type NOT NULL,
    title           VARCHAR(200) NOT NULL,
    body            TEXT NOT NULL,
    data            JSONB,           -- Flexible payload: { listing_id, shop_id, thread_id, etc. }
    is_read         BOOLEAN NOT NULL DEFAULT FALSE,
    read_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_unread ON notifications(user_id, is_read) WHERE is_read = FALSE;
```

#### `guidelines`
```sql
CREATE TABLE guidelines (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_url        VARCHAR(500) NOT NULL,
    file_name       VARCHAR(255) NOT NULL,
    file_type       VARCHAR(20) NOT NULL,      -- 'pdf', 'docx', 'txt'
    file_size       INTEGER NOT NULL,           -- bytes
    uploaded_by     UUID NOT NULL REFERENCES users(id),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### `push_subscriptions`
```sql
CREATE TABLE push_subscriptions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint        TEXT NOT NULL UNIQUE,
    p256dh_key      TEXT NOT NULL,
    auth_key        TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_push_subs_user ON push_subscriptions(user_id);
```

#### `employees`
```sql
CREATE TABLE employees (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id         UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    name            VARCHAR(100) NOT NULL,
    role_title      VARCHAR(100),
    skills          TEXT[],
    phone           VARCHAR(20),
    is_available    BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_employees_shop ON employees(shop_id);
CREATE INDEX idx_employees_available ON employees(shop_id, is_available) WHERE is_available = TRUE;
```

### 3.3 Entity Relationship Summary

```
users ──────┐
  │ 1:1     │ 1:N
  ▼         ▼
shops    notifications
  │ 1:N
  ├── listings ──── listing_images (1:N)
  │     │ 1:N
  │     └── interests (N:M with users)
  │
  ├── employees (1:N)
  │
  └── message_threads ──── messages (1:N)
         (between two users, per listing)

guidelines (standalone, managed by community_admin)
push_subscriptions (1:N from users)
```

---

## 4. Authentication & Authorization

### 4.1 Auth Flow

```
Registration:
  POST /api/v1/auth/register
  → Create user (password hashed with bcrypt)
  → Create shop (status: pending)
  → Link user as shop admin
  → Notify community admin
  → Return: { message: "Registration submitted for review" }

Login:
  POST /api/v1/auth/login
  → Validate email + password
  → Check user.is_active and shop.status
  → Return: { access_token, refresh_token, user, shop }

Token Refresh:
  POST /api/v1/auth/refresh
  → Validate refresh_token
  → Return: { access_token }
```

### 4.2 JWT Structure

**Access Token** (short-lived: 30 minutes):
```json
{
  "sub": "user_uuid",
  "role": "shop_admin",
  "shop_id": "shop_uuid",
  "exp": 1712345678,
  "type": "access"
}
```

**Refresh Token** (long-lived: 7 days):
```json
{
  "sub": "user_uuid",
  "exp": 1712950478,
  "type": "refresh"
}
```

### 4.3 Role-Based Access Control (RBAC)

```python
# app/core/permissions.py

class Permission:
    """Dependency factories for role-based route protection."""

    @staticmethod
    def require_auth(current_user: User = Depends(get_current_user)):
        """Any authenticated user."""
        return current_user

    @staticmethod
    def require_role(*roles: UserRole):
        """Restrict to specific roles."""
        def checker(current_user: User = Depends(get_current_user)):
            if current_user.role not in roles:
                raise HTTPException(403, "Insufficient permissions")
            return current_user
        return checker

    @staticmethod
    def require_shop_admin():
        """Shop admin with active shop."""
        ...

    @staticmethod
    def require_community_admin():
        """Community admin only."""
        ...

    @staticmethod
    def require_shop_member(shop_id: UUID):
        """User belongs to the specified shop."""
        ...
```

### 4.4 Permission Matrix

| Endpoint Pattern | Anonymous | Shop Employee | Shop Admin | Community Admin |
|---|---|---|---|---|
| `GET /listings` | ✅ | ✅ | ✅ | ✅ |
| `GET /listings/:id` | ✅ | ✅ | ✅ | ✅ |
| `POST /listings` | ❌ | ❌ | ✅ (own shop) | ❌ |
| `PUT /listings/:id` | ❌ | ❌ | ✅ (own listing) | ✅ |
| `DELETE /listings/:id` | ❌ | ❌ | ✅ (own listing) | ✅ |
| `POST /interests` | ❌ | ❌ | ✅ | ✅ |
| `GET /messages` | ❌ | ❌ | ✅ | ✅ |
| `POST /messages` | ❌ | ❌ | ✅ | ✅ |
| `GET /shops/:id` | ✅ | ✅ | ✅ | ✅ |
| `PUT /shops/:id` | ❌ | ❌ | ✅ (own shop) | ✅ |
| `POST /shops/:id/employees` | ❌ | ❌ | ✅ (own shop) | ❌ |
| `GET /admin/*` | ❌ | ❌ | ❌ | ✅ |
| `POST /auth/register` | ✅ | ❌ | ❌ | ❌ |
| `POST /auth/login` | ✅ | ✅ | ✅ | ✅ |

---

## 5. API Endpoints

**Base URL:** `/api/v1`
**Content-Type:** `application/json` (except file uploads: `multipart/form-data`)
**Authentication:** `Authorization: Bearer <access_token>`

### 5.1 Auth (`/api/v1/auth`)

---

#### `POST /auth/register`
Register a new shop and its admin user.

**Auth:** None
**Body:**
```json
{
  "shop_name": "Fresh Bites Café",
  "business_type": "restaurant",
  "owner_name": "John Doe",
  "email": "john@freshbites.com",
  "phone": "+1234567890",
  "whatsapp": "+1234567890",
  "password": "securepassword123",
  "address": "12 Bend Road",
  "guidelines_accepted": true
}
```
**Validation:**
- `email`: valid format, unique
- `password`: min 8 chars, at least 1 number + 1 letter
- `phone`: valid format (E.164)
- `guidelines_accepted`: must be `true`
- `shop_name`: 2–150 chars
- `business_type`: non-empty string

**Response:** `201 Created`
```json
{
  "message": "Registration submitted for review",
  "shop_id": "uuid"
}
```

**Side Effects:**
- Creates user with role `shop_admin`, is_active = true
- Creates shop with status `pending`, links to user
- Sends notification to community admin
- Sends confirmation email to applicant

---

#### `POST /auth/login`
Authenticate and receive tokens.

**Auth:** None
**Body:**
```json
{
  "email": "john@freshbites.com",
  "password": "securepassword123"
}
```

**Response:** `200 OK`
```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "token_type": "bearer",
  "user": {
    "id": "uuid",
    "name": "John Doe",
    "email": "john@freshbites.com",
    "role": "shop_admin"
  },
  "shop": {
    "id": "uuid",
    "name": "Fresh Bites Café",
    "status": "active"
  }
}
```

**Error Cases:**
- `401`: Invalid credentials
- `403`: Account disabled (`is_active = false`)
- `403`: Shop pending — returns `{ "error": "shop_pending", "message": "Your registration is pending approval" }`
- `403`: Shop suspended — returns `{ "error": "shop_suspended", "message": "Your shop has been suspended" }`

---

#### `POST /auth/refresh`
Refresh an expired access token.

**Auth:** None (refresh token in body)
**Body:** `{ "refresh_token": "eyJ..." }`
**Response:** `200 OK` — `{ "access_token": "eyJ...", "token_type": "bearer" }`

---

#### `POST /auth/forgot-password`
Request password reset email.

**Auth:** None
**Body:** `{ "email": "john@freshbites.com" }`
**Response:** `200 OK` — `{ "message": "If that email exists, a reset link has been sent" }`

---

#### `POST /auth/reset-password`
Reset password with token from email.

**Auth:** None
**Body:** `{ "token": "reset-token", "new_password": "newpassword123" }`
**Response:** `200 OK` — `{ "message": "Password reset successful" }`

---

### 5.2 Listings (`/api/v1/listings`)

---

#### `GET /listings`
Browse all active listings. Public — no auth required.

**Query Params:**
| Param | Type | Default | Description |
|---|---|---|---|
| `category` | string | — | Filter: `staff`, `materials`, `equipment` |
| `type` | string | — | Filter: `offer`, `request` |
| `urgency` | string | — | Filter: `normal`, `urgent`, `critical` |
| `is_free` | boolean | — | Filter by free/paid |
| `search` | string | — | Full-text search on title + description |
| `sort` | string | `urgency_desc` | Sort: `urgency_desc`, `created_desc`, `expiry_asc` |
| `cursor` | string | — | Cursor for pagination (opaque token) |
| `limit` | integer | 20 | Items per page (max 50) |

**Response:** `200 OK`
```json
{
  "items": [
    {
      "id": "uuid",
      "shop": {
        "id": "uuid",
        "name": "Fresh Bites Café",
        "business_type": "restaurant",
        "avatar_url": null
      },
      "type": "offer",
      "category": "materials",
      "title": "Tomatoes — 5kg",
      "description": "Ripe Roma tomatoes, bought 2 days ago...",
      "quantity": "5",
      "unit": "kg",
      "expiry_date": "2026-04-05T00:00:00Z",
      "price": null,
      "is_free": true,
      "urgency": "critical",
      "status": "active",
      "interest_count": 3,
      "images": [
        { "url": "https://...", "thumbnail_url": "https://..." }
      ],
      "created_at": "2026-04-03T10:00:00Z"
    }
  ],
  "next_cursor": "eyJ...",
  "has_more": true
}
```

**Sort Logic for `urgency_desc` (default):**
```sql
ORDER BY
  CASE urgency
    WHEN 'critical' THEN 1
    WHEN 'urgent' THEN 2
    WHEN 'normal' THEN 3
  END ASC,
  created_at DESC
```

---

#### `GET /listings/:id`
Get full listing detail. Public.

**Response:** `200 OK` — Full listing object including shop contact details, all images, and whether the current user (if authenticated) has expressed interest.

Additional fields vs. list response:
```json
{
  ...listing,
  "shop": {
    ...shop,
    "contact_phone": "+1234567890",
    "whatsapp": "+1234567890",
    "address": "12 Bend Road"
  },
  "viewer_has_interest": true,
  "views_count": 42
}
```

**Side Effect:** Increment `views_count` (debounced per user via Redis, max 1 view per user per listing per hour).

---

#### `POST /listings`
Create a new listing.

**Auth:** Shop Admin (active shop)
**Body:**
```json
{
  "type": "offer",
  "category": "materials",
  "title": "Tomatoes — 5kg",
  "description": "Ripe Roma tomatoes...",
  "quantity": "5",
  "unit": "kg",
  "expiry_date": "2026-04-05T00:00:00Z",
  "price": null,
  "is_free": true,
  "urgency": "critical",
  "image_ids": ["uuid", "uuid"]
}
```

**Validation:**
- `title`: 5–100 chars
- `description`: 10–500 chars
- `urgency`: critical/urgent listings rate-limited (max 2 active critical per shop)
- `expiry_date`: must be in the future (if provided)
- `price`: required and > 0 if `is_free` is false
- `image_ids`: max 5, must be pre-uploaded via `/upload/images`

**Response:** `201 Created` — Full listing object

**Side Effects:**
- If urgency is `critical` or `urgent`: broadcast notification to all registered users (filtered by notification preferences)
- If category is `materials` and expiry_date set: schedule expiry reminder task

---

#### `PUT /listings/:id`
Update a listing.

**Auth:** Shop Admin (own listing) or Community Admin
**Body:** Partial update — any subset of create fields
**Response:** `200 OK` — Updated listing

---

#### `PATCH /listings/:id/fulfill`
Mark a listing as fulfilled.

**Auth:** Shop Admin (own listing)
**Body:** None
**Response:** `200 OK` — `{ "status": "fulfilled", "fulfilled_at": "..." }`

---

#### `DELETE /listings/:id`
Soft-delete a listing.

**Auth:** Shop Admin (own listing) or Community Admin
**Response:** `200 OK` — `{ "status": "deleted" }`
**Admin variant:** Requires `reason` in body when community admin removes someone else's listing.

---

### 5.3 Interests (`/api/v1/interests`)

---

#### `POST /interests`
Express interest in a listing.

**Auth:** Shop Admin
**Body:**
```json
{
  "listing_id": "uuid",
  "message": "I'd like to pick these up today!"
}
```

**Response:** `201 Created`

**Side Effects:**
- Increment `listing.interest_count`
- Create notification for listing owner
- Auto-create a message thread between the two shop admins (linked to listing)
- If `message` provided, send it as the first message in the thread

**Constraints:** Cannot express interest in own shop's listing.

---

#### `DELETE /interests/:listing_id`
Withdraw interest.

**Auth:** Shop Admin (own interest)
**Response:** `200 OK`

---

### 5.4 Shops (`/api/v1/shops`)

---

#### `GET /shops/:id`
Get shop profile. Public.

**Response:** `200 OK`
```json
{
  "id": "uuid",
  "name": "Fresh Bites Café",
  "business_type": "restaurant",
  "address": "12 Bend Road",
  "contact_phone": "+1234567890",
  "whatsapp": "+1234567890",
  "status": "active",
  "active_listings_count": 4,
  "total_fulfilled": 32,
  "member_since": "2026-03-01T00:00:00Z"
}
```

---

#### `PUT /shops/:id`
Update shop profile.

**Auth:** Shop Admin (own shop)
**Body:** Partial update of name, address, contact_phone, whatsapp
**Response:** `200 OK`

---

#### `GET /shops/:id/listings`
Get all listings for a shop (with status filter).

**Auth:** Public for active listings; Shop Admin (own shop) for all statuses
**Query Params:** `status` (active/fulfilled/expired/deleted), `cursor`, `limit`
**Response:** Paginated listings

---

#### `GET /shops/:id/employees`
Get employees for a shop.

**Auth:** Shop Admin (own shop)
**Response:** `200 OK` — Array of employee objects

---

#### `POST /shops/:id/employees`
Add an employee.

**Auth:** Shop Admin (own shop)
**Body:**
```json
{
  "name": "Maria Garcia",
  "role_title": "Line Cook",
  "skills": ["cooking", "food prep", "inventory"],
  "phone": "+1234567890",
  "is_available": true
}
```
**Response:** `201 Created`

---

#### `PUT /shops/:id/employees/:employee_id`
Update employee details or toggle availability.

**Auth:** Shop Admin (own shop)
**Response:** `200 OK`

---

#### `DELETE /shops/:id/employees/:employee_id`
Remove an employee.

**Auth:** Shop Admin (own shop)
**Response:** `200 OK`

---

### 5.5 Messages (`/api/v1/messages`)

---

#### `GET /messages/threads`
Get all message threads for current user.

**Auth:** Required
**Query Params:** `cursor`, `limit` (default 20)
**Response:** `200 OK`
```json
{
  "items": [
    {
      "id": "thread_uuid",
      "listing": {
        "id": "uuid",
        "title": "Tomatoes — 5kg",
        "urgency": "critical"
      },
      "other_party": {
        "id": "uuid",
        "name": "John Doe",
        "shop_name": "Fresh Bites Café",
        "avatar_url": null
      },
      "last_message": {
        "content": "Yes, you can pick them up anytime today.",
        "sender_id": "uuid",
        "created_at": "2026-04-03T10:32:00Z"
      },
      "unread_count": 2,
      "last_message_at": "2026-04-03T10:32:00Z"
    }
  ],
  "next_cursor": "...",
  "has_more": false
}
```

**Sort:** By `last_message_at DESC`

---

#### `GET /messages/threads/:thread_id`
Get messages in a thread.

**Auth:** Required (must be a participant)
**Query Params:** `cursor`, `limit` (default 50), `before` (timestamp for loading older messages)
**Response:** `200 OK` — Paginated messages, newest first

**Side Effect:** Mark all unread messages in this thread as read (set `read_at`).

---

#### `POST /messages/threads/:thread_id`
Send a message in a thread.

**Auth:** Required (must be a participant)
**Body:** `{ "content": "I'll come by at 2 PM!" }`
**Response:** `201 Created` — Message object

**Side Effects:**
- Update `thread.last_message_at`
- Send push notification to other participant
- Broadcast via WebSocket to other participant if online

---

#### `GET /messages/unread-count`
Get total unread message count.

**Auth:** Required
**Response:** `200 OK` — `{ "unread_count": 5 }`

---

### 5.6 Notifications (`/api/v1/notifications`)

---

#### `GET /notifications`
Get notifications for current user.

**Auth:** Required
**Query Params:** `cursor`, `limit` (default 20), `unread_only` (boolean)
**Response:** Paginated notifications grouped by date

---

#### `PATCH /notifications/:id/read`
Mark a notification as read.

**Auth:** Required (own notification)
**Response:** `200 OK`

---

#### `PATCH /notifications/read-all`
Mark all notifications as read.

**Auth:** Required
**Response:** `200 OK` — `{ "updated_count": 12 }`

---

#### `GET /notifications/unread-count`
Get unread count for badge.

**Auth:** Required
**Response:** `200 OK` — `{ "unread_count": 7 }`

---

#### `POST /notifications/push-subscription`
Register a push subscription.

**Auth:** Required
**Body:**
```json
{
  "endpoint": "https://fcm.googleapis.com/...",
  "keys": {
    "p256dh": "...",
    "auth": "..."
  }
}
```
**Response:** `201 Created`

---

#### `PUT /notifications/preferences`
Update notification preferences.

**Auth:** Required
**Body:**
```json
{
  "push_enabled": true,
  "email_enabled": true,
  "email_frequency": "daily",
  "categories": ["staff", "materials", "equipment"],
  "min_urgency": "normal"
}
```
**Response:** `200 OK`

---

### 5.7 File Upload (`/api/v1/upload`)

---

#### `POST /upload/images`
Upload listing images.

**Auth:** Shop Admin
**Content-Type:** `multipart/form-data`
**Body:** `files` — up to 5 images (JPEG, PNG, WebP), max 5MB each
**Response:** `200 OK`
```json
{
  "images": [
    {
      "id": "uuid",
      "url": "https://s3.../original/uuid.jpg",
      "thumbnail_url": "https://s3.../thumb/uuid.jpg"
    }
  ]
}
```
**Processing:** Generate thumbnail (300x300), optimize original (max 1200px wide).

---

#### `POST /upload/guidelines`
Upload community guidelines file.

**Auth:** Community Admin
**Content-Type:** `multipart/form-data`
**Body:** `file` — single file (PDF, DOCX, TXT), max 10MB
**Response:** `200 OK`
```json
{
  "id": "uuid",
  "file_url": "https://s3.../guidelines/uuid.pdf",
  "file_name": "community_rules.pdf",
  "file_type": "pdf",
  "file_size": 245000
}
```
**Side Effect:** Deactivate previous guidelines record (set `is_active = false`).

---

#### `GET /upload/guidelines/current`
Get the current active guidelines file.

**Auth:** None (public)
**Response:** `200 OK` — Guidelines object with download URL

---

### 5.8 Admin (`/api/v1/admin`)

All admin endpoints require `community_admin` role.

---

#### `GET /admin/dashboard`
Dashboard stats.

**Response:** `200 OK`
```json
{
  "pending_registrations": 3,
  "active_shops": 28,
  "active_listings": 142,
  "fulfilled_this_month": 89,
  "listings_by_category": {
    "staff": 18,
    "materials": 24,
    "equipment": 5
  },
  "recent_registrations": [...],
  "recent_listings": [...]
}
```

---

#### `GET /admin/registrations`
List shop registrations.

**Query Params:** `status` (pending/active/suspended), `cursor`, `limit`
**Response:** Paginated shop registration list with applicant details

---

#### `POST /admin/registrations/:shop_id/approve`
Approve a shop registration.

**Response:** `200 OK`

**Side Effects:**
- Set `shop.status = active`
- Send approval email to shop admin
- Create notification for shop admin

---

#### `POST /admin/registrations/:shop_id/reject`
Reject a shop registration.

**Body:** `{ "reason": "Not located in the bend area" }`
**Response:** `200 OK`

**Side Effects:**
- Set `shop.status` remains `pending` (or new `rejected` status)
- Store `rejection_reason`
- Send rejection email with reason

---

#### `GET /admin/shops`
List all shops with filters.

**Query Params:** `status`, `search`, `sort`, `cursor`, `limit`
**Response:** Paginated shops with stats (listing count, last active)

---

#### `POST /admin/shops/:id/suspend`
Suspend a shop.

**Body:** `{ "reason": "Violation of community guidelines" }`
**Response:** `200 OK`

**Side Effects:**
- Set `shop.status = suspended`
- Hide all active listings (set status to a suspended state or filter in queries)
- Send notification + email to shop admin

---

#### `POST /admin/shops/:id/reactivate`
Reactivate a suspended shop.

**Response:** `200 OK`

**Side Effects:**
- Set `shop.status = active`
- Restore previously active listings
- Notify shop admin

---

#### `GET /admin/listings`
List all listings across all shops.

**Query Params:** `status`, `category`, `urgency`, `shop_id`, `search`, `cursor`, `limit`
**Response:** Paginated listings with shop info

---

#### `DELETE /admin/listings/:id`
Remove a listing (admin moderation).

**Body:** `{ "reason": "Inappropriate content" }`
**Response:** `200 OK`

---

#### `GET /admin/reports`
Community analytics.

**Query Params:** `period` (week/month/quarter)
**Response:** `200 OK`
```json
{
  "period": "week",
  "new_shops": 8,
  "active_listings": 47,
  "fulfilled_listings": 32,
  "listings_by_category": { "staff": 18, "materials": 24, "equipment": 5 },
  "listings_over_time": [
    { "date": "2026-03-28", "count": 12 },
    { "date": "2026-03-29", "count": 8 },
    ...
  ],
  "most_active_shops": [
    { "shop_id": "uuid", "shop_name": "Fresh Bites", "listing_count": 12 },
    ...
  ]
}
```

---

## 6. WebSocket Specification

### Connection

```
WSS /api/v1/ws/chat?token=<access_token>
```

### Authentication
Token validated on connection. Invalid/expired token = connection rejected with `4001` close code.

### Message Protocol

All messages are JSON with a `type` field:

**Client → Server:**

```json
// Send a chat message
{
  "type": "message",
  "thread_id": "uuid",
  "content": "Hello!"
}

// Mark messages as read
{
  "type": "read",
  "thread_id": "uuid"
}

// Typing indicator
{
  "type": "typing",
  "thread_id": "uuid"
}
```

**Server → Client:**

```json
// New message received
{
  "type": "message",
  "data": {
    "id": "uuid",
    "thread_id": "uuid",
    "sender_id": "uuid",
    "content": "Hello!",
    "created_at": "2026-04-03T10:30:00Z"
  }
}

// Typing indicator
{
  "type": "typing",
  "data": {
    "thread_id": "uuid",
    "user_id": "uuid"
  }
}

// Read receipt
{
  "type": "read",
  "data": {
    "thread_id": "uuid",
    "user_id": "uuid",
    "read_at": "2026-04-03T10:31:00Z"
  }
}

// New notification (non-chat)
{
  "type": "notification",
  "data": {
    "id": "uuid",
    "type": "listing_interest",
    "title": "New interest in your listing",
    "body": "The Corner Grill is interested in Tomatoes — 5kg"
  }
}

// Error
{
  "type": "error",
  "data": {
    "code": "THREAD_NOT_FOUND",
    "message": "Thread does not exist or you are not a participant"
  }
}
```

### Connection Management

```python
# app/api/ws/chat.py — Simplified architecture

class ConnectionManager:
    """Manages active WebSocket connections."""

    def __init__(self):
        # user_id → set of WebSocket connections (multi-device)
        self.active: dict[UUID, set[WebSocket]] = {}

    async def connect(self, user_id: UUID, ws: WebSocket):
        await ws.accept()
        self.active.setdefault(user_id, set()).add(ws)

    def disconnect(self, user_id: UUID, ws: WebSocket):
        if user_id in self.active:
            self.active[user_id].discard(ws)
            if not self.active[user_id]:
                del self.active[user_id]

    async def send_to_user(self, user_id: UUID, message: dict):
        """Send to all active connections for a user."""
        for ws in self.active.get(user_id, []):
            await ws.send_json(message)

    def is_online(self, user_id: UUID) -> bool:
        return user_id in self.active
```

**Scaling note:** For multiple server instances, use Redis Pub/Sub to broadcast messages across workers.

---

## 7. Middleware & Cross-Cutting Concerns

### 7.1 CORS

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://thebend.app", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### 7.2 Rate Limiting

| Endpoint Pattern | Limit | Window |
|---|---|---|
| `POST /auth/login` | 5 requests | 15 minutes (per IP) |
| `POST /auth/register` | 3 requests | 1 hour (per IP) |
| `POST /auth/forgot-password` | 3 requests | 1 hour (per email) |
| `POST /listings` | 10 requests | 1 hour (per user) |
| `POST /messages/*` | 60 requests | 1 minute (per user) |
| `POST /interests` | 20 requests | 1 hour (per user) |
| All other endpoints | 100 requests | 1 minute (per user) |

Implemented via Redis with sliding window counter.

### 7.3 Request Logging

```python
@app.middleware("http")
async def log_requests(request: Request, call_next):
    # Log: method, path, user_id (if auth'd), response status, latency
```

### 7.4 Error Handling

Standardized error response format:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable description",
    "details": [
      { "field": "email", "message": "Invalid email format" }
    ]
  }
}
```

| HTTP Code | Error Code | Usage |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Invalid request body |
| 401 | `UNAUTHORIZED` | Missing or invalid token |
| 403 | `FORBIDDEN` | Insufficient permissions |
| 404 | `NOT_FOUND` | Resource not found |
| 409 | `CONFLICT` | Duplicate (e.g., already registered email) |
| 422 | `BUSINESS_RULE_VIOLATION` | Domain constraint (e.g., max critical listings) |
| 429 | `RATE_LIMITED` | Too many requests |
| 500 | `INTERNAL_ERROR` | Unexpected server error |

---

## 8. Background Tasks (Celery)

### 8.1 Email Tasks

| Task | Trigger | Description |
|---|---|---|
| `send_registration_confirmation` | After registration | Welcome email to applicant |
| `send_approval_email` | Admin approves | "You're in!" email with login link |
| `send_rejection_email` | Admin rejects | Email with rejection reason |
| `send_password_reset` | Forgot password | Reset link (expires in 1 hour) |
| `send_daily_digest` | Cron: daily 8 AM | Summary of new listings matching preferences |
| `send_weekly_digest` | Cron: Monday 8 AM | Weekly community summary |

### 8.2 Push Notification Tasks

| Task | Trigger | Description |
|---|---|---|
| `push_new_message` | New chat message | "New message from [Shop Name]" |
| `push_listing_interest` | Someone expresses interest | "[Shop] is interested in [Listing]" |
| `push_critical_listing` | Critical listing created | "🔴 [Title] — posted by [Shop]" |
| `push_urgent_listing` | Urgent listing created | "🟡 [Title] — posted by [Shop]" |
| `push_registration_decision` | Approve/reject | "Your registration has been approved/rejected" |

### 8.3 Scheduled Tasks

| Task | Schedule | Description |
|---|---|---|
| `check_expiring_listings` | Every hour | Find listings with `expiry_date` within 24 hours; notify listing owner + boost urgency if not already critical |
| `auto_expire_listings` | Every hour | Set `status = expired` for listings past `expiry_date` |
| `auto_expire_old_listings` | Daily midnight | Expire listings older than 7 days with no activity (configurable) |
| `generate_daily_digest` | Daily 7 AM | Compile and queue digest emails |
| `cleanup_read_notifications` | Weekly | Delete read notifications older than 30 days |

---

## 9. Caching Strategy (Redis)

| Key Pattern | TTL | Description |
|---|---|---|
| `feed:page:{hash}` | 60s | Cached feed pages (invalidated on new listing) |
| `listing:{id}` | 5 min | Individual listing detail |
| `shop:{id}` | 5 min | Shop profile |
| `stats:dashboard` | 2 min | Admin dashboard stats |
| `views:{listing_id}:{user_id}` | 1 hour | View dedup per user per listing |
| `rate:{identifier}:{endpoint}` | varies | Rate limit counters |
| `online:{user_id}` | 30s | Online status (heartbeat) |
| `typing:{thread_id}:{user_id}` | 3s | Typing indicator |

Cache invalidation: Write-through for critical data (listings, shops). Event-driven invalidation via service layer.

---

## 10. Configuration & Environment

```env
# .env.example

# App
APP_NAME=TheBend
APP_ENV=development            # development | staging | production
DEBUG=true
SECRET_KEY=your-secret-key-min-32-chars
API_PREFIX=/api/v1

# Database
DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/thebend
DATABASE_POOL_SIZE=20
DATABASE_MAX_OVERFLOW=10

# Redis
REDIS_URL=redis://localhost:6379/0

# JWT
JWT_SECRET_KEY=your-jwt-secret
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=30
JWT_REFRESH_TOKEN_EXPIRE_DAYS=7

# CORS
CORS_ORIGINS=["http://localhost:3000"]

# AWS S3
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=us-east-1
S3_BUCKET=thebend-uploads

# Email (SendGrid)
SENDGRID_API_KEY=
EMAIL_FROM=noreply@thebend.app
EMAIL_FROM_NAME=The Bend

# Web Push (VAPID)
VAPID_PRIVATE_KEY=
VAPID_PUBLIC_KEY=
VAPID_CLAIM_EMAIL=admin@thebend.app

# Celery
CELERY_BROKER_URL=redis://localhost:6379/1
CELERY_RESULT_BACKEND=redis://localhost:6379/2
```

---

## 11. Testing Strategy

### Test Pyramid

| Level | Tool | Coverage Target | What to Test |
|---|---|---|---|
| **Unit** | pytest | 80%+ | Services, repositories, utilities, validation |
| **Integration** | pytest + httpx | Key flows | API endpoints with real DB (test container) |
| **E2E** | pytest + async client | Critical paths | Full registration → approval → listing → interest flow |

### Test Database
- Use Docker Postgres test container (via `testcontainers-python`)
- Each test function gets a fresh transaction that rolls back
- Factory functions via `factory-boy` for test data

### Key Test Scenarios

**Auth:**
- Register with valid data → 201, shop status pending
- Register with duplicate email → 409
- Login with pending shop → 403 with `shop_pending`
- Login with active shop → 200 with tokens
- Access protected route without token → 401
- Access admin route as shop_admin → 403

**Listings:**
- Browse feed as anonymous → 200 with listings
- Create listing as shop_admin → 201
- Create critical listing when 2 already exist → 422
- Fulfill own listing → 200
- Delete someone else's listing as shop_admin → 403
- Delete as community_admin → 200

**Messages:**
- Express interest → thread auto-created + notification sent
- Send message → WebSocket delivery + push notification
- Read thread → unread count decremented

**Admin:**
- Approve registration → shop active + email sent
- Suspend shop → listings hidden
- Reactivate → listings restored

---

## 12. Deployment

### Docker Compose (Development)

```yaml
version: '3.8'
services:
  api:
    build: .
    ports: ["8000:8000"]
    env_file: .env
    depends_on: [db, redis]
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: thebend
      POSTGRES_USER: thebend
      POSTGRES_PASSWORD: thebend
    ports: ["5432:5432"]
    volumes: [pgdata:/var/lib/postgresql/data]

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]

  celery-worker:
    build: .
    env_file: .env
    depends_on: [db, redis]
    command: celery -A app.workers.celery_app worker --loglevel=info

  celery-beat:
    build: .
    env_file: .env
    depends_on: [redis]
    command: celery -A app.workers.celery_app beat --loglevel=info

volumes:
  pgdata:
```

### Production Recommendations
- **API:** 2+ Uvicorn workers behind Nginx (or use Gunicorn with Uvicorn workers)
- **Database:** Managed PostgreSQL (AWS RDS, Supabase, or Neon)
- **Redis:** Managed Redis (AWS ElastiCache or Upstash)
- **File Storage:** AWS S3 with CloudFront CDN
- **Hosting:** Railway, Render, or AWS ECS
- **CI/CD:** GitHub Actions — lint (ruff), test (pytest), build (Docker), deploy
- **Monitoring:** Sentry for error tracking, Prometheus + Grafana for metrics

---

*This specification should be read alongside The_Bend_PRD.md and The_Bend_Frontend_Spec.md for full product context.*
