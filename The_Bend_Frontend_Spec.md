# The Bend — Frontend Specification

**Version:** 1.0
**Date:** April 3, 2026
**Stack:** React PWA + shadcn/ui + Tailwind CSS
**Companion Doc:** The_Bend_PRD.md

---

## 1. Architecture Overview

### Platform
- **React PWA** — single codebase, mobile-first responsive, installable via "Add to Home Screen"
- **Routing:** React Router v6 (role-based route guards)
- **State Management:** Zustand (lightweight, minimal boilerplate)
- **API Client:** Axios with interceptors for JWT refresh
- **Real-time:** Socket.io-client for WebSocket chat
- **UI Library:** shadcn/ui v4 components + Tailwind CSS
- **Icons:** Lucide React
- **Forms:** React Hook Form + Zod validation
- **Notifications:** Web Push API + service worker

### Design Tokens
- **Primary Color:** `hsl(142, 76%, 36%)` — a fresh green representing community/growth
- **Urgency Colors:** Normal = `muted`, Urgent = `hsl(38, 92%, 50%)` (amber), Critical = `hsl(0, 84%, 60%)` (red)
- **Border Radius:** `0.5rem` (default shadcn)
- **Font:** Inter (system fallback stack)

### Responsive Breakpoints
- **Mobile:** < 768px (primary target, bottom nav)
- **Tablet:** 768–1024px (sidebar nav)
- **Desktop:** > 1024px (full sidebar + wider content area, optimized for admin)

### Role-Based Access

| Route Pattern | Browser (Anon) | Shop Employee | Shop Admin | Community Admin |
|---|---|---|---|---|
| `/` (Feed) | Read | Read | Read + Post | Read + Post |
| `/listing/:id` | Read | Read | Read + Act | Read + Moderate |
| `/register` | Access | — | — | — |
| `/my-shop` | — | View | Full CRUD | — |
| `/messages` | — | — | Full | Full |
| `/admin/*` | — | — | — | Full |
| `/settings` | — | View | Full | Full |

---

## 2. Global Layout & Navigation

### 2.1 Mobile Layout (< 768px)

```
┌──────────────────────────┐
│  Top Bar                 │
│  [Logo]  "The Bend"  [🔔]│
├──────────────────────────┤
│                          │
│     Page Content         │
│     (scrollable)         │
│                          │
├──────────────────────────┤
│  Bottom Nav              │
│  [Home] [Search] [+] [💬] [Me]│
└──────────────────────────┘
```

**shadcn components:** `button`, `badge` (notification count), `separator`

**Top Bar:**
- Left: The Bend logo/icon
- Center: Page title (dynamic)
- Right: Notification bell with `Badge` showing unread count

**Bottom Navigation (5 tabs):**
- **Home** — Feed of all listings/requests
- **Search** — Filter & search view
- **+ (Create)** — Floating action: New Listing or New Request (opens `Sheet` from bottom)
- **Messages** — Chat threads (requires auth)
- **Me** — Shop profile / login prompt if anonymous

### 2.2 Desktop Layout (≥ 768px) — Community Portal Style

Inspired by local government community portals (e.g., kentohio.gov), the desktop layout uses a **sticky top navigation bar** instead of a sidebar for the public-facing pages. This creates a welcoming, open community feel rather than a utilitarian app feel.

```
┌──────────────────────────────────────────────────────┐
│  [Logo] The Bend    [Home] [Browse] [About]   [🔔] [Login/Avatar] │
├──────────────────────────────────────────────────────┤
│                                                      │
│                  Page Content                        │
│                  (full-width, scrollable)             │
│                                                      │
├──────────────────────────────────────────────────────┤
│  Footer: About · Contact · Guidelines · Social       │
└──────────────────────────────────────────────────────┘
```

**shadcn components:** `navigation-menu`, `avatar`, `tooltip`, `separator`, `button`

- Sticky top navbar with logo, nav links, notification bell, and login/avatar
- Full-width content area — no sidebar on public pages
- Nav links with dropdowns using shadcn `navigation-menu`
- Logged-in users see: Home, Browse, Messages, My Shop
- Anonymous users see: Home, Browse, About, Register/Login

### 2.3 Admin Layout (Desktop-Optimized)

Admin panel (`/admin/*`) uses a **sidebar layout** distinct from the public portal. This clearly separates the community-facing experience from the management tools.

```
┌────────┬───────────────────────────┐
│Sidebar │  Top Bar                  │
│        │  [Search] [🔔] [Avatar]   │
│ [Logo] ├───────────────────────────┤
│ Dash   │                           │
│ Regs   │     Admin Content         │
│ Shops  │     (scrollable)          │
│ Lists  │                           │
│ Guide  │                           │
│ Reports│                           │
└────────┴───────────────────────────┘
```

Uses shadcn `Sidebar` with grouped sections. Only accessible to community admin role.

---

## 3. Screen Specifications

---

### Screen 1: Home — Community Landing Page

**Route:** `/`
**Access:** Everyone (anonymous + registered)
**Purpose:** Community portal landing page — welcoming, informative, and action-oriented. Designed to feel like a local community hub (inspired by kentohio.gov), not just an app feed.

#### Layout (Desktop — Full Width)

```
┌──────────────────────────────────────────────────────────────────┐
│  STICKY NAVBAR                                                    │
│  [🏘️ Logo] The Bend    [Home] [Browse] [About]    [🔔] [Login]  │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ╔══════════════════════════════════════════════════════════════╗ │
│  ║                     HERO BANNER                              ║ │
│  ║     Full-width photo of the bend / local community           ║ │
│  ║                                                              ║ │
│  ║              WELCOME TO                                      ║ │
│  ║              The Bend Community                              ║ │
│  ║     Share staff, materials & equipment with                  ║ │
│  ║              your neighbors                                   ║ │
│  ║                                                              ║ │
│  ║     [ 🔍 Search listings, shops, or resources... ]           ║ │
│  ║                                                              ║ │
│  ║     [Browse Listings]   [Register Your Shop]                 ║ │
│  ╚══════════════════════════════════════════════════════════════╝ │
│                                                                   │
│  ── QUICK LINKS (Icon Grid — 6 items) ──────────────────────── │
│                                                                   │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ │
│  │  👤    │ │  📦    │ │  🔧    │ │  🏪    │ │  📋    │ │  💬    │ │
│  │ Share  │ │ Raw    │ │ Equip- │ │  Shop  │ │ Post a │ │ Commu- │ │
│  │ Staff  │ │Materi- │ │  ment  │ │Direct- │ │Request │ │  nity  │ │
│  │        │ │  als   │ │        │ │  ory   │ │        │ │ Guide  │ │
│  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘ └────────┘ │
│                                                                   │
│  ── URGENT & CRITICAL (Highlighted Banner) ─────────────────── │
│                                                                   │
│  🔴 3 critical items need attention right now    [View All →]    │
│                                                                   │
│  ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐ │
│  │ 🔴 Tomatoes 5kg  │ │ 🔴 Need baker   │ │ 🟡 Olive oil 5L  │ │
│  │ Expiring tomorrow│ │ Tomorrow 6 AM   │ │ Needed urgently  │ │
│  │ Fresh Bites·FREE │ │ Corner Grill    │ │ Bella Pasta·PAID │ │
│  │ 📦 Materials·2h  │ │ 👤 Staff · 1h   │ │ 📦 Materials·30m │ │
│  └──────────────────┘ └──────────────────┘ └──────────────────┘ │
│                                                                   │
│  ── WHAT'S HAPPENING ───────────────────────────────────────── │
│                                                                   │
│  ┌─────────────────────────┐  ┌─────────────────────────────┐   │
│  │ Community Board          │  │ Recently Fulfilled           │   │
│  │                          │  │                              │   │
│  │ ▸ Lawnmower available    │  │ ✅ 10kg flour shared         │   │
│  │   Mama's Kitchen · 3h    │  │    Fresh Bites → Corner Grill│  │
│  │ ▸ Need part-time cashier │  │ ✅ Mixer lent for weekend    │  │
│  │   Deli Plus · 5h         │  │    Mama's → Bella Pasta     │  │
│  │ ▸ Extra chairs available │  │ ✅ 2 waitstaff shared Sat    │  │
│  │   Tool Hub · 1d          │  │    Deli Plus → Corner Grill │  │
│  │                          │  │                              │   │
│  │ [View All Listings →]    │  │ [View All →]                │   │
│  └─────────────────────────┘  └─────────────────────────────┘   │
│                                                                   │
│  ── COMMUNITY STATS ────────────────────────────────────────── │
│                                                                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │   28     │  │   142    │  │   89     │  │   $4.2K  │        │
│  │  Active  │  │  Active  │  │  Items   │  │  Saved   │        │
│  │  Shops   │  │ Listings │  │ Shared   │  │ in Waste │        │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘        │
│                                                                   │
│  ── FOOTER (Dark Green) ─────────────────────────────────────  │
│                                                                   │
│  [🏘️ Logo]  About The Bend    Quick Links     Connect           │
│             Our Story          Browse Staff    📞 Contact        │
│             Community          Browse Materials WhatsApp         │
│             Guidelines         Browse Equipment                  │
│             Register           Shop Directory                    │
│                                                                   │
│  © 2026 The Bend Community                                       │
└──────────────────────────────────────────────────────────────────┘
```

#### Layout (Mobile — Stacked)

On mobile, the same sections stack vertically. The hero is shorter (40vh), quick links become a 3×2 grid, and cards are full-width single column.

```
┌──────────────────────────┐
│  [🏘️] The Bend    [🔔][☰]│  ← Hamburger menu on mobile
├──────────────────────────┤
│  ┌────────────────────┐  │
│  │    HERO BANNER     │  │
│  │  Welcome to        │  │
│  │  The Bend          │  │
│  │  Community         │  │
│  │  [🔍 Search...]    │  │
│  │  [Browse] [Register]│ │
│  └────────────────────┘  │
│                          │
│  Quick Links (3x2 grid)  │
│  [Staff] [Materials][Equip]│
│  [Shops] [Post]  [Guide] │
│                          │
│  🔴 Urgent Needs         │
│  [Horizontal scroll cards]│
│                          │
│  What's Happening        │
│  [Community Board]       │
│  [Recently Fulfilled]    │
│                          │
│  Community Stats (2x2)   │
│                          │
│  [Footer]                │
├──────────────────────────┤
│  [🏠][🔍][+][💬][🏪]    │  ← Bottom nav
└──────────────────────────┘
```

#### Section-by-Section Breakdown

**Section A: Sticky Navbar**
- shadcn: `navigation-menu`, `button`, `avatar`, `badge`, `sheet` (mobile hamburger)
- Desktop: Logo left, nav links center, bell + login/avatar right
- Mobile: Logo left, bell + hamburger right → `Sheet` slides in from right with nav items
- Logged-in: nav shows Home, Browse, Messages, My Shop (+ Admin if community_admin)
- Anonymous: Home, Browse, About, Register, Login

**Section B: Hero Banner**
- Full-width background image (community/bend photo) with dark overlay for text contrast
- White centered text: "WELCOME TO" (small caps) + "The Bend Community" (large bold)
- Subtitle: "Share staff, materials & equipment with your neighbors"
- shadcn `input` styled as a search bar with search icon (triggers `/browse?search=...`)
- Two CTA buttons: "Browse Listings" (primary/filled) + "Register Your Shop" (outline/white)
- Height: 60vh desktop, 40vh mobile
- Optional: subtle parallax scroll effect on background image

**Section C: Quick Links Icon Grid**
- shadcn: `card` (hoverable), Lucide icons
- 6 cards in a single row (desktop) or 3×2 grid (mobile)
- Each card: large icon (48px) + label (2 words max)
- Icons are Lucide: `Users` (Staff), `Package` (Materials), `Wrench` (Equipment), `Store` (Shop Directory), `ClipboardList` (Post a Request), `BookOpen` (Community Guidelines)
- On hover: slight scale-up + shadow lift
- Clicking navigates to the relevant browse filter or page

**Section D: Urgent & Critical Banner**
- Eye-catching section with warm background tint (red-50 or amber-50)
- Header: red dot + "X critical items need attention right now" + "View All →" link
- Horizontal scrolling card row (3 visible on desktop, 1.5 on mobile for peek effect)
- Uses the same `ListingCard` component from Screen 2 (Listing Detail)
- Auto-refreshes every 60 seconds
- shadcn: `card`, `badge`, `carousel`, `button`

**Section E: What's Happening (Two-Column)**
- **Left: Community Board** — latest 5 listings (title, shop name, time ago), linked to detail
- **Right: Recently Fulfilled** — latest 5 completed shares with green checkmarks, showing "Shop A → Shop B" transfer format
- Each column is a shadcn `card` with a scrollable list
- "View All →" links at bottom of each
- shadcn: `card`, `scroll-area`, `badge`, `separator`

**Section F: Community Stats**
- 4 stat cards in a row (desktop) or 2×2 grid (mobile)
- Each: large number (bold, colored) + label below
- Stats pulled from `/api/v1/admin/reports` (public summary endpoint)
- Animated count-up on scroll into view (intersection observer)
- shadcn: `card`

**Section G: Footer**
- Dark green background (`hsl(142, 76%, 20%)`) with white text
- 4-column layout: Logo+tagline, About links, Quick Links, Connect (contact + social)
- Community guidelines download link in About column
- Bottom bar: © 2026 The Bend Community
- Mobile: stacks to single column
- shadcn: `separator`

#### Behavior
- Hero search bar: on submit, navigates to `/browse?search=<query>`
- Quick links: navigate to `/browse?category=staff`, `/browse?category=materials`, etc.
- Urgent cards auto-scroll/rotate on desktop (carousel with pause on hover)
- Stats animate when scrolled into view
- Install PWA banner shows above footer for eligible mobile visitors
- The entire page is publicly accessible — no auth required for any section

#### States
- **Loading:** Hero shows immediately (SSR/static), sections below use `Skeleton` loaders
- **Empty urgent section:** Hidden entirely if no urgent/critical listings exist
- **Empty community board:** Shows "No listings yet — be the first to share!" with CTA
- **Error:** Individual sections fail gracefully; error shown inline, rest of page still works

---

### Screen 1B: Browse / Feed

**Route:** `/browse`
**Access:** Everyone (anonymous + registered)
**Purpose:** Dedicated search and filter page for all listings — the "working" view where users find what they need.

#### Layout

```
┌──────────────────────────────────────────────────────────┐
│  NAVBAR                                                   │
├──────────────────────────────────────────────────────────┤
│  Browse Listings                                          │
│  [🔍 Search staff, materials, equipment...]              │
│                                                          │
│  Filters:                                                │
│  [All] [Staff] [Materials] [Equipment]                   │
│  [Urgency ▼] [Price ▼] [Type: Offer/Request ▼]         │
├──────────────────────────────────────────────────────────┤
│  Showing 142 results                    [Sort: Urgency ▼]│
├──────────────────────────────────────────────────────────┤
│  ┌────────────┐ ┌────────────┐ ┌────────────┐           │
│  │ 🔴 Tomatoes│ │ 🟡 Need 2  │ │ ⚪ Blender │           │
│  │ 5kg · FREE │ │ waitstaff  │ │ available  │           │
│  │ Fresh Bites│ │Corner Grill│ │ Mama's     │           │
│  └────────────┘ └────────────┘ └────────────┘           │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐           │
│  │ ...        │ │ ...        │ │ ...        │           │
│  └────────────┘ └────────────┘ └────────────┘           │
│                   [Load More]                            │
└──────────────────────────────────────────────────────────┘
```

#### shadcn Components

| Component | Usage |
|---|---|
| `input` | Search bar with icon |
| `toggle-group` | Category filter tabs (All / Staff / Materials / Equipment) |
| `select` | Urgency, Price, Type dropdown filters |
| `card` | Each listing/request card (3-column grid on desktop, single column on mobile) |
| `badge` | Urgency, Category, FREE/PAID, Offer/Request tags |
| `button` | "Load More" pagination, filter reset |
| `skeleton` | Loading state for cards |

#### Card Anatomy (Listing Card)

Each `Card` contains:
- **CardHeader:** Urgency badge (colored dot + label) + listing type badge ("Offer" / "Request")
- **CardContent:** Title (bold, 1 line), Description (2 lines, truncated), Expiry countdown if applicable
- **CardFooter:** Shop avatar + name (left), Category icon (center), Price/FREE + timestamp (right)

#### Behavior
- Default sort: Critical → Urgent → Normal, then by recency
- 3-column card grid (desktop), 2-column (tablet), 1-column (mobile)
- Infinite scroll or "Load More" (paginated API, 20 items/page)
- Filter state persisted in URL: `/browse?category=materials&urgency=urgent&search=tomatoes`
- Arrives pre-filtered when navigated from home page quick links or hero search
- Pull-to-refresh on mobile
- Tapping a card → `/listing/:id`
- Anonymous users can browse freely; "Post" actions prompt login

#### States
- **Empty (no results):** "No listings match your filters" + clear filters button
- **Empty (no listings at all):** Illustration + "No listings yet. Be the first to share!" + CTA
- **Loading:** 6 `Skeleton` cards in grid
- **Error:** `Alert` with retry

---

### Screen 2: Listing Detail

**Route:** `/listing/:id`
**Access:** Everyone can view; registered users can interact

#### Layout

```
┌──────────────────────────────┐
│ ← Back          [Share] [⋮] │
├──────────────────────────────┤
│  [Photo carousel if images]  │
├──────────────────────────────┤
│  🔴 CRITICAL                 │
│  Tomatoes — 5kg              │
│  "Ripe Roma tomatoes, bought │
│   2 days ago. Need to move   │
│   before they go bad."       │
│                              │
│  ⏰ Expires: Apr 5 (2 days)  │
│  📦 Category: Raw Materials  │
│  💰 Price: FREE              │
│  📋 Quantity: 5 kg           │
│  📅 Posted: 2 hours ago      │
├──────────────────────────────┤
│  Posted by                   │
│  [🏪 Avatar] Fresh Bites Café│
│  📞 +1234567890              │
│  💬 WhatsApp                 │
├──────────────────────────────┤
│                              │
│  [ 💬 Message Shop ]         │
│  [ ✅ I'm Interested ]       │
│                              │
└──────────────────────────────┘
```

#### shadcn Components

| Component | Usage |
|---|---|
| `card` | Main content container |
| `badge` | Urgency, category, price, offer/request type |
| `button` | Back, Share, "I'm Interested", "Message Shop", WhatsApp link |
| `carousel` | Photo gallery (if multiple images) |
| `avatar` | Shop avatar |
| `separator` | Between content sections |
| `dropdown-menu` | Overflow menu (⋮) — Report, Share, Copy Link |
| `alert-dialog` | "I'm Interested" confirmation dialog |
| `dialog` | Login prompt for anonymous users trying to interact |

#### Behavior
- "I'm Interested" sends a notification to the listing owner and opens a chat thread
- Anonymous users tapping "I'm Interested" or "Message Shop" get a `Dialog` prompting login/register
- Share button uses Web Share API (mobile) or copies link (desktop)
- Shop name links to shop profile
- Overflow menu: Report listing, Copy link, Share
- If the viewer is the listing owner: show Edit and Mark as Fulfilled buttons instead

#### Owner View (when viewing own listing)

Replace action buttons with:
- `[✏️ Edit Listing]` → navigates to edit form
- `[✅ Mark as Fulfilled]` → `AlertDialog` confirmation → moves to history
- `[🗑️ Delete]` → `AlertDialog` confirmation → soft delete

---

### Screen 3: Create Listing / Request

**Route:** `/create` (or `Sheet` overlay on mobile)
**Access:** Shop Admin only

#### Layout

```
┌──────────────────────────────┐
│ ✕ Close     Create Listing   │
├──────────────────────────────┤
│                              │
│  What are you posting?       │
│  (○) Offer — I have this     │
│  (○) Request — I need this   │
│                              │
│  Category *                  │
│  [Staff ▼]                   │
│                              │
│  Title *                     │
│  [________________________]  │
│                              │
│  Description *               │
│  [________________________]  │
│  [________________________]  │
│                              │
│  Quantity / Duration         │
│  [______] [unit ▼]          │
│                              │
│  Urgency *                   │
│  [Normal] [Urgent] [Critical]│
│                              │
│  Pricing                     │
│  [🔘 Free] [○ Set Price]    │
│  Price: [________]           │
│                              │
│  Expiry Date (optional)      │
│  [📅 Pick date]              │
│                              │
│  Photos (optional)           │
│  [📷 Add photos]             │
│                              │
│  [ Post Listing ]            │
│                              │
└──────────────────────────────┘
```

#### shadcn Components

| Component | Usage |
|---|---|
| `sheet` (mobile) / `dialog` (desktop) | Container for form overlay, or full-page route |
| `radio-group` | Offer vs Request toggle |
| `select` | Category picker, Unit picker |
| `input` | Title, Price, Quantity |
| `textarea` | Description |
| `toggle-group` | Urgency selector (Normal / Urgent / Critical) |
| `switch` | Free/Paid toggle |
| `calendar` + `popover` | Expiry date picker |
| `button` | Submit, Add photos, Close |
| `form` + `label` | Form structure with React Hook Form |
| `sonner` (toast) | Success/error feedback after submission |

#### Validation (Zod Schema)
- `type`: required (offer | request)
- `category`: required (staff | materials | equipment)
- `title`: required, 5–100 characters
- `description`: required, 10–500 characters
- `urgency`: required (normal | urgent | critical)
- `isFree`: boolean
- `price`: required if `isFree` is false, number > 0
- `quantity`: optional, string
- `expiryDate`: optional, must be in the future
- `photos`: optional, max 5, max 5MB each

#### Behavior
- On mobile: opens as `Sheet` sliding up from bottom (full height)
- On desktop: full page at `/create`
- Successful submission: toast "Listing posted!", redirect to listing detail
- Draft auto-save to localStorage every 30 seconds
- Category selection changes the form slightly (Staff shows "Skills" field, Materials shows "Expiry Date" prominently, Equipment shows "Available Until" date range)

---

### Screen 4: Registration

**Route:** `/register`
**Access:** Anonymous users only

#### Layout

```
┌──────────────────────────────┐
│        [The Bend Logo]       │
│    Join The Bend Community   │
├──────────────────────────────┤
│                              │
│  Shop Name *                 │
│  [________________________]  │
│                              │
│  Business Type *             │
│  [Restaurant ▼]              │
│                              │
│  Owner Name *                │
│  [________________________]  │
│                              │
│  Email *                     │
│  [________________________]  │
│                              │
│  Phone *                     │
│  [________________________]  │
│                              │
│  WhatsApp (optional)         │
│  [________________________]  │
│                              │
│  Password *                  │
│  [________________________]  │
│                              │
│  Confirm Password *          │
│  [________________________]  │
│                              │
│  Location / Address          │
│  [________________________]  │
│                              │
│  ┌──────────────────────┐   │
│  │ 📄 Community          │   │
│  │    Guidelines          │   │
│  │  [View/Download]       │   │
│  └──────────────────────┘   │
│  [☑] I agree to the         │
│      community guidelines *  │
│                              │
│  [ Submit Registration ]     │
│                              │
│  Already have an account?    │
│  [Log in →]                  │
└──────────────────────────────┘
```

#### shadcn Components

| Component | Usage |
|---|---|
| `card` | Form container |
| `input` | All text fields |
| `select` | Business type dropdown |
| `checkbox` | Guidelines acceptance |
| `button` | Submit, View Guidelines, Login link |
| `form` + `label` | Form structure |
| `alert` | Inline validation errors |
| `sonner` | Success toast |
| `dialog` | Guidelines viewer (opens PDF/doc in iframe or downloads) |

#### Post-Submission Flow

```
Registration Submitted
        ↓
┌──────────────────────────────┐
│        ✅ Thank You!         │
│                              │
│  Your registration has been  │
│  submitted for review.       │
│                              │
│  The community admin will    │
│  review your application     │
│  and you'll receive an       │
│  email once approved.        │
│                              │
│  [ Back to Home ]            │
└──────────────────────────────┘
```

---

### Screen 5: Login

**Route:** `/login`
**Access:** Anonymous users

#### Layout

```
┌──────────────────────────────┐
│        [The Bend Logo]       │
│      Welcome Back            │
├──────────────────────────────┤
│                              │
│  Email *                     │
│  [________________________]  │
│                              │
│  Password *                  │
│  [________________________]  │
│                              │
│  [Forgot Password?]          │
│                              │
│  [ Log In ]                  │
│                              │
│  Don't have an account?      │
│  [Register your shop →]      │
└──────────────────────────────┘
```

#### shadcn Components
`card`, `input`, `button`, `form`, `label`, `sonner`

#### Behavior
- JWT stored in httpOnly cookie (preferred) or memory
- On success: redirect to previous page or `/`
- "Pending approval" accounts see a message explaining their status
- Failed login: inline error "Invalid email or password" via `Alert`

---

### Screen 6: My Shop

**Route:** `/my-shop`
**Access:** Shop Admin, Shop Employee (read-only)

#### Layout

```
┌──────────────────────────────┐
│  ← Back      [ ✏️ Edit ]    │
├──────────────────────────────┤
│  [🏪 Shop Avatar]            │
│  Fresh Bites Café            │
│  🏷️ Restaurant               │
│  📍 12 Bend Road             │
│  📞 +1234567890              │
│  💬 wa.me/1234567890         │
├──────────────────────────────┤
│  [Active Listings] [History] [Employees] │
├──────────────────────────────┤
│                              │
│  Active Listings (4)         │
│  ┌────────────────────────┐  │
│  │ 🔴 Tomatoes 5kg · FREE │  │
│  │ [Edit] [Fulfill] [Del] │  │
│  └────────────────────────┘  │
│  ┌────────────────────────┐  │
│  │ ⚪ Blender · FREE      │  │
│  │ [Edit] [Fulfill] [Del] │  │
│  └────────────────────────┘  │
│                              │
│  [ + New Listing ]           │
└──────────────────────────────┘
```

#### shadcn Components

| Component | Usage |
|---|---|
| `card` | Shop profile card, listing cards |
| `avatar` | Shop image |
| `tabs` | Active Listings / History / Employees |
| `badge` | Urgency, status tags |
| `button` | Edit, Fulfill, Delete, New Listing, Edit Profile |
| `table` | Employee list (Employees tab) |
| `alert-dialog` | Confirm fulfill/delete |
| `separator` | Between sections |

#### Tabs

**Active Listings Tab:**
- Shows all active offers and requests from this shop
- Each card has inline Edit / Mark Fulfilled / Delete actions
- Empty state: "No active listings. Post something to share!"

**History Tab:**
- Fulfilled and expired listings
- Each shows status badge (Fulfilled / Expired / Deleted)
- Read-only

**Employees Tab:**
- `Table` with columns: Name, Role/Skills, Availability Status, Actions
- "Add Employee" button opens a `Sheet` with name, role, skills, phone fields
- Toggle availability per employee (Available / Unavailable) via `Switch`

---

### Screen 7: Messages

**Route:** `/messages`
**Access:** Registered users (Shop Admin, Community Admin)

#### Layout — Thread List

```
┌──────────────────────────────┐
│  Messages                    │
├──────────────────────────────┤
│  ┌────────────────────────┐  │
│  │ [🏪] Fresh Bites Café  │  │
│  │ Re: Tomatoes 5kg       │  │
│  │ "Yes, you can pick..." │  │
│  │ 2m ago · 🔵            │  │
│  └────────────────────────┘  │
│  ┌────────────────────────┐  │
│  │ [🏪] The Corner Grill  │  │
│  │ Re: Need 2 waitstaff   │  │
│  │ "What time on Sat?"    │  │
│  │ 1h ago                 │  │
│  └────────────────────────┘  │
└──────────────────────────────┘
```

#### Layout — Chat Thread

```
┌──────────────────────────────┐
│ ← Back  Fresh Bites [📞][ℹ] │
├──────────────────────────────┤
│  Re: Tomatoes 5kg 🔴 Urgent  │
├──────────────────────────────┤
│        Hi! I'm interested    │
│        in the tomatoes.      │
│                    10:30 AM  │
│                              │
│  Yes, you can pick them      │
│  up anytime today.           │
│  10:32 AM                    │
│                              │
│        Great, I'll come      │
│        by at 2 PM!           │
│                    10:33 AM  │
├──────────────────────────────┤
│  [Type a message...] [Send]  │
└──────────────────────────────┘
```

#### shadcn Components

| Component | Usage |
|---|---|
| `card` | Thread list items |
| `avatar` | Shop avatars |
| `badge` | Unread indicator (blue dot), listing urgency tag |
| `input` | Message composer |
| `button` | Send, Back, Call, Info |
| `scroll-area` | Chat message area (scrollable, anchored to bottom) |
| `separator` | Date separators between message groups |
| `skeleton` | Loading state |
| `popover` | Contact info quick view |

#### Behavior
- Real-time via WebSocket connection
- Threads sorted by most recent message
- Unread badge (blue dot) on threads with new messages
- Chat auto-scrolls to latest message
- Listing reference card pinned at top of chat thread
- Phone/info button shows `Popover` with shop contact details
- Typing indicator ("Shop is typing...")

---

### Screen 8: Notifications

**Route:** `/notifications`
**Access:** Registered users

#### Layout

```
┌──────────────────────────────┐
│  Notifications    [Mark all read] │
├──────────────────────────────┤
│  Today                       │
│  ┌────────────────────────┐  │
│  │ 🔵 New interest in     │  │
│  │ "Tomatoes 5kg"         │  │
│  │ The Corner Grill is    │  │
│  │ interested · 2m ago    │  │
│  └────────────────────────┘  │
│  ┌────────────────────────┐  │
│  │ 🔴 CRITICAL listing    │  │
│  │ "Bread flour 10kg"     │  │
│  │ expiring today at      │  │
│  │ Mama's Kitchen · 1h ago│  │
│  └────────────────────────┘  │
│  Yesterday                   │
│  ┌────────────────────────┐  │
│  │ ✅ Registration approved│  │
│  │ Welcome to The Bend!   │  │
│  │ · 1d ago               │  │
│  └────────────────────────┘  │
└──────────────────────────────┘
```

#### shadcn Components
`card`, `badge`, `button`, `separator`, `scroll-area`

#### Behavior
- Grouped by date (Today, Yesterday, This Week, Older)
- Unread notifications have blue dot + slightly highlighted background
- Tapping a notification navigates to the relevant listing, message, or screen
- "Mark all as read" button in header
- Pull-to-refresh on mobile

---

### Screen 9: Settings

**Route:** `/settings`
**Access:** Registered users

#### Layout

```
┌──────────────────────────────┐
│  Settings                    │
├──────────────────────────────┤
│  Profile                     │
│  Name: [___________]  [Save] │
│  Email: dev@alfredx.com      │
│  Phone: [___________] [Save] │
├──────────────────────────────┤
│  Notifications               │
│  Push Notifications    [🔘]  │
│  Email Digests         [🔘]  │
│  ─────────────────────       │
│  Notify me about:            │
│  Staff listings        [🔘]  │
│  Material listings     [🔘]  │
│  Equipment listings    [🔘]  │
│  ─────────────────────       │
│  Urgency threshold:          │
│  [All ▼]                     │
├──────────────────────────────┤
│  App                         │
│  Install App           [→]   │
│  About The Bend        [→]   │
├──────────────────────────────┤
│  [ Log Out ]                 │
└──────────────────────────────┘
```

#### shadcn Components

| Component | Usage |
|---|---|
| `input` | Editable profile fields |
| `switch` | All toggles (push, email, category preferences) |
| `select` | Urgency threshold selector |
| `separator` | Between sections |
| `button` | Save, Log Out, Install App |
| `card` | Section containers |
| `alert-dialog` | Logout confirmation |

---

### Screen 10: Admin Dashboard

**Route:** `/admin`
**Access:** Community Admin only

#### Layout

```
┌────────┬─────────────────────────────────┐
│Sidebar │  Dashboard                       │
│        ├─────────────────────────────────┤
│ 📊 Dash│  ┌──────┐ ┌──────┐ ┌──────┐   │
│ 📝 Regs│  │  3   │ │  28  │ │ 142  │   │
│ 🏪 Shops│ │Pending│ │Active│ │Active│   │
│ 📋 List│  │ Regs  │ │Shops │ │List. │   │
│ 📄 Guide│ └──────┘ └──────┘ └──────┘   │
│ 📈 Stats│                                │
│        │  Recent Registrations           │
│        │  ┌───────────────────────────┐  │
│        │  │ Shop Name │ Type │ Status │  │
│        │  │ Café Lux  │ Café │[Approve]│ │
│        │  │ Tool Hub  │Retail│[Approve]│ │
│        │  └───────────────────────────┘  │
│        │                                 │
│        │  Recent Listings                │
│        │  ┌───────────────────────────┐  │
│        │  │ Title     │ Shop │Urgency │  │
│        │  │ Tomatoes  │Fresh │ 🔴 Crit│  │
│        │  │ Blender   │Mama's│ ⚪ Norm│  │
│        │  └───────────────────────────┘  │
└────────┴─────────────────────────────────┘
```

#### shadcn Components

| Component | Usage |
|---|---|
| `sidebar` | Admin navigation |
| `card` | Stat cards (Pending Regs, Active Shops, Active Listings) |
| `table` | Recent registrations, recent listings |
| `badge` | Status badges, urgency tags |
| `button` | Quick approve/reject actions |

---

### Screen 11: Registration Queue (Admin)

**Route:** `/admin/registrations`
**Access:** Community Admin

#### Layout

```
┌────────────────────────────────────────┐
│  Registration Requests (3 pending)     │
│  [Pending] [Approved] [Rejected]       │
├────────────────────────────────────────┤
│  ┌──────────────────────────────────┐  │
│  │ Shop     │ Type   │ Date   │Act │  │
│  │ Café Lux │ Café   │ Apr 2  │[👁][✅][❌]│
│  │ Tool Hub │ Retail │ Apr 1  │[👁][✅][❌]│
│  │ Deli+    │ Deli   │ Mar 31 │[👁][✅][❌]│
│  └──────────────────────────────────┘  │
└────────────────────────────────────────┘
```

#### Detail View (clicking 👁)

```
┌──────────────────────────────┐
│  Registration Details    [✕] │
├──────────────────────────────┤
│  Shop Name: Café Lux         │
│  Type: Café / Restaurant     │
│  Owner: Maria Lopez          │
│  Email: maria@cafelux.com    │
│  Phone: +1234567890          │
│  WhatsApp: +1234567890       │
│  Address: 15 Bend Road       │
│  Applied: April 2, 2026      │
│  Guidelines accepted: ✅     │
├──────────────────────────────┤
│  Reject Reason (if rejecting)│
│  [________________________]  │
├──────────────────────────────┤
│  [ ✅ Approve ] [ ❌ Reject ]│
└──────────────────────────────┘
```

#### shadcn Components

| Component | Usage |
|---|---|
| `tabs` | Pending / Approved / Rejected filter |
| `table` | Registration list |
| `dialog` or `sheet` | Detail view overlay |
| `button` | Approve, Reject, View |
| `input` / `textarea` | Rejection reason |
| `badge` | Status (Pending/Approved/Rejected) |
| `alert-dialog` | Confirm approve/reject action |

---

### Screen 12: Shops Directory (Admin)

**Route:** `/admin/shops`
**Access:** Community Admin

#### shadcn Components
`table`, `badge`, `button`, `input` (search), `dropdown-menu` (actions), `alert-dialog` (suspend confirmation)

#### Table Columns
| Shop Name | Type | Admin | Status | Listings | Joined | Actions |
|---|---|---|---|---|---|---|
| Fresh Bites | Restaurant | John | 🟢 Active | 12 | Mar 1 | [View] [Suspend] |
| Tool Hub | Hardware | Sam | 🟡 Pending | 0 | Apr 1 | [View] [Approve] |
| Bad Shop | Retail | X | 🔴 Suspended | 0 | Feb 15 | [View] [Reactivate] |

Actions via `DropdownMenu`: View Profile, Suspend Shop, Reactivate Shop (if suspended)

---

### Screen 13: Listings Management (Admin)

**Route:** `/admin/listings`
**Access:** Community Admin

Similar to Shops Directory but for all listings across all shops.

#### Table Columns
| Title | Shop | Category | Urgency | Status | Posted | Actions |
|---|---|---|---|---|---|---|
| Tomatoes 5kg | Fresh Bites | Materials | 🔴 Critical | Active | 2h ago | [View] [Remove] |

Actions: View Listing, Remove Listing (with reason), Flag for Review

#### shadcn Components
`table`, `badge`, `select` (filters), `button`, `alert-dialog`, `dropdown-menu`

---

### Screen 14: Community Guidelines (Admin)

**Route:** `/admin/guidelines`
**Access:** Community Admin

#### Layout

```
┌──────────────────────────────┐
│  Community Guidelines        │
├──────────────────────────────┤
│                              │
│  Current Guidelines          │
│  ┌────────────────────────┐  │
│  │ 📄 community_rules.pdf │  │
│  │ Uploaded: Mar 15, 2026 │  │
│  │ [Download] [Preview]   │  │
│  └────────────────────────┘  │
│                              │
│  Upload New Guidelines       │
│  ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐  │
│  │  Drag & drop file here │  │
│  │  or [Browse Files]     │  │
│  │  .pdf, .docx, .txt     │  │
│  │  Max 10MB              │  │
│  └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘  │
│                              │
│  ⚠️ Uploading a new file will│
│  replace the current one.    │
│  Existing members won't be   │
│  required to re-accept.      │
│                              │
│  [ Upload & Replace ]        │
└──────────────────────────────┘
```

#### shadcn Components
`card`, `button`, `alert`, `dialog` (preview), `sonner` (upload success)

---

### Screen 15: Reports (Admin)

**Route:** `/admin/reports`
**Access:** Community Admin

#### Layout

```
┌──────────────────────────────┐
│  Community Reports           │
│  [This Week ▼]               │
├──────────────────────────────┤
│  ┌──────┐ ┌──────┐ ┌──────┐│
│  │  8   │ │  47  │ │  32  ││
│  │ New  │ │Active│ │Fulfi-││
│  │Shops │ │List. │ │lled  ││
│  └──────┘ └──────┘ └──────┘│
├──────────────────────────────┤
│  Listings by Category (bar)  │
│  ████████ Staff: 18          │
│  ████████████ Materials: 24  │
│  ████ Equipment: 5           │
├──────────────────────────────┤
│  Listings Over Time (line)   │
│  [chart showing weekly trend]│
├──────────────────────────────┤
│  Most Active Shops           │
│  1. Fresh Bites — 12 listings│
│  2. Corner Grill — 8 listings│
│  3. Mama's Kitchen — 6       │
└──────────────────────────────┘
```

#### shadcn Components
`card`, `select` (date range), `chart` (bar + line charts using Recharts), `table`, `badge`

---

### Screen 16: Install Prompt (PWA)

Not a route — a conditional banner/dialog shown to mobile users who haven't installed the app.

```
┌──────────────────────────────┐
│  [The Bend icon]             │
│  Install The Bend            │
│  Get quick access from your  │
│  home screen                 │
│  [Install] [Maybe Later]     │
└──────────────────────────────┘
```

#### shadcn Components
`card`, `button`

Shows after 2nd visit or when user performs a key action. Uses the `beforeinstallprompt` browser event.

---

## 4. Shared Component Library

These are custom reusable components built from shadcn primitives:

| Component | Built From | Description |
|---|---|---|
| `ListingCard` | `card`, `badge`, `avatar` | Reusable feed card for listings/requests |
| `UrgencyBadge` | `badge` | Color-coded urgency indicator (Normal/Urgent/Critical) |
| `CategoryIcon` | Lucide icons | Staff=Users, Materials=Package, Equipment=Wrench |
| `PriceBadge` | `badge` | Shows "FREE" (green) or formatted price |
| `ShopAvatar` | `avatar` | Shop image with fallback to initials |
| `EmptyState` | `card`, `button` | Illustration + message + CTA for empty lists |
| `LoginPrompt` | `dialog`, `button` | Modal prompting anonymous users to register/login |
| `ConfirmAction` | `alert-dialog` | Reusable confirm dialog for destructive actions |
| `FileUploader` | `button`, `input` | Drag-and-drop file upload with preview |
| `ChatBubble` | div + Tailwind | Message bubble (sent=right/green, received=left/gray) |
| `StatCard` | `card` | Number + label stat card for admin dashboard |

---

## 5. PWA Configuration

### manifest.json
```json
{
  "name": "The Bend Community",
  "short_name": "The Bend",
  "description": "Share staff, materials & equipment with your neighbors",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#16a34a",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

### Service Worker Strategy
- **App shell:** Cache-first (HTML, CSS, JS, fonts)
- **API responses:** Network-first with stale-while-revalidate fallback
- **Images:** Cache-first with 7-day expiry
- **Offline page:** Custom "You're offline" screen with cached feed data

---

*This specification should be read alongside The_Bend_PRD.md for full product context.*
