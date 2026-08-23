## Stable category IDs and marketplace wording

Approved stable meanings and contracts:

- `staff` → `Gigs` (public marketplace label)
- `materials` → `Buy, Sell, and Rent`
  - Internal meaning: commerce category for retail products and surplus goods that can be bought, sold, or rented.
- `equipment` → `Free, Trade, and Borrow`
  - Internal meaning: neighbor-sharing category for tools/equipment that can be offered free, traded, or borrowed.
- `volunteer` → `Volunteer` (public label)

Public routes that use these IDs (contract values):

- `/browse?category=materials`
- `/browse?category=equipment`

These ID strings and route values are compatibility contracts and must not be renamed, even if public wording changes.

Shared constants used by core marketplace UI code:

- `CATEGORY_LABELS` in `the-bend-frontend/src/lib/constants.ts` for stable ID-to-wording lookup.
- `BROWSE_CATEGORY_TABS` in `the-bend-frontend/src/lib/constants.ts` for marketplace browse tabs.
- `CREATE_LISTING_CATEGORY_OPTIONS` in `the-bend-frontend/src/lib/constants.ts` for Create Listing category options.
- `CATEGORY_GUIDANCE` in `the-bend-frontend/src/lib/constants.ts` for Create Listing contextual guidance strings.
