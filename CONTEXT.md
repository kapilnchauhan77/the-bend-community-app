## Stable category IDs and marketplace wording

Stable backend IDs:

- `staff` → `Gigs`
- `materials` → `Buy, Sell, and Rent`
- `equipment` → `Free, Trade, and Borrow`
- `volunteer` → `Volunteer`

Public routes that use these IDs:

- `/browse?category=materials`
- `/browse?category=equipment`

Shared constants used by core marketplace UI code:

- `CATEGORY_LABELS` in `src/lib/constants.ts` for stable ID-to-wording lookup.
- `BROWSE_CATEGORY_TABS` in `src/lib/constants.ts` for marketplace browse tabs.
- `CREATE_LISTING_CATEGORY_OPTIONS` in `src/lib/constants.ts` for Create Listing category options.
- `CATEGORY_GUIDANCE` in `src/lib/constants.ts` for Create Listing contextual guidance strings.
