# Westmoreland native Bender implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Bender a dependable native feed with exact post deep links, compact cards, safe caption links, usable actions, and recoverable first-load errors.

**Architecture:** Keep `BenderPage` and its existing mutation handlers as the single feed implementation. Add one tenant-safe post-detail endpoint, a focused-post hook, canonical route helpers, and a native compact card mode. Shared URL helpers validate external links and build public Westmoreland share URLs without trusting the Capacitor WebView origin.

**Tech stack:** FastAPI, SQLAlchemy async, PostgreSQL, Pydantic, React 19, TypeScript 5.9, React Router 7, Vitest, React Testing Library, Capacitor Browser 8, scoped native CSS.

**Spec:** `docs/superpowers/specs/2026-08-20-westmoreland-native-phase-2-ux-design.md`

## Global constraints

- `/bender/:postId` is the canonical new route. `/bender?post=:postId` and `/bender#post-:postId` remain compatible and replace themselves with the canonical path.
- Canonical post identifiers are UUIDs accepted by the existing `parseCanonicalUuid` helper.
- The single-post endpoint must enforce the same tenant, deletion, visibility, author relationship, block, and viewer-projection rules as the feed.
- Hidden, deleted, missing, unauthorized, malformed-relationship, and cross-tenant posts share one not-found response.
- Preserve the current directional block rule. Do not broaden it to mutual blocking.
- Keep `useBenderFeed` network-only with `cachePolicy: 'none'`.
- Do not duplicate like, comment, delete, share, message, or optimistic-update handlers.
- Do not fetch link metadata or arbitrary remote pages.
- Native text-only cards have no media gap. Native captions remain complete and unclamped.
- Native icon actions use post-specific labels and 44 by 44 point targets.
- Web Bender keeps its existing layout apart from canonical route correctness.
- Every newly emitted share URL uses `https://westmoreland.bend.community`, never `window.location.origin` inside Capacitor.
- Run backend commands with `uv run --frozen` so `uv.lock` cannot change.
- Complete the Phase 2 index baseline task first. Every commit below starts from a clean tracked tree and stages only its exact Files list.
- No production deployment or store submission is authorized by this plan.

---

## File responsibility map

### Create

- `the-bend-frontend/src/lib/safeExternalUrl.ts` parses explicit safe web URLs.
- `the-bend-frontend/src/lib/safeExternalUrl.test.ts` protects URL security rules.
- `the-bend-frontend/src/lib/publicUrl.ts` builds canonical Westmoreland public URLs.
- `the-bend-frontend/src/lib/publicUrl.test.ts` rejects noncanonical internal paths and local origins.
- `the-bend-frontend/src/components/shared/ShareButton.test.tsx` protects native and web URL resolution.
- `the-bend-frontend/src/routes/benderRoutes.ts` builds canonical paths and reads legacy links.
- `the-bend-frontend/src/routes/benderRoutes.test.ts` covers canonical and compatibility paths.
- `the-bend-frontend/src/services/benderApi.test.ts` covers exact post requests.
- `the-bend-frontend/src/hooks/useBenderPost.ts` owns exact focused-post loading and retry.
- `the-bend-frontend/src/hooks/useBenderPost.test.tsx` covers cancellation and state mapping.
- `the-bend-frontend/src/hooks/useBenderFeed.phase2.test.tsx` isolates first-page failure rules.
- `the-bend-frontend/src/components/features/bender/BenderCaptionLinkCard.tsx` renders one safe caption link.
- `the-bend-frontend/src/components/features/bender/BenderCaptionLinkCard.test.tsx` covers link rendering and browser calls.
- `the-bend-frontend/src/pages/BenderPage.phase2.test.tsx` covers route, focused-post, error, card, and action integration.

### Modify

- `the-bend-backend/app/services/bender_service.py` adds exact post projection.
- `the-bend-backend/app/api/v1/bender.py` exposes the public tenant-safe GET route.
- `the-bend-backend/tests/test_user_block_discovery.py` extends the real-database Bender privacy matrix.
- `the-bend-backend/app/services/reference_service.py` emits canonical Bender references.
- `the-bend-backend/tests/test_reference_service.py` protects reference URLs.
- `the-bend-frontend/src/routes/PublicMemberRoutes.tsx` adds the canonical web route.
- `the-bend-frontend/src/routes/WebRoutes.test.tsx` protects web route behavior.
- `the-bend-frontend/src/services/benderApi.ts` adds `getPost` and request options.
- `the-bend-frontend/src/hooks/useBenderFeed.ts` supports focused-mode disablement and first-page errors.
- `the-bend-frontend/src/hooks/useBenderFeed.test.tsx` protects current pagination behavior.
- `the-bend-frontend/src/pages/BenderPage.tsx` composes focused and feed states plus compact native cards.
- `the-bend-frontend/src/pages/BenderPage.native.test.tsx` protects native chrome.
- `the-bend-frontend/src/native/discovery/adapters.ts` emits canonical Bender targets.
- `the-bend-frontend/src/native/discovery/adapters.test.ts` protects the target path.
- `the-bend-frontend/src/components/native/ui/NativeBenderCard.tsx` emits canonical targets.
- `the-bend-frontend/src/components/native/ui/NativeBenderCard.test.tsx` protects preview navigation.
- `the-bend-frontend/src/pages/native/NativeHomePage.test.tsx` updates focused-post expectations.
- `the-bend-frontend/src/pages/native/NativeExplorePage.test.tsx` updates focused-post expectations.
- `the-bend-frontend/src/styles/native.css` owns compact card and action geometry.
- `the-bend-frontend/src/components/native/ui/NativeComponents.test.tsx` protects scoped CSS.
- `the-bend-frontend/src/components/shared/ShareButton.tsx` uses the canonical public origin for relative URLs only on native platforms.

---

### Task 1: Add shared external and public URL helpers

**Files:**

- Create: `the-bend-frontend/src/lib/safeExternalUrl.ts`
- Create: `the-bend-frontend/src/lib/safeExternalUrl.test.ts`
- Create: `the-bend-frontend/src/lib/publicUrl.ts`
- Create: `the-bend-frontend/src/lib/publicUrl.test.ts`
- Create: `the-bend-frontend/src/components/shared/ShareButton.test.tsx`
- Modify: `the-bend-frontend/src/components/shared/ShareButton.tsx`

**Interfaces:**

```ts
export interface SafeExternalUrl {
  href: string
  hostname: string
  original: string
}

export function parseSafeExternalUrl(
  raw: string | null | undefined,
): SafeExternalUrl | null

export function findFirstSafeExternalUrl(
  text: string | null | undefined,
): SafeExternalUrl | null

export const WESTMORELAND_PUBLIC_ORIGIN =
  'https://westmoreland.bend.community'

export function publicWestmorelandUrl(path: string): string
```

- [ ] **Step 1: Write failing URL tests**

Cover HTTP and HTTPS normalization, hostname and original text, empty input, embedded whitespace, malformed URLs, credentials, and rejected `javascript:`, `data:`, and `file:` schemes. `findFirstSafeExternalUrl` scans explicit HTTP or HTTPS candidates in caption order, removes terminal sentence punctuation, skips a rejected first candidate, and returns the first valid one.

```ts
expect(parseSafeExternalUrl(' https://Example.com/path ')).toEqual({
  href: 'https://example.com/path',
  hostname: 'example.com',
  original: 'https://Example.com/path',
})
expect(parseSafeExternalUrl('https://user@example.com')).toBeNull()

expect(publicWestmorelandUrl('/bender/00000000-0000-0000-0000-000000000001'))
  .toBe('https://westmoreland.bend.community/bender/00000000-0000-0000-0000-000000000001')
expect(() => publicWestmorelandUrl('//evil.example/post')).toThrow(TypeError)
```

For `publicWestmorelandUrl`, also reject absolute URLs, paths without a leading slash, protocol-relative paths, backslashes, dot-segment traversal, encoded path delimiters, and ASCII control or whitespace characters. Preserve safe queries and hashes because existing Westmoreland share targets use them. The helper must not consult `window.location.origin`, even in a local WebView.

Add ShareButton tests that mock `Capacitor.isNativePlatform()`. With native mode and a simulated `capacitor://localhost` origin, a relative listing, business, event, or hash URL must be shared under the public Westmoreland HTTPS origin. On web, the same relative input continues to use `window.location.origin`. Already absolute HTTP or HTTPS input remains unchanged.

- [ ] **Step 2: Run the test and confirm RED**

```bash
cd the-bend-frontend
npm run test:run -- src/lib/safeExternalUrl.test.ts src/lib/publicUrl.test.ts src/components/shared/ShareButton.test.tsx
```

- [ ] **Step 3: Implement the pure parser**

Use `new URL`, explicit protocol comparison, and `url.username || url.password` rejection for external links. Build public URLs only from the fixed Westmoreland HTTPS origin and a validated root-relative path. In `ShareButton`, use `publicWestmorelandUrl(url)` for a relative URL only when `Capacitor.isNativePlatform()` is true; retain the current web-origin behavior otherwise. Do not call `fetch` or `api`.

- [ ] **Step 4: Run the test and confirm GREEN**

```bash
npm run test:run -- src/lib/safeExternalUrl.test.ts src/lib/publicUrl.test.ts src/components/shared/ShareButton.test.tsx
```

- [ ] **Step 5: Commit the shared helper**

```bash
cd "$(git rev-parse --show-toplevel)"
git add -- \
  the-bend-frontend/src/lib/safeExternalUrl.ts \
  the-bend-frontend/src/lib/safeExternalUrl.test.ts \
  the-bend-frontend/src/lib/publicUrl.ts \
  the-bend-frontend/src/lib/publicUrl.test.ts \
  the-bend-frontend/src/components/shared/ShareButton.tsx \
  the-bend-frontend/src/components/shared/ShareButton.test.tsx
git diff --cached --name-only
git diff --cached --check
git commit -m "feat(native): centralize safe public URLs"
```

---

### Task 2: Add a tenant-safe single-post endpoint

**Files:**

- Modify: `the-bend-backend/app/services/bender_service.py`
- Modify: `the-bend-backend/app/api/v1/bender.py`
- Modify: `the-bend-backend/tests/test_user_block_discovery.py`

**Interfaces:**

```py
async def get_post(
    self,
    *,
    post_id: UUID,
    tenant_id: UUID,
    current_user: User | None,
) -> BenderPostResponse:
    ...
```

```py
@router.get('/posts/{post_id}', response_model=BenderPostResponse)
async def get_post(
    post_id: UUID,
    service: BenderService = Depends(get_service),
    tenant: Tenant | None = Depends(get_current_tenant),
    viewer: User | None = Depends(get_current_user_optional),
) -> BenderPostResponse:
    ...
```

- [ ] **Step 1: Write failing real-database and router tests**

Add:

- `test_bender_single_post_returns_visible_post_with_viewer_projection`
- `test_bender_single_post_treats_cross_tenant_viewer_as_anonymous`
- `test_bender_single_post_hides_blocked_cross_tenant_and_malformed_relationship_posts`
- `test_bender_single_post_uses_one_not_found_contract_for_hidden_deleted_and_missing_posts`

Assert one `BenderLike` projection for an accepted same-tenant viewer and `viewer_has_liked=False` for anonymous or cross-tenant viewers.

- [ ] **Step 2: Run the tests and confirm RED**

```bash
cd the-bend-backend
uv run --frozen pytest tests/test_user_block_discovery.py -k 'bender_single_post' -q
```

Expected: the route and service method do not exist.

- [ ] **Step 3: Implement the endpoint with feed-equivalent privacy**

Reuse the feed's author projection and directional block predicate. Validate tenant ownership of the post, author, and optional shop relationship. Raise the existing `NotFoundError('Post')` for every hidden case. No migration or response-schema change is required.

- [ ] **Step 4: Run the complete Bender backend selection**

```bash
uv run --frozen pytest tests/test_user_block_discovery.py -k 'bender' -q
```

- [ ] **Step 5: Commit the endpoint**

```bash
cd "$(git rev-parse --show-toplevel)"
git add -- \
  the-bend-backend/app/services/bender_service.py \
  the-bend-backend/app/api/v1/bender.py \
  the-bend-backend/tests/test_user_block_discovery.py
git diff --cached --name-only
git diff --cached --check
git commit -m "feat(bender): add tenant-safe post detail"
```

---

### Task 3: Make canonical paths the only newly emitted Bender links

**Files:**

- Create: `the-bend-frontend/src/routes/benderRoutes.ts`
- Create: `the-bend-frontend/src/routes/benderRoutes.test.ts`
- Modify: `the-bend-frontend/src/routes/PublicMemberRoutes.tsx`
- Modify: `the-bend-frontend/src/routes/WebRoutes.test.tsx`
- Modify: `the-bend-frontend/src/native/discovery/adapters.ts`
- Modify: `the-bend-frontend/src/native/discovery/adapters.test.ts`
- Modify: `the-bend-frontend/src/components/native/ui/NativeBenderCard.tsx`
- Modify: `the-bend-frontend/src/components/native/ui/NativeBenderCard.test.tsx`
- Modify: `the-bend-frontend/src/pages/native/NativeHomePage.test.tsx`
- Modify: `the-bend-frontend/src/pages/native/NativeExplorePage.test.tsx`
- Modify: `the-bend-backend/app/services/reference_service.py`
- Modify: `the-bend-backend/tests/test_reference_service.py`
- Modify: `the-bend-frontend/src/pages/BenderPage.tsx`

**Interfaces:**

```ts
export function benderPostPath(postId: string): string

export function getLegacyBenderPostId(
  search: string,
  hash: string,
): string | null

export function getLegacyBenderPostPath(
  search: string,
  hash: string,
): string | null
```

- [ ] **Step 1: Write failing route and producer tests**

Prove:

- `benderPostPath` returns `/bender/{encoded-uuid}`.
- Query form takes precedence over hash form.
- Legacy normalization accepts canonical UUIDs only.
- Invalid input returns `null`.
- The web route renders `BenderPage` at `/bender/:postId`.
- Home, Explore, native preview, message reference, and share producers use the canonical route.
- Shares use the verified public Westmoreland HTTPS origin even when `window.location.origin` is a Capacitor local origin.

- [ ] **Step 2: Run frontend and backend tests and confirm RED**

```bash
cd the-bend-frontend
npm run test:run -- \
  src/routes/benderRoutes.test.ts \
  src/routes/WebRoutes.test.tsx \
  src/native/discovery/adapters.test.ts \
  src/components/native/ui/NativeBenderCard.test.tsx \
  src/pages/native/NativeHomePage.test.tsx \
  src/pages/native/NativeExplorePage.test.tsx
cd ../the-bend-backend
uv run --frozen pytest tests/test_reference_service.py -q
```

Expected: new route helpers are missing and existing producers emit query or hash links.

- [ ] **Step 3: Implement canonical producers and compatibility parsing**

Reuse `parseCanonicalUuid` from `deepLinkRoutes.ts`. The backend reference becomes:

```py
'url': f'/bender/{obj.id}'
```

The share URL becomes:

```ts
const url = publicWestmorelandUrl(benderPostPath(post.id))
```

Add `/bender/:postId` to `PublicMemberRoutes`. Keep `/bender` unchanged.

- [ ] **Step 4: Run the same tests and confirm GREEN**

Run the Step 2 commands again.

- [ ] **Step 5: Commit canonical routing**

```bash
cd "$(git rev-parse --show-toplevel)"
git add -- \
  the-bend-frontend/src/routes/benderRoutes.ts \
  the-bend-frontend/src/routes/benderRoutes.test.ts \
  the-bend-frontend/src/routes/PublicMemberRoutes.tsx \
  the-bend-frontend/src/routes/WebRoutes.test.tsx \
  the-bend-frontend/src/native/discovery/adapters.ts \
  the-bend-frontend/src/native/discovery/adapters.test.ts \
  the-bend-frontend/src/components/native/ui/NativeBenderCard.tsx \
  the-bend-frontend/src/components/native/ui/NativeBenderCard.test.tsx \
  the-bend-frontend/src/pages/native/NativeHomePage.test.tsx \
  the-bend-frontend/src/pages/native/NativeExplorePage.test.tsx \
  the-bend-backend/app/services/reference_service.py \
  the-bend-backend/tests/test_reference_service.py \
  the-bend-frontend/src/pages/BenderPage.tsx
git diff --cached --name-only
git diff --cached --check
git commit -m "fix(bender): emit canonical focused-post links"
```

---

### Task 4: Fetch focused posts directly and normalize legacy routes

**Files:**

- Modify: `the-bend-frontend/src/services/benderApi.ts`
- Create: `the-bend-frontend/src/services/benderApi.test.ts`
- Create: `the-bend-frontend/src/hooks/useBenderPost.ts`
- Create: `the-bend-frontend/src/hooks/useBenderPost.test.tsx`
- Modify: `the-bend-frontend/src/hooks/useBenderFeed.ts`
- Modify: `the-bend-frontend/src/pages/BenderPage.tsx`
- Create: `the-bend-frontend/src/pages/BenderPage.phase2.test.tsx`

**Interfaces:**

```ts
export interface BenderRequestOptions {
  signal?: AbortSignal
}

export type BenderPostLoadStatus =
  | 'idle'
  | 'loading'
  | 'success'
  | 'unavailable'
  | 'error'

export interface UseBenderPostResult {
  status: BenderPostLoadStatus
  post: BenderPost | null
  error: Error | null
  retry(): void
  patch(values: Partial<BenderPost>): void
}

export function useBenderPost(
  postId: string | null,
): UseBenderPostResult

export interface UseBenderFeedOptions {
  enabled?: boolean
}
```

- [ ] **Step 1: Write failing API, hook, and page tests**

Cover exact encoded request path, null-id idle state, abort on id change, stale-completion rejection, 400, 401, 403, 404, and 422 as unavailable, transient and 5xx as Retry, successful patch, legacy replace navigation, one focused card, no composer or pagination, native focused header suppression, web focused chrome retention, deletion redirect to `/bender`, and direct-link Back fallback.

- [ ] **Step 2: Run the tests and confirm RED**

```bash
cd the-bend-frontend
npm run test:run -- src/services/benderApi.test.ts src/hooks/useBenderPost.test.tsx src/pages/BenderPage.phase2.test.tsx
```

- [ ] **Step 3: Implement focused loading**

`benderApi.getPost` calls:

```ts
api.get<BenderPost>(
  `/bender/posts/${encodeURIComponent(id)}`,
  options?.signal ? { signal: options.signal } : {},
)
```

In `BenderPage`, derive the focused id from `useParams` or the legacy helper. Replace legacy URLs with the canonical path. Disable `useBenderFeed` while focused. Native focused mode suppresses the internal sticky header and renders a visually hidden `<h1>Bender post</h1>` so `NativeRouteFrame` does not create a duplicate page heading. Loading renders one skeleton, unavailable has no Retry, transient error has `Retry loading this post`, and success renders one existing `BenderPostCard`.

- [ ] **Step 4: Run focused and existing tests**

```bash
npm run test:run -- \
  src/services/benderApi.test.ts \
  src/hooks/useBenderPost.test.tsx \
  src/pages/BenderPage.phase2.test.tsx \
  src/pages/BenderPage.native.test.tsx \
  src/hooks/useBenderFeed.test.tsx
```

- [ ] **Step 5: Commit focused loading**

```bash
cd "$(git rev-parse --show-toplevel)"
git add -- \
  the-bend-frontend/src/services/benderApi.ts \
  the-bend-frontend/src/services/benderApi.test.ts \
  the-bend-frontend/src/hooks/useBenderPost.ts \
  the-bend-frontend/src/hooks/useBenderPost.test.tsx \
  the-bend-frontend/src/hooks/useBenderFeed.ts \
  the-bend-frontend/src/pages/BenderPage.tsx \
  the-bend-frontend/src/pages/BenderPage.phase2.test.tsx
git diff --cached --name-only
git diff --cached --check
git commit -m "feat(bender): load focused posts directly"
```

---

### Task 5: Expose first-page feed failure and Retry

**Files:**

- Modify: `the-bend-frontend/src/hooks/useBenderFeed.ts`
- Create: `the-bend-frontend/src/hooks/useBenderFeed.phase2.test.tsx`
- Modify: `the-bend-frontend/src/pages/BenderPage.tsx`
- Modify: `the-bend-frontend/src/pages/BenderPage.phase2.test.tsx`

**Produces:**

```ts
firstPageError: Error | null
retryFirstPage(): Promise<void> | void
```

- [ ] **Step 1: Write failing first-page tests**

Prove initial rejection ends loading, exposes the original error, never renders `No posts yet`, invokes one refresh on Retry, hydrates pagination after recovery, and leaves visible posts intact when a later refresh fails. Keep load-more error behavior separate.

- [ ] **Step 2: Run the tests and confirm RED**

```bash
cd the-bend-frontend
npm run test:run -- src/hooks/useBenderFeed.phase2.test.tsx src/pages/BenderPage.phase2.test.tsx
```

- [ ] **Step 3: Implement status-derived first-page state**

```ts
const loading = cached.data === null && cached.status === 'loading'
const firstPageError = cached.data === null && cached.status === 'error'
  ? cached.error ?? new Error('Unable to load Bender')
  : null
```

Return `retryFirstPage: cached.refresh`. Render `Unable to load posts. Try again.` with a 44-point Retry control.

- [ ] **Step 4: Run focused regression tests**

```bash
npm run test:run -- \
  src/hooks/useBenderFeed.test.tsx \
  src/hooks/useBenderFeed.phase2.test.tsx \
  src/hooks/useCachedPublicContent.test.tsx \
  src/pages/BenderPage.phase2.test.tsx
```

- [ ] **Step 5: Commit first-page recovery**

```bash
cd "$(git rev-parse --show-toplevel)"
git add -- \
  the-bend-frontend/src/hooks/useBenderFeed.ts \
  the-bend-frontend/src/hooks/useBenderFeed.phase2.test.tsx \
  the-bend-frontend/src/pages/BenderPage.tsx \
  the-bend-frontend/src/pages/BenderPage.phase2.test.tsx
git diff --cached --name-only
git diff --cached --check
git commit -m "fix(bender): recover from initial feed failures"
```

---

### Task 6: Add compact native feed cards and safe caption links

**Files:**

- Create: `the-bend-frontend/src/components/features/bender/BenderCaptionLinkCard.tsx`
- Create: `the-bend-frontend/src/components/features/bender/BenderCaptionLinkCard.test.tsx`
- Modify: `the-bend-frontend/src/pages/BenderPage.tsx`
- Modify: `the-bend-frontend/src/pages/BenderPage.phase2.test.tsx`
- Modify: `the-bend-frontend/src/styles/native.css`
- Modify: `the-bend-frontend/src/components/native/ui/NativeComponents.test.tsx`

**Interfaces:**

```ts
export interface BenderCaptionLinkCardProps {
  caption: string | null
}

export function BenderCaptionLinkCard(
  props: BenderCaptionLinkCardProps,
): React.ReactElement | null
```

Add `nativeCompact?: boolean` to the private `BenderPostCard` props.

- [ ] **Step 1: Write failing component and page tests**

Prove the link card shows hostname and original URL, rejects unsafe captions, calls `services.browser.open` without fetching metadata, and has safe anchor attributes. For native feed cards prove text-only cards omit media, captions precede actions, captions are not clamped, video URLs never reach images, and each action has its post-specific name.

Exact labels:

```text
Like Alex Neighbor's post
Unlike Alex Neighbor's post
View comments on Alex Neighbor's post
Send Alex Neighbor's post in a message
Share Alex Neighbor's post
More actions for Alex Neighbor's post
```

Bound the author fragment to 60 characters before composing labels.

- [ ] **Step 2: Run the tests and confirm RED**

```bash
cd the-bend-frontend
npm run test:run -- src/components/features/bender/BenderCaptionLinkCard.test.tsx src/pages/BenderPage.phase2.test.tsx src/components/native/ui/NativeComponents.test.tsx
```

- [ ] **Step 3: Implement native compact mode**

Use `getSafeBenderPreview(post)`. Omit the media wrapper for text-only posts. Render caption, safe link card, then action row. Preserve web order and classes outside `nativeCompact`.

Add native-scoped contracts for full width, `aspect-ratio: 1`, `overflow-wrap: anywhere`, `white-space: pre-wrap`, wrapping actions, and 44-point `.native-bender-post-action` controls.

- [ ] **Step 4: Run complete Bender verification**

```bash
npm run test:run -- \
  src/lib/safeExternalUrl.test.ts \
  src/lib/publicUrl.test.ts \
  src/components/shared/ShareButton.test.tsx \
  src/services/benderApi.test.ts \
  src/hooks/useBenderPost.test.tsx \
  src/hooks/useBenderFeed.test.tsx \
  src/hooks/useBenderFeed.phase2.test.tsx \
  src/routes/benderRoutes.test.ts \
  src/routes/NativeRoutes.test.tsx \
  src/routes/WebRoutes.test.tsx \
  src/native/discovery/adapters.test.ts \
  src/components/native/ui/NativeBenderCard.test.tsx \
  src/components/features/bender/BenderCaptionLinkCard.test.tsx \
  src/pages/BenderPage.native.test.tsx \
  src/pages/BenderPage.phase2.test.tsx \
  src/components/native/ui/NativeComponents.test.tsx
npx tsc --noEmit
npm run lint
npm run build
npm run build:native
cd ../the-bend-backend
uv run --frozen pytest tests/test_user_block_discovery.py tests/test_reference_service.py -q
```

- [ ] **Step 5: Commit compact Bender presentation**

```bash
cd "$(git rev-parse --show-toplevel)"
git add -- \
  the-bend-frontend/src/components/features/bender/BenderCaptionLinkCard.tsx \
  the-bend-frontend/src/components/features/bender/BenderCaptionLinkCard.test.tsx \
  the-bend-frontend/src/pages/BenderPage.tsx \
  the-bend-frontend/src/pages/BenderPage.phase2.test.tsx \
  the-bend-frontend/src/styles/native.css \
  the-bend-frontend/src/components/native/ui/NativeComponents.test.tsx
git diff --cached --name-only
git diff --cached --check
git commit -m "feat(native-bender): compact post cards"
```

---

### Task 7: Verify Bender on Android and iOS

**Files:**

- Create locally, do not track: `.superpowers/sdd/2026-08-20-native-phase-2/bender/`

- [ ] **Step 1: Use the final exact-source installed packages**

```bash
cd "$(git rev-parse --show-toplevel)"
PHASE2_SOURCE_COMMIT="$(git rev-parse HEAD)"
test -f the-bend-frontend/android/app/build/outputs/apk/debug/app-debug.apk
test -d "/tmp/bend-native-phase2-$PHASE2_SOURCE_COMMIT/Build/Products/Debug-iphonesimulator/App.app"
```

First execute the index plan's Full verification and package gate. It runs Gradle and Xcode, hashes both artifacts, installs the APK on `emulator-5554`, and installs the simulator app on `C824154C-356B-4B2C-BDF1-2DC8F71BDB23`. Do not substitute an older installed build or rerun only `build:native` and `cap copy`.

- [ ] **Step 2: Verify the root and focused routes**

On both simulators, verify root feed, text-only and media cards, safe caption links, exact focused post, legacy query and hash normalization, missing post, transient Retry, delete return, Messages action, Back fallback, and no duplicate header.

- [ ] **Step 3: Verify accessibility and layout**

Use TalkBack and VoiceOver on post actions, link cards, focused errors, and Back. Check large text, dark mode, long authors, long captions, broken media, 44-point actions, and no page-level horizontal overflow.

- [ ] **Step 4: Record evidence integrity**

Record the source commit, APK SHA-256, app-bundle path, simulator identifiers, and evidence names. Return both simulators to Home.
