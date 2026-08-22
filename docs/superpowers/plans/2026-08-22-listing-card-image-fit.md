# Listing Card Image Fit Implementation Plan

**Goal:** Show complete business listing photos in Browse cards without changing the card grid footprint or stretching uploads.

**Approved design:** Preserve the existing 16:9 media frame. Render non-video listing photos with `object-contain` on a restrained neutral background, and remove the image zoom. Keep video poster behavior and overlays functional. Limit the production change to Browse listing cards.

## Global Constraints

- Work only in the isolated `codex/listing-card-image-fit` worktree.
- Follow test-driven development: add the browser regression first, run it RED for the cropping behavior, then implement the smallest production change and run it GREEN.
- The media wrapper remains `aspect-[16/9]`; the Browse grid and text layout must not change.
- A portrait or square non-video photo must render with computed `object-fit: contain` on both desktop and a 390px mobile viewport.
- Non-video listing photos must not scale on hover.
- Video posters retain their existing cover-style presentation, play overlay, and image-count overlay.
- Use the existing design tokens. Do not add a new dependency.
- Do not change `ListingDetailPage`; this fix is scoped to Browse listing cards.
- Run the focused Playwright regression, the full frontend build, targeted lint for touched files, and `git diff --check`.
- Commit the implementation on `codex/listing-card-image-fit`. Do not push, merge, or deploy.

## Task 1: Add the Browse listing image-fit regression and implement the card fix

**Files:**

- Create: `the-bend-frontend/e2e/listing-card-image-fit.spec.ts`
- Modify: `the-bend-frontend/src/components/shared/ListingCard.tsx`

**Test requirements:**

1. Build a deterministic Browse-page fixture by intercepting the tenant and listings API requests already used by the app. Include a portrait non-video listing image and, if practical without broad fixture work, a video-poster listing.
2. On a desktop viewport, locate the portrait listing by its title and assert:
   - its media wrapper remains 16:9 within a small rounding tolerance;
   - the listing photo has computed `object-fit: contain`;
   - the photo has no hover scale after hovering the card;
   - the image-count overlay remains visible when the listing has multiple images.
3. Repeat the frame and `object-fit: contain` assertions at a 390px mobile viewport.
4. If a video fixture is included, assert its poster keeps computed `object-fit: cover` and its play overlay remains visible.
5. Capture the expected RED result before changing production code and record that evidence in the task report.

**Implementation requirements:**

1. Keep the existing `aspect-[16/9]` wrapper.
2. Use a restrained existing neutral background token on that wrapper.
3. Apply `object-contain` to non-video listing photos.
4. Keep `object-cover` for video posters.
5. Remove the group-hover scale transform from the cover image while preserving appropriate non-transform styling.
6. Do not alter navigation, overlays, lazy loading, title, description, price, shop, or expiry behavior.

**Verification:**

- `npx playwright test e2e/listing-card-image-fit.spec.ts`
- `npm run build`
- `npx eslint src/components/shared/ListingCard.tsx e2e/listing-card-image-fit.spec.ts`
- `git diff --check`

**Report:** Record changed files, the RED and GREEN commands/results, build/lint/diff-check results, commit hash, and any concerns.
