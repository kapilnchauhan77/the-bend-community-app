# Batch 1: Business Profiles + Directory + Activity Feed

## Context
The Bend Community App needs business discoverability beyond just listings. Currently businesses only appear when they have active listings. A directory and profile page give every business a permanent presence, and a real activity feed replaces placeholder data on the homepage.

## Feature 1: Public Business Profile

### Route
`/business/:shopId` — public, no auth required

### Page Structure
- Museum-themed header with business name
- Business info card: avatar (or initial), name, type badge, address, phone (tel: link), WhatsApp (wa.me link)
- "Message Business" button (visible only to logged-in non-owner users, starts message thread via existing `messageApi.startThread`)
- Share button (reuse existing ShareButton component)
- Active listings grid (reuse ListingCard component)
- Stats: member since, active listings count, fulfilled count

### Backend
- Existing `GET /api/v1/shops/{id}` returns shop data — add `avatar_url` if not already present (it is)
- Existing `GET /api/v1/shops/{id}/listings` returns shop listings — currently requires auth. **Change to public** for active listings only (filter `status=active` server-side)
- No new models or migrations needed

### Frontend
- New file: `src/pages/BusinessProfilePage.tsx`
- Uses `PageLayout`
- Calls `shopApi.getShop(id)` and `shopApi.getShopListings(id)` (need to make these public or add a public variant)
- Add route to `App.tsx`: `<Route path="/business/:shopId" element={<BusinessProfilePage />} />`

### Linking
- ListingCard shop name/avatar → links to `/business/:shopId`
- ListingDetailPage "Posted by" section → links to `/business/:shopId`
- Directory cards → link to `/business/:shopId`

## Feature 2: Business Directory

### Route
`/directory` — public, no auth required

### Page Structure
- Museum-themed header: "Business Directory" with subtitle
- Search bar (filters by business name, client-side or server-side)
- Category filter pills: All + each business type (restaurant, cafe, retail, service, hardware, deli, bakery, other)
- Responsive card grid (1/2/3 cols)
- Each card: avatar/initial, name, type badge, address (if set), active listing count, "View Profile" link

### Backend
- **New public endpoint**: `GET /api/v1/shops` (or `/api/v1/directory`)
  - Returns only `status=active` shops
  - Query params: `search` (name filter), `business_type` (category filter), `cursor`, `limit`
  - Response: `{ items: ShopSummary[], next_cursor, has_more }`
  - ShopSummary: id, name, business_type, address, avatar_url, active_listings_count
- This is separate from the admin `GET /admin/shops` which returns all shops with admin data

### Frontend
- New file: `src/pages/DirectoryPage.tsx`
- Uses `PageLayout`
- New API method in `shopApi.ts`: `directory(params?)` → `GET /shops`
- Add route to `App.tsx`
- Add "Directory" to Navbar (under Community dropdown)

## Feature 3: Activity Feed (Real Fulfilled Data)

### What Changes
Replace the static `fulfilledPlaceholder` array in `HomePage.tsx` with real data fetched from the API.

### Backend
- Add `status` query parameter to `GET /api/v1/listings` browse endpoint
- When `status=fulfilled`, sort by `fulfilled_at DESC` instead of default sort
- Response shape stays the same — just filtered listings

### Frontend
- In `HomePage.tsx`: remove `fulfilledPlaceholder` array
- Add state: `fulfilledListings` + `loadingFulfilled`
- Fetch: `listingApi.browse({ status: 'fulfilled', limit: 5 })`
- Render using real listing data: title, shop name, category, time since fulfilled
- Show "No fulfilled items yet" empty state if none
- Link each item to `/listing/:id`

### Backend Changes Required
- `app/repositories/listing_repo.py` → `browse()` method: accept `status` param, filter by `Listing.status`, sort by `fulfilled_at` when status is fulfilled
- `app/api/v1/listings.py` → add `status` Query parameter to `browse_listings` endpoint

## Files to Create
- `src/pages/BusinessProfilePage.tsx`
- `src/pages/DirectoryPage.tsx`

## Files to Modify
- **Backend:**
  - `app/api/v1/listings.py` — add `status` query param
  - `app/api/v1/shops.py` — add public `GET /shops` directory endpoint (or new file `app/api/v1/directory.py`)
  - `app/repositories/listing_repo.py` — handle status filter + fulfilled sort
  - `app/api/v1/router.py` — register directory router if new file
- **Frontend:**
  - `src/App.tsx` — add routes
  - `src/services/shopApi.ts` — add directory method
  - `src/pages/HomePage.tsx` — replace placeholder with real data
  - `src/components/shared/ListingCard.tsx` — make shop name/avatar clickable → `/business/:id`
  - `src/pages/ListingDetailPage.tsx` — make "Posted by" section link to `/business/:id`
  - `src/components/layout/Navbar.tsx` — add "Directory" to Community dropdown

## Verification
1. Visit `/directory` — see grid of active businesses, search works, filter by type works
2. Click a business → `/business/:shopId` shows profile with listings
3. Homepage "Recently Fulfilled" shows real data from DB (or empty state if none)
4. ListingCard shop name clicks → business profile
5. `npx tsc --noEmit` passes
6. `npm run build` succeeds
