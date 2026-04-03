# The Bend — Product Requirements Document (PRD)

**Version:** 1.0
**Date:** April 3, 2026
**Author:** AlfredX
**Status:** Draft

---

## 1. Problem Statement

Small and medium shops clustered along a road bend face a recurring set of operational problems: overstaffing on slow days and understaffing on busy ones, raw materials expiring before they can be used while neighboring shops scramble to procure the same items, and equipment sitting idle in one shop while another desperately needs it.

These problems affect 15–50 mixed-type businesses (restaurants, cafés, retail stores, service providers) on a daily basis. The shops already have an informal willingness to share resources, but there is no structured, reliable way to coordinate. The result is wasted money on spoiled inventory, lost revenue from understaffing, and underutilized equipment — all within walking distance of a solution.

**The cost of not solving this:** Each shop independently absorbs losses that could be offset by its neighbors. Without a coordination layer, the community leaves significant value on the table every single week.

---

## 2. Goals

### User Goals
- **Reduce waste:** Shop owners can offload expiring raw materials to neighbors who need them, cutting spoilage losses by at least 30% within 6 months of adoption.
- **Right-size staffing:** Shops can borrow or lend employees on short notice, reducing understaffing incidents by 40% and overstaffing costs by 25%.
- **Share equipment:** Shops can access equipment they need occasionally without purchasing it, saving capital expenditure.
- **Save time:** Finding a resource (staff, material, equipment) from a neighbor takes under 5 minutes via the app, versus hours of phone calls or walking around.

### Business Goals
- **Community adoption:** 60% of bend shops registered and active within 3 months of launch.
- **Transaction volume:** At least 50 successful shares/transactions per month by month 3.
- **Platform stickiness:** Weekly active users among registered shops exceeds 70%.

---

## 3. Non-Goals (v1)

- **Payment processing / escrow:** The app will not handle money transfers directly. Shops set optional prices, but payment happens outside the app (cash, bank transfer, etc.). *Why: Adding payments introduces regulatory complexity and slows down v1 launch.*
- **Delivery / logistics coordination:** The app connects shops but does not arrange pickup or delivery. *Why: Shops are within walking distance; logistics adds unnecessary complexity.*
- **Inventory management system:** The app is not a full inventory tracker for individual shops. *Why: That's a different product; we focus on the sharing/exchange layer.*
- **Multi-community / franchise model:** v1 serves a single bend community. Expansion to other communities is a future consideration. *Why: Nail the single-community experience first.*
- **AI-powered matching or recommendations:** No automated "you might need this" suggestions in v1. *Why: Need usage data first before building smart features.*

---

## 4. User Personas & Stories

### Personas

| Persona | Description |
|---|---|
| **Shop Owner** | Runs a business on the bend. Posts available resources or requests what they need. May also be a Shop Admin. |
| **Shop Employee** | Works at a bend shop. May be listed as available staff by their shop admin. Can browse listings. |
| **Community Admin** | Manages the overall platform. Approves new shop registrations, moderates content, resolves disputes. |
| **Shop Admin** | Manages their own shop's profile, listings, and employees on the platform. Approved by Community Admin. |
| **Browser (Anonymous)** | Anyone who visits the app. Can browse all listings but cannot post, request, or message without registering. |

### User Stories

**Registration & Access**

- As a **browser**, I want to view all available listings without creating an account so that I can see if the platform is useful before committing.
- As a **shop owner**, I want to register my shop with basic details (name, type, location, contact) and agree to the community guidelines so that I can start posting and requesting resources.
- As a **community admin**, I want to upload community guidelines (docx/pdf/txt) that new shops must accept during registration so that everyone agrees to the same rules.
- As a **community admin**, I want to review and approve or reject shop registration requests so that only legitimate bend businesses join the platform.
- As a **shop admin**, I want to invite employees to join under my shop's profile so that I can list them as available staff when needed.

**Posting & Listing Resources**

- As a **shop admin**, I want to list surplus employees with their skills, availability window, and optional hourly rate so that neighboring shops can find temporary help.
- As a **shop admin**, I want to list raw materials I have in excess with quantity, expiry date, and optional price so that they don't go to waste.
- As a **shop admin**, I want to list equipment I'm willing to share with availability dates and optional rental fee so that it doesn't sit idle.
- As a **shop admin**, I want to mark a listing with an urgency level (normal, urgent, critical) so that time-sensitive items like expiring food get attention fast.
- As a **shop admin**, I want to set listings as free or priced so that I have flexibility in how I share.

**Requesting Resources**

- As a **shop admin**, I want to post a request for staff, raw materials, or equipment I need — specifying what, when, and how urgently — so that the community knows what I'm looking for.
- As a **shop admin**, I want to browse and filter listings by category (staff, materials, equipment), urgency, and price (free/paid) so that I can quickly find what I need.
- As a **shop admin**, I want to respond to a listing to express interest so that the poster knows I want to take them up on the offer.

**Communication**

- As a **registered user**, I want to message another shop through in-app chat so that we can negotiate details without leaving the platform.
- As a **registered user**, I want to see a shop's contact info (phone/WhatsApp) on their profile so that I can reach out directly if preferred.

**Urgency & Notifications**

- As a **shop admin**, I want to receive push notifications when someone posts an urgent request matching my shop type so that I can respond quickly.
- As a **shop admin**, I want to receive email summaries of new listings and requests so that I stay informed even when not actively using the app.
- As a **shop admin**, I want urgent/critical listings to appear prominently (top of feed, highlighted) so that time-sensitive needs don't get buried.

**Admin & Moderation**

- As a **community admin**, I want a dashboard showing all pending registrations, active listings, and flagged content so that I can manage the community efficiently.
- As a **community admin**, I want to suspend or remove shops that violate community guidelines so that the platform remains trustworthy.
- As a **shop admin**, I want to manage my shop's listings (edit, mark as fulfilled, delete) so that the information stays current.

---

## 5. Requirements

### P0 — Must-Have (MVP)

| # | Feature | Description | Acceptance Criteria |
|---|---|---|---|
| P0-1 | **Public Browse Feed** | Anyone can view all active listings (staff, materials, equipment) without an account. | Given an anonymous user visits the app, when they open the feed, then all active listings are visible with category, title, urgency tag, and price/free badge. No login prompt blocks browsing. |
| P0-2 | **Shop Registration with Admin Approval** | Shop owners submit a registration form and accept community guidelines. Community admin approves or rejects. No geographic boundary — admin approval is the sole gatekeeper. | Given a shop owner fills in name, business type, location, and contact info, and accepts the community guidelines, when they submit, then the request appears in the community admin's queue. Admin can approve (shop goes live) or reject (with reason sent to applicant). |
| P0-3 | **Tiered Admin System** | Community admin oversees platform; each shop has its own shop admin. | Given a community admin approves a shop, then the registering user becomes that shop's admin. Shop admin can manage only their own shop's listings and employees. Community admin can manage all. |
| P0-4 | **Create Listing (Offer)** | Shop admins can post available staff, raw materials, or equipment. | Given a shop admin creates a listing, they must select a category (staff/materials/equipment), add a title, description, quantity or availability, optional price, and urgency level. Listing appears in the public feed immediately. |
| P0-5 | **Create Request (Need)** | Shop admins can post what they need. | Given a shop admin creates a request, they specify category, description, quantity/duration needed, urgency level, and optional budget. Request appears in the feed tagged as "Request." |
| P0-6 | **Urgency Tags** | Every listing/request has an urgency level: Normal, Urgent, Critical. | Given a listing is marked Critical, then it appears at the top of the feed with a visual indicator (color/icon). Urgent listings appear above Normal. Sorting by urgency is the default feed order. |
| P0-7 | **Category Filtering** | Users can filter the feed by category and urgency. | Given a user applies a filter (e.g., "Materials" + "Urgent"), then only matching listings are shown. Filters can be combined. A "clear filters" option resets the view. |
| P0-8 | **Basic In-App Messaging** | Registered users can message each other about listings. | Given a registered user taps "Interested" on a listing, then a chat thread opens between the two shop admins. Messages are delivered in real time. Chat history is persisted. |
| P0-9 | **Contact Info on Profile** | Shop profiles display phone and/or WhatsApp for direct contact. | Given a registered user views a shop profile, then the shop's contact number and WhatsApp link (if provided) are visible. |
| P0-10 | **Push Notifications** | Registered users receive push notifications for key events. | Notifications fire for: new message received, someone expresses interest in your listing, new urgent/critical listing in your category preferences. Users can toggle notification categories on/off. |
| P0-11 | **Community Admin Dashboard** | Web-based admin panel for the community admin. | Dashboard shows: pending registrations (count + queue), active listings count, registered shops count, and flagged content. Admin can approve/reject registrations, and suspend shops. |
| P0-13 | **Community Guidelines Upload** | Admin uploads community guidelines as a file (docx, pdf, or txt) via the admin panel. | Given a community admin uploads a guidelines file, then that file is stored and presented to all new shops during registration. Shops must check an "I agree to the community guidelines" box (with a link to view/download the file) before submitting registration. Admin can replace the file at any time; new registrants see the latest version. |
| P0-12 | **Listing Management** | Shop admins can edit, mark as fulfilled, or delete their listings. | Given a shop admin opens their listing, they can edit all fields, mark it as "Fulfilled" (removes from active feed but keeps in history), or delete it entirely. |

### P1 — Nice-to-Have (Fast Follow)

| # | Feature | Description |
|---|---|---|
| P1-1 | **Email Notifications** | Configurable email digests (daily/weekly) summarizing new listings, requests, and messages. |
| P1-2 | **Employee Profiles** | Shop admins can add employee profiles with skills, certifications, and availability. Other shops can browse available employees. |
| P1-3 | **Search** | Full-text search across listings, requests, and shop names. |
| P1-4 | **Ratings & Reviews** | After a share/transaction, both parties can leave a rating and short review. Builds community trust. |
| P1-5 | **Expiry Countdown** | For raw material listings with an expiry date, show a live countdown. Auto-boost urgency as expiry approaches. |
| P1-6 | **Listing History & Analytics** | Shop admins see a history of their past listings and basic stats (views, interests, fulfillments). |
| P1-7 | **Notification Preferences** | Granular control: choose which categories and urgency levels trigger notifications. |

### P2 — Future Considerations

| # | Feature | Description |
|---|---|---|
| P2-1 | **In-App Payments** | Integrated payment processing for paid shares (Stripe, mobile money, etc.). |
| P2-2 | **Multi-Community Support** | Expand to multiple bend communities, each with their own admin and member base. |
| P2-3 | **AI Matching** | Smart suggestions: "Shop X has tomatoes expiring tomorrow, and you requested tomatoes last week." |
| P2-4 | **Scheduling & Calendar** | Staff sharing with shift-level scheduling and calendar integration. |
| P2-5 | **Equipment Booking System** | Reserve equipment for specific dates/times with a shared calendar view. |
| P2-6 | **Analytics Dashboard** | Community-level insights: total waste saved, staff hours shared, most active shops, etc. |

---

## 6. Technical Architecture (High-Level)

### Stack
- **Frontend (Single Codebase):** React Progressive Web App (PWA) — one responsive app that works in the browser, can be installed on mobile home screens (iOS + Android), and serves the admin panel. No app store submission required.
- **PWA Capabilities:** Service worker for offline caching and background sync, Web App Manifest for install prompts, responsive design (mobile-first, adapts to desktop for admin panel).
- **Backend API:** Python with FastAPI (async, high-performance, auto-generated OpenAPI docs)
- **ORM:** SQLAlchemy 2.0 with async support (via asyncpg)
- **Database:** PostgreSQL (relational data: shops, users, listings, messages) + Redis (caching, real-time features)
- **Authentication:** JWT-based auth (via python-jose or PyJWT) with role-based access control (Browser, Shop Employee, Shop Admin, Community Admin). Password hashing with bcrypt (passlib).
- **Push Notifications:** Web Push API with service workers (via pywebpush on the backend). Works on Android and desktop browsers. iOS supports web push as of Safari 16.4+.
- **Email:** FastAPI-Mail or SendGrid Python SDK for transactional and digest emails
- **Real-time Messaging:** WebSockets (native FastAPI WebSocket support) for in-app chat
- **File Storage:** AWS S3 (via boto3) or Cloudinary for listing images and community guidelines documents (docx/pdf/txt)
- **Migrations:** Alembic for database schema migrations
- **Hosting:** Vercel or Netlify (frontend PWA) + Railway, Render, or AWS (backend API)

### Key Data Models

```
Shop: { id, name, type, location, contactPhone, whatsapp, status (pending/active/suspended), adminUserId, createdAt }

User: { id, name, email, phone, role (community_admin/shop_admin/shop_employee/browser), shopId, createdAt }

Listing: { id, shopId, type (offer/request), category (staff/materials/equipment), title, description, quantity, unit, expiryDate, price, isFree, urgency (normal/urgent/critical), status (active/fulfilled/deleted), createdAt }

Message: { id, threadId, senderId, receiverId, listingId, content, readAt, createdAt }

Notification: { id, userId, type, title, body, read, data, createdAt }
```

---

## 7. Success Metrics

### Leading Indicators (First 30 Days)
| Metric | Target | Measurement |
|---|---|---|
| Shop registrations | 50% of bend shops registered | Registration count vs. known shop count |
| Listing creation rate | 5+ new listings/day by week 3 | Daily listing count from DB |
| Response rate | 40% of listings get at least 1 interest | Interest count per listing |
| Time to first response | Under 2 hours for urgent listings | Timestamp delta: listing created → first interest |

### Lagging Indicators (3–6 Months)
| Metric | Target | Measurement |
|---|---|---|
| Community adoption | 60% of shops active weekly | WAU / total registered shops |
| Waste reduction | 30% fewer expired materials reported by shops | Quarterly survey of participating shops |
| Successful shares | 50+ completed transactions/month | Listings marked "fulfilled" per month |
| User satisfaction | NPS > 40 | In-app survey at 3 months |
| Staffing improvement | 40% fewer understaffing incidents | Quarterly survey |

---

## 8. Screens & User Flows (Overview)

### PWA Screens (Mobile-First, Responsive)

**Public / Shop User Views:**
1. **Home / Feed** — Browse all listings and requests, filtered by category and urgency
2. **Listing Detail** — Full details, urgency badge, price/free tag, "I'm Interested" button, poster's shop info
3. **Create Listing / Request** — Form with category, title, description, quantity, price toggle, urgency selector, optional expiry date and photo
4. **My Shop** — Shop profile, manage listings, employee list, contact info
5. **Messages** — Chat threads organized by listing
6. **Notifications** — Push notification history
7. **Registration** — Shop registration form with community guidelines acceptance (pending approval screen)
8. **Settings** — Notification preferences, profile editing, logout
9. **Install Prompt** — Banner encouraging users to "Add to Home Screen" for the native app experience

**Admin Panel Views (desktop-optimized, accessible via same PWA):**
1. **Dashboard** — Overview stats (pending registrations, active listings, active shops)
2. **Registration Queue** — List of pending shops with approve/reject actions and detail view
3. **Shops Directory** — All registered shops with status, ability to suspend/reactivate
4. **Listings Management** — View and moderate all listings, flag or remove inappropriate ones
5. **Community Guidelines** — Upload/replace guidelines file (docx/pdf/txt), view current version
6. **Reports** — Basic usage analytics (registrations over time, listings by category, fulfillment rate)

---

## 9. Open Questions

| # | Question | Owner | Blocking? | Status |
|---|---|---|---|---|
| 1 | What community guidelines or terms of service should shops agree to upon registration? | AlfredX | No | **RESOLVED** — Admin uploads guidelines as a file (docx/pdf/txt) via the admin panel. Shops must accept these during registration. |
| 2 | Should there be a limit on how many active listings a shop can have? | AlfredX / Product | No | Open |
| 3 | How do we handle disputes (e.g., shared equipment returned damaged)? | AlfredX / Community | No — can be manual for v1 | Open |
| 4 | Is there a geographical boundary for the "bend" or is it self-selecting? | AlfredX | No | **RESOLVED** — No geographic boundary enforcement. Membership is controlled entirely by admin approval. If the admin approves a shop, it's in. |
| 5 | Should employees consent before being listed as available for sharing? | AlfredX | No | **RESOLVED** — No employee consent required. Shop admins have full authority to list their employees. |
| 6 | What happens to listings when a shop is suspended by the admin? | Engineering | No — default: hide all listings | Open |
| 7 | Do we need multilingual support for v1? | AlfredX | No — can add later | Open |

---

## 10. Timeline Considerations

### Suggested Phasing

**Phase 1 — MVP (6–8 weeks)**
- Core: Registration flow with admin approval + guidelines upload, listing/request creation, public feed with filtering, urgency tags, basic in-app messaging, push notifications, admin dashboard.
- Platform: Single React PWA (mobile-first, installable, responsive admin views). No app store deployment needed — faster time to market.

**Phase 2 — Enhancements (4–6 weeks after MVP)**
- Email digests, employee profiles, search, ratings & reviews, expiry countdown, listing analytics.

**Phase 3 — Scale (Future)**
- In-app payments, multi-community expansion, AI matching, scheduling, equipment booking, community analytics.

### Dependencies
- VAPID keys setup for Web Push notifications
- Domain and hosting provisioned
- Community guidelines written and agreed upon
- Initial list of bend shops for outreach/onboarding

---

## 11. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Low adoption — shops don't register | Platform has no value without participants | Pre-launch outreach, onboard 5–10 anchor shops before public launch. Personal demos. |
| Urgency abuse — everything marked "critical" | Urgency system loses meaning | Rate-limit critical tags (e.g., max 2 active critical listings per shop). Community admin can downgrade. |
| Trust issues — shops reluctant to share | Low transaction volume | Ratings system in P1. Start with low-stakes items (surplus materials). Community events to build trust. |
| Single admin bottleneck | Registrations and moderation delayed | Add committee/multi-admin support if volume demands it. Keep approval flow simple and fast. |
| Spam or irrelevant listings | Poor user experience | Admin moderation tools. Community reporting. Auto-expire listings after configurable period (default: 7 days). |

---

*This is a living document. Update as decisions are made and questions are resolved.*
