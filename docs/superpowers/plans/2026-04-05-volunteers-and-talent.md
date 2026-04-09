# Volunteers & Talent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add public volunteer enrollment and talent marketplace pages where anyone can register and be discovered, with a booking inquiry flow for talent.

**Architecture:** Two new database tables (volunteers, talent) with a third for talent inquiries. Public API endpoints (no auth). Two new frontend pages with forms and card grids. Follows existing patterns: SQLAlchemy models, BaseRepository, service layer, FastAPI routers, React + Tailwind + shadcn/ui.

**Tech Stack:** FastAPI, SQLAlchemy (async), Alembic, PostgreSQL, React, TypeScript, Tailwind CSS, shadcn/ui

---

## File Structure

**Backend — Create:**
- `app/models/volunteer.py` — Volunteer SQLAlchemy model
- `app/models/talent.py` — Talent + TalentInquiry SQLAlchemy models
- `app/schemas/volunteer.py` — Pydantic request/response schemas
- `app/schemas/talent.py` — Pydantic request/response schemas
- `app/repositories/volunteer_repo.py` — Volunteer repository
- `app/repositories/talent_repo.py` — Talent repository
- `app/services/volunteer_service.py` — Volunteer service
- `app/services/talent_service.py` — Talent service
- `app/api/v1/volunteers.py` — Volunteer API routes
- `app/api/v1/talent.py` — Talent API routes

**Backend — Modify:**
- `app/api/v1/router.py` — Register new routers
- `alembic/versions/` — New migration file

**Frontend — Create:**
- `src/pages/VolunteerPage.tsx` — Volunteer enrollment + listing page
- `src/pages/TalentPage.tsx` — Talent registration + listing + booking page
- `src/services/volunteerApi.ts` — Volunteer API client
- `src/services/talentApi.ts` — Talent API client

**Frontend — Modify:**
- `src/types/index.ts` — Add Volunteer, Talent, TalentInquiry types
- `src/App.tsx` — Add routes
- `src/components/layout/Navbar.tsx` — Add nav links

---

### Task 1: Backend Volunteer Model + Migration

**Files:**
- Create: `app/models/volunteer.py`
- Modify: `app/models/__init__.py` (if needed for Alembic discovery)

- [ ] **Step 1: Create Volunteer model**

```python
# app/models/volunteer.py
from __future__ import annotations

import uuid
from datetime import datetime
from sqlalchemy import String, Text, Index
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class Volunteer(Base):
    __tablename__ = "volunteers"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    phone: Mapped[str] = mapped_column(String(20), nullable=False)
    skills: Mapped[str] = mapped_column(Text, nullable=False)
    available_time: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(nullable=False, default=datetime.utcnow)

    __table_args__ = (
        Index("idx_volunteers_created", "created_at"),
    )
```

- [ ] **Step 2: Create Talent + TalentInquiry models**

```python
# app/models/talent.py
from __future__ import annotations

import uuid
from datetime import datetime
from sqlalchemy import String, Text, Numeric, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class Talent(Base):
    __tablename__ = "talent"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    phone: Mapped[str] = mapped_column(String(20), nullable=False)
    category: Mapped[str] = mapped_column(String(50), nullable=False)  # freelancer, musician, artist
    skills: Mapped[str] = mapped_column(Text, nullable=False)
    available_time: Mapped[str] = mapped_column(String(255), nullable=False)
    rate: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    rate_unit: Mapped[str] = mapped_column(String(20), nullable=False, default="hr")  # hr, gig, day
    created_at: Mapped[datetime] = mapped_column(nullable=False, default=datetime.utcnow)

    inquiries: Mapped[list[TalentInquiry]] = relationship("TalentInquiry", back_populates="talent")

    __table_args__ = (
        Index("idx_talent_category", "category"),
        Index("idx_talent_created", "created_at"),
    )


class TalentInquiry(Base):
    __tablename__ = "talent_inquiries"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    talent_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("talent.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    preferred_date: Mapped[str | None] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(nullable=False, default=datetime.utcnow)

    talent: Mapped[Talent] = relationship("Talent", back_populates="inquiries")

    __table_args__ = (
        Index("idx_talent_inquiries_talent", "talent_id"),
    )
```

- [ ] **Step 3: Generate and run Alembic migration**

```bash
cd /Users/kapil/Desktop/projects/the_bend_community_app/the-bend-backend
.venv/bin/alembic revision --autogenerate -m "add_volunteers_and_talent_tables"
.venv/bin/alembic upgrade head
```

- [ ] **Step 4: Verify tables exist**

```bash
cd /Users/kapil/Desktop/projects/the_bend_community_app/the-bend-backend
PGPASSWORD=thebend psql -h localhost -U thebend -d thebend -c "\dt volunteers; \dt talent; \dt talent_inquiries;"
```

- [ ] **Step 5: Commit**

```bash
git add app/models/volunteer.py app/models/talent.py alembic/versions/
git commit -m "feat: add volunteer, talent, and talent_inquiry models with migration"
```

---

### Task 2: Backend Schemas

**Files:**
- Create: `app/schemas/volunteer.py`
- Create: `app/schemas/talent.py`

- [ ] **Step 1: Create volunteer schemas**

```python
# app/schemas/volunteer.py
from pydantic import BaseModel, field_validator


class VolunteerCreate(BaseModel):
    name: str
    phone: str
    skills: str
    available_time: str

    @field_validator("name", "phone", "skills", "available_time")
    @classmethod
    def not_empty(cls, v):
        if not v or not v.strip():
            raise ValueError("Field cannot be empty")
        return v.strip()


class VolunteerResponse(BaseModel):
    id: str
    name: str
    phone: str
    skills: str
    available_time: str
    created_at: str

    @field_validator("id", mode="before")
    @classmethod
    def stringify_id(cls, v):
        return str(v)
```

- [ ] **Step 2: Create talent schemas**

```python
# app/schemas/talent.py
from pydantic import BaseModel, field_validator


class TalentCreate(BaseModel):
    name: str
    phone: str
    category: str  # freelancer, musician, artist
    skills: str
    available_time: str
    rate: float
    rate_unit: str = "hr"  # hr, gig, day

    @field_validator("name", "phone", "category", "skills", "available_time")
    @classmethod
    def not_empty(cls, v):
        if not v or not v.strip():
            raise ValueError("Field cannot be empty")
        return v.strip()

    @field_validator("category")
    @classmethod
    def valid_category(cls, v):
        allowed = {"freelancer", "musician", "artist"}
        if v.strip().lower() not in allowed:
            raise ValueError(f"Category must be one of: {', '.join(allowed)}")
        return v.strip().lower()

    @field_validator("rate_unit")
    @classmethod
    def valid_rate_unit(cls, v):
        allowed = {"hr", "gig", "day"}
        if v.strip().lower() not in allowed:
            raise ValueError(f"Rate unit must be one of: {', '.join(allowed)}")
        return v.strip().lower()


class TalentResponse(BaseModel):
    id: str
    name: str
    phone: str
    category: str
    skills: str
    available_time: str
    rate: float
    rate_unit: str
    created_at: str

    @field_validator("id", mode="before")
    @classmethod
    def stringify_id(cls, v):
        return str(v)


class TalentInquiryCreate(BaseModel):
    name: str
    message: str
    preferred_date: str | None = None

    @field_validator("name", "message")
    @classmethod
    def not_empty(cls, v):
        if not v or not v.strip():
            raise ValueError("Field cannot be empty")
        return v.strip()
```

- [ ] **Step 3: Commit**

```bash
git add app/schemas/volunteer.py app/schemas/talent.py
git commit -m "feat: add pydantic schemas for volunteer and talent"
```

---

### Task 3: Backend Repositories

**Files:**
- Create: `app/repositories/volunteer_repo.py`
- Create: `app/repositories/talent_repo.py`

- [ ] **Step 1: Create volunteer repository**

```python
# app/repositories/volunteer_repo.py
from sqlalchemy.ext.asyncio import AsyncSession
from app.repositories.base import BaseRepository
from app.models.volunteer import Volunteer


class VolunteerRepository(BaseRepository[Volunteer]):
    def __init__(self, session: AsyncSession):
        super().__init__(Volunteer, session)
```

- [ ] **Step 2: Create talent repository**

```python
# app/repositories/talent_repo.py
from uuid import UUID
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.repositories.base import BaseRepository
from app.models.talent import Talent, TalentInquiry
from app.core.pagination import PaginatedResult


class TalentRepository(BaseRepository[Talent]):
    def __init__(self, session: AsyncSession):
        super().__init__(Talent, session)

    async def browse_by_category(self, category: str | None, cursor: str | None, limit: int) -> PaginatedResult:
        filters = []
        if category:
            filters.append(Talent.category == category)
        return await self.get_all(filters=filters, limit=limit, cursor=cursor)

    async def create_inquiry(self, talent_id: UUID, data: dict) -> TalentInquiry:
        inquiry = TalentInquiry(talent_id=talent_id, **data)
        self.session.add(inquiry)
        await self.session.flush()
        await self.session.refresh(inquiry)
        return inquiry
```

- [ ] **Step 3: Commit**

```bash
git add app/repositories/volunteer_repo.py app/repositories/talent_repo.py
git commit -m "feat: add volunteer and talent repositories"
```

---

### Task 4: Backend Services

**Files:**
- Create: `app/services/volunteer_service.py`
- Create: `app/services/talent_service.py`

- [ ] **Step 1: Create volunteer service**

```python
# app/services/volunteer_service.py
from uuid import uuid4
from sqlalchemy.ext.asyncio import AsyncSession
from app.repositories.volunteer_repo import VolunteerRepository
from app.schemas.volunteer import VolunteerCreate


class VolunteerService:
    def __init__(self, db: AsyncSession):
        self.repo = VolunteerRepository(db)

    async def enroll(self, data: VolunteerCreate):
        volunteer = await self.repo.create({
            "id": uuid4(),
            "name": data.name,
            "phone": data.phone,
            "skills": data.skills,
            "available_time": data.available_time,
        })
        return volunteer

    async def list_volunteers(self, cursor=None, limit=20):
        return await self.repo.get_all(limit=limit, cursor=cursor)
```

- [ ] **Step 2: Create talent service**

```python
# app/services/talent_service.py
from uuid import UUID, uuid4
from sqlalchemy.ext.asyncio import AsyncSession
from app.repositories.talent_repo import TalentRepository
from app.schemas.talent import TalentCreate, TalentInquiryCreate
from app.core.exceptions import NotFoundError


class TalentService:
    def __init__(self, db: AsyncSession):
        self.repo = TalentRepository(db)

    async def register(self, data: TalentCreate):
        talent = await self.repo.create({
            "id": uuid4(),
            "name": data.name,
            "phone": data.phone,
            "category": data.category,
            "skills": data.skills,
            "available_time": data.available_time,
            "rate": data.rate,
            "rate_unit": data.rate_unit,
        })
        return talent

    async def list_talent(self, category=None, cursor=None, limit=20):
        return await self.repo.browse_by_category(category, cursor, limit)

    async def create_inquiry(self, talent_id: UUID, data: TalentInquiryCreate):
        talent = await self.repo.get_by_id(talent_id)
        if not talent:
            raise NotFoundError("Talent not found")
        inquiry = await self.repo.create_inquiry(talent_id, {
            "name": data.name,
            "message": data.message,
            "preferred_date": data.preferred_date,
        })
        return {"inquiry_id": str(inquiry.id), "talent_phone": talent.phone}
```

- [ ] **Step 3: Commit**

```bash
git add app/services/volunteer_service.py app/services/talent_service.py
git commit -m "feat: add volunteer and talent services"
```

---

### Task 5: Backend API Routes

**Files:**
- Create: `app/api/v1/volunteers.py`
- Create: `app/api/v1/talent.py`
- Modify: `app/api/v1/router.py`

- [ ] **Step 1: Create volunteer routes**

```python
# app/api/v1/volunteers.py
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.services.volunteer_service import VolunteerService
from app.schemas.volunteer import VolunteerCreate

router = APIRouter(prefix="/volunteers", tags=["Volunteers"])


def get_service(db: AsyncSession = Depends(get_db)):
    return VolunteerService(db)


@router.post("")
async def enroll_volunteer(data: VolunteerCreate, service: VolunteerService = Depends(get_service)):
    v = await service.enroll(data)
    return {"id": str(v.id), "name": v.name}


@router.get("")
async def list_volunteers(
    cursor: str | None = Query(None),
    limit: int = Query(20, le=50),
    service: VolunteerService = Depends(get_service),
):
    result = await service.list_volunteers(cursor, limit)
    items = [{
        "id": str(v.id),
        "name": v.name,
        "phone": v.phone,
        "skills": v.skills,
        "available_time": v.available_time,
        "created_at": str(v.created_at),
    } for v in result.items]
    return {"items": items, "next_cursor": result.next_cursor, "has_more": result.has_more}
```

- [ ] **Step 2: Create talent routes**

```python
# app/api/v1/talent.py
from uuid import UUID
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.services.talent_service import TalentService
from app.schemas.talent import TalentCreate, TalentInquiryCreate

router = APIRouter(prefix="/talent", tags=["Talent"])


def get_service(db: AsyncSession = Depends(get_db)):
    return TalentService(db)


@router.post("")
async def register_talent(data: TalentCreate, service: TalentService = Depends(get_service)):
    t = await service.register(data)
    return {"id": str(t.id), "name": t.name}


@router.get("")
async def list_talent(
    category: str | None = Query(None),
    cursor: str | None = Query(None),
    limit: int = Query(20, le=50),
    service: TalentService = Depends(get_service),
):
    result = await service.list_talent(category, cursor, limit)
    items = [{
        "id": str(t.id),
        "name": t.name,
        "phone": t.phone,
        "category": t.category,
        "skills": t.skills,
        "available_time": t.available_time,
        "rate": float(t.rate),
        "rate_unit": t.rate_unit,
        "created_at": str(t.created_at),
    } for t in result.items]
    return {"items": items, "next_cursor": result.next_cursor, "has_more": result.has_more}


@router.post("/{talent_id}/inquiries")
async def create_inquiry(
    talent_id: UUID,
    data: TalentInquiryCreate,
    service: TalentService = Depends(get_service),
):
    return await service.create_inquiry(talent_id, data)
```

- [ ] **Step 3: Register routers in main router**

Add to `app/api/v1/router.py`:
```python
from app.api.v1.volunteers import router as volunteers_router
from app.api.v1.talent import router as talent_router

api_router.include_router(volunteers_router)
api_router.include_router(talent_router)
```

- [ ] **Step 4: Verify endpoints with curl**

```bash
# Volunteer enrollment
curl -s http://localhost:8000/api/v1/volunteers -X POST -H "Content-Type: application/json" \
  -d '{"name":"Test Volunteer","phone":"555-0100","skills":"Cooking, cleaning","available_time":"Weekends 9am-5pm"}'

# List volunteers
curl -s http://localhost:8000/api/v1/volunteers

# Talent registration
curl -s http://localhost:8000/api/v1/talent -X POST -H "Content-Type: application/json" \
  -d '{"name":"Test Artist","phone":"555-0200","category":"musician","skills":"Guitar, vocals","available_time":"Evenings","rate":50,"rate_unit":"hr"}'

# List talent
curl -s http://localhost:8000/api/v1/talent

# Booking inquiry (use talent id from registration response)
curl -s http://localhost:8000/api/v1/talent/<TALENT_ID>/inquiries -X POST -H "Content-Type: application/json" \
  -d '{"name":"Interested Person","message":"Would love to book you for Saturday","preferred_date":"2026-04-12"}'
```

- [ ] **Step 5: Commit**

```bash
git add app/api/v1/volunteers.py app/api/v1/talent.py app/api/v1/router.py
git commit -m "feat: add volunteer and talent API endpoints"
```

---

### Task 6: Frontend Types + API Services

**Files:**
- Modify: `src/types/index.ts`
- Create: `src/services/volunteerApi.ts`
- Create: `src/services/talentApi.ts`

- [ ] **Step 1: Add types to `src/types/index.ts`**

Append after `AuthTokens`:
```typescript
export interface Volunteer {
  id: string;
  name: string;
  phone: string;
  skills: string;
  available_time: string;
  created_at: string;
}

export interface Talent {
  id: string;
  name: string;
  phone: string;
  category: 'freelancer' | 'musician' | 'artist';
  skills: string;
  available_time: string;
  rate: number;
  rate_unit: 'hr' | 'gig' | 'day';
  created_at: string;
}
```

- [ ] **Step 2: Create volunteer API service**

```typescript
// src/services/volunteerApi.ts
import api from './api';

export const volunteerApi = {
  list: (params?: Record<string, string>) =>
    api.get('/volunteers', { params }),
  enroll: (data: { name: string; phone: string; skills: string; available_time: string }) =>
    api.post('/volunteers', data),
};
```

- [ ] **Step 3: Create talent API service**

```typescript
// src/services/talentApi.ts
import api from './api';

export const talentApi = {
  list: (params?: Record<string, string>) =>
    api.get('/talent', { params }),
  register: (data: {
    name: string; phone: string; category: string;
    skills: string; available_time: string; rate: number; rate_unit: string;
  }) =>
    api.post('/talent', data),
  sendInquiry: (talentId: string, data: { name: string; message: string; preferred_date?: string }) =>
    api.post(`/talent/${talentId}/inquiries`, data),
};
```

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts src/services/volunteerApi.ts src/services/talentApi.ts
git commit -m "feat: add frontend types and API services for volunteer and talent"
```

---

### Task 7: Frontend Volunteer Page

**Files:**
- Create: `src/pages/VolunteerPage.tsx`

- [ ] **Step 1: Create VolunteerPage**

Full-page component with:
- Green hero banner matching app theme
- Enrollment form (name, phone, skills, available time) with submit
- Success toast on enrollment
- Grid of volunteer cards below showing all enrolled volunteers
- Uses `PageLayout`, `Card`, `Button`, `Input` from shadcn/ui
- Calls `volunteerApi.enroll()` and `volunteerApi.list()`
- Responsive grid: 1 col mobile, 2 cols md, 3 cols lg
- Each card shows: name, phone, skills as badges, available time
- Phone shown as clickable `tel:` link

- [ ] **Step 2: Verify in browser**

Navigate to `http://localhost:5173/volunteers`, fill in the form, submit, confirm card appears.

- [ ] **Step 3: Commit**

```bash
git add src/pages/VolunteerPage.tsx
git commit -m "feat: add volunteer enrollment page"
```

---

### Task 8: Frontend Talent Page

**Files:**
- Create: `src/pages/TalentPage.tsx`

- [ ] **Step 1: Create TalentPage**

Full-page component with:
- Green hero banner
- Registration form: name, phone, category (select: freelancer/musician/artist), skills, available time, rate, rate unit (select: hr/gig/day)
- Category filter tabs (All / Freelancer / Musician / Artist) above the listing grid
- Talent cards showing: name, category badge, skills, availability, rate formatted as "$50/hr"
- "Book" button on each card opens a modal/dialog with: your name, message, preferred date
- On inquiry submit: show success with talent's phone number for direct coordination
- Responsive grid: 1 col mobile, 2 cols md, 3 cols lg

- [ ] **Step 2: Verify in browser**

Navigate to `http://localhost:5173/talent`, register talent, filter by category, click Book, submit inquiry.

- [ ] **Step 3: Commit**

```bash
git add src/pages/TalentPage.tsx
git commit -m "feat: add talent marketplace page with booking inquiry"
```

---

### Task 9: Wire Up Routes + Navbar

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/layout/Navbar.tsx`

- [ ] **Step 1: Add routes to App.tsx**

Add imports and routes:
```typescript
import VolunteerPage from '@/pages/VolunteerPage';
import TalentPage from '@/pages/TalentPage';

// In Routes, add as public routes:
<Route path="/volunteers" element={<VolunteerPage />} />
<Route path="/talent" element={<TalentPage />} />
```

- [ ] **Step 2: Add Navbar links**

Add "Volunteers" and "Talent" links to the nav bar, visible to all users (both authenticated and unauthenticated):

```tsx
<Link to="/volunteers" className="text-sm font-medium text-gray-600 hover:text-green-600">
  Volunteers
</Link>
<Link to="/talent" className="text-sm font-medium text-gray-600 hover:text-green-600">
  Talent
</Link>
```

- [ ] **Step 3: Verify navigation**

Click Volunteers and Talent links in navbar, confirm pages load correctly.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/components/layout/Navbar.tsx
git commit -m "feat: add volunteer and talent routes and navbar links"
```

---

### Task 10: Final Verification

- [ ] **Step 1: Full flow test — Volunteers**

1. Navigate to /volunteers
2. Fill in form and submit
3. Verify card appears in grid
4. Verify phone link is clickable

- [ ] **Step 2: Full flow test — Talent**

1. Navigate to /talent
2. Register as musician
3. Filter by "Musician" tab — confirm card shows
4. Click "Book" — fill inquiry form
5. Verify success shows talent's phone number

- [ ] **Step 3: Verify all API endpoints**

```bash
curl -s http://localhost:8000/api/v1/volunteers | python3 -m json.tool
curl -s http://localhost:8000/api/v1/talent | python3 -m json.tool
curl -s http://localhost:8000/api/v1/talent?category=musician | python3 -m json.tool
```
