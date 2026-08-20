# Westmoreland native Phase 2 UX design

**Date:** 2026-08-20

**Status:** Approved design, written specification pending user review

**Product:** The Bend Community, Westmoreland native iOS and Android apps

**Phase:** Phase 2, native journey consistency and accessibility

## 1. Purpose

Phase 2 removes the remaining web-style breaks in the native journey. It covers focused routes, Bender, account onboarding, Explore and Map controls, and the Partners carousel. The work keeps the current Westmoreland visual system, APIs, authentication contract, native tenant lock, and web application behavior.

The target journey is simple. A guest can move from Home or Explore into a detail page, Bender, account creation, or a map without seeing website navigation, an install prompt, overlapping navigation, or controls that only work by touch gesture. Loading and failure states remain local and recoverable.

## 2. Relationship to earlier specifications

This document follows:

- `docs/superpowers/specs/2026-08-17-westmoreland-native-apps-design.md`
- `docs/superpowers/specs/2026-08-18-westmoreland-native-ui-redesign-design.md`

The Phase 1 redesign deliberately excluded detail pages, Bender, authentication, and other secondary routes. Phase 2 defines those native presentation rules. Earlier security, privacy, tenant isolation, deep-link, cache, draft, moderation, account-deletion, and release requirements remain in force.

The current worktree already contains approved native changes for Bender discovery, the five-item navigation, the status bar, Community Guidelines, and Partners. Phase 2 must preserve and complete those changes. It must not replace them with a clean-tree version or broad rewrite.

## 3. Approved approach

Use route-aware native presentation on top of shared pages and domain logic.

This approach keeps one API and mutation implementation while giving Capacitor routes native chrome, density, touch targets, and error states. Native behavior is enabled through explicit props, native route composition, and selectors scoped below `.native-app`. Web routes continue to render their existing presentation.

Two alternatives were rejected:

- Duplicating every detail, feed, and authentication page would isolate native presentation but create two implementations for validation, mutations, and error handling.
- CSS-only patches would be smaller but could not fix route ownership, registration flow, event detail, feed error handling, or accessibility semantics.

## 4. Scope

### 4.1 Included

- Route-aware native shell and bottom-navigation visibility.
- Embedded native presentation for listing, business, event, and other focused member routes reached from the native app.
- A real event-detail route backed by the existing event-detail API.
- Native Bender density, action targets, safe caption links, first-page retry, and canonical focused-post routing.
- Corrected login copy and a three-step registration flow.
- Explore tab behavior, List and Map controls, filter separation, map semantics, and location explanation.
- Previous and Next controls for Partners, while retaining swipe and pagination dots.
- Media-specific image fitting for organization logos.
- A compact contents menu and larger back control for Community Guidelines.
- Focused unit and integration tests plus Android and iOS simulator verification.
- Regression checks that native changes do not alter web route presentation.

### 4.2 Excluded

- New backend schemas, feed ranking, recommendation logic, or link-metadata scraping. A tenant-safe single-post Bender read endpoint is included because focused post routes require exact retrieval.
- A separate native codebase in SwiftUI or Jetpack Compose.
- Changes to Stripe, deployment infrastructure, CI/CD, push delivery, or app-store release configuration.
- Redesign of message threads, posting forms, profile editing, endorsement flows, or settings beyond route chrome and safe-area behavior.
- Automatic location permission prompts.
- A claim of WCAG conformance without a dedicated accessibility audit.
- Production deployment, signing, or store submission. Those remain separate authorized release steps.

## 5. Native route architecture

### 5.1 Shell policy

`NativeAppShell` decides whether the persistent bottom navigation is present. The decision uses an explicit allowlist of root destinations instead of a growing denylist. A `NativeRouteFrame` owns the header and direct-link fallback for focused routes. Pages inside that frame do not render a second back row.

The bottom navigation appears only on these roots:

- Home at `/`
- Explore at `/explore`
- Bender at `/bender`
- You at `/you`

The central Create control remains part of this navigation. Messages stay in the Bender header as the approved top action.

Focused, authentication, legal, and task routes do not show the persistent bottom navigation. This includes listing, business, event detail, event index, messages, notifications, settings, create, login, registration, password recovery, and Community Guidelines. These routes retain the native shell for safe areas, theme, keyboard insets, and status-bar coordination.

When the bottom navigation is absent, `.native-main` must not reserve its height. A route-mode class or data attribute controls the main bottom inset. The shell remains the only owner of this spacing.

### 5.2 Route matrix

`History` in the fallback column means the Back control first uses valid in-app router history. A direct deep link uses the named fallback.

| Native route | Access | Bottom navigation | Page treatment | Header and direct-link fallback |
|---|---|---:|---|---|
| `/` | Public | Yes | Dedicated native root | Home header, no Back control |
| `/explore` | Public | Yes | Dedicated native root | Explore header, no Back control |
| `/bender` | Public | Yes | Native Bender root | Bender header with Messages action |
| `/bender/:postId` | Public | No | Native focused Bender post | Back to History or `/bender`; Messages action |
| `/browse` | Public | No | Embedded shared page | `Browse`; Back to History or `/explore` |
| `/listing/:id` | Public | No | Embedded shared detail | `Listing`; Back to History or `/explore?type=listings` |
| `/business/:shopId` | Public | No | Embedded shared detail | `Business`; Back to History or `/explore?type=businesses` |
| `/events` | Public | No | Embedded shared index | `Events`; Back to History or `/explore?type=events` |
| `/events/:eventId` | Public | No | Native event detail | `Event`; Back to History or `/events` |
| `/volunteers` | Public | No | Embedded shared index | `Volunteer`; Back to History or `/explore?type=volunteer` |
| `/talent` | Public | No | Embedded shared index | `Talent`; Back to History or `/explore` |
| `/login` | Public | No | Native-safe auth page | Page-owned Back to History or `/` |
| `/register` | Public | No | Native-safe stepped auth page | Page-owned Back to History or `/login` |
| `/guidelines` | Public | No | Embedded legal page | `Community Guidelines`; Back to History or `/` |
| `/forgot-password` | Public | No | Native-safe auth page | Page-owned Back to History or `/login` |
| `/reset-password` | Public | No | Native-safe auth page | Page-owned Back to History or `/login` |
| `/messages` | Protected | No | Embedded shared page | `Messages`; Back to History or `/bender` |
| `/messages/:threadId` | Protected | No | Embedded focused thread | `Conversation`; Back to History or `/messages` |
| `/notifications` | Protected | No | Embedded shared page | `Notifications`; Back to History or `/` |
| `/you` | Protected | Yes | Member root | You header, no Back control |
| `/settings` | Protected | No | Embedded shared page | `Settings`; Back to History or `/you` |
| `/create` | Protected | No | Embedded shared task | `Create listing`; Back to History or `/` |
| Unmatched route | Public | No | Native unavailable state | `Page unavailable`; Back to `/` |

Protected routes keep the existing pending-destination redirect. A guest redirected from a protected route sees no bottom navigation on Login. Successful authentication resumes only the validated original destination.

### 5.3 Native embedded pages

`NativeAppShell` provides an explicit native-presentation context. `PageLayout` consumes that context and retains its explicit override for isolated routes and tests. This avoids threading a prop through every shared page while keeping the boundary tied to `NativeRoutes`. `WebRoutes` never provides the context. The implementation must not infer native mode from viewport width or user agent.

In embedded native mode, `PageLayout` omits:

- Website navigation.
- Website bottom navigation.
- Sponsor banner.
- Website footer.
- PWA install banner.

Pages reached as focused destinations render a native header with a 44-point back target, a concise title, and only page-specific actions. They use native safe-area and width tokens. Shared index and task pages can keep their existing page heading when it already satisfies this contract, but they cannot render duplicate web chrome.

The context applies to every shared `PageLayout` mounted under `NativeRoutes`, including Browse, listing and business detail, Events, Volunteer, Talent, Messages, Notifications, Settings, and Create. `BenderPage` keeps its native-specific prop because it changes feed composition as well as page chrome. Authentication pages do not use `PageLayout`; the shell policy handles their safe areas and navigation visibility.

Listing and business pages keep their current data, sharing, messaging, endorsement, and offline behavior. This phase changes presentation and route chrome, not permissions or mutations.

### 5.4 Event detail

`/events/:eventId` becomes a real detail page rather than an alias for the event index.

The page:

- Reads `eventId` from the route.
- Calls the existing event-detail client.
- Types the response as `CommunityEvent` rather than leaving the detail client untyped.
- Shows loading, success, unavailable, and retry states.
- Renders event image, title, type, time, venue, description, sharing, and source attribution when provided.
- Uses a secondary external `View source` action for the source URL.
- Keeps internal navigation inside the app and opens external sources through the existing browser service.

Native event cards open `/events/:eventId`. Web event behavior remains unchanged unless a shared correctness fix is required and separately covered by tests.

A missing, deleted, unauthorized, blocked, or cross-tenant event renders the same non-retryable unavailable state and does not reveal whether the event exists elsewhere. Network failures, timeouts, and server failures render Retry. Retry never applies to a confirmed unavailable response.

## 6. Bender

### 6.1 Presentation boundary

The canonical `BenderPage` remains the owner of feed pagination, mutations, optimistic updates, comments, sharing, deletion, and focused-post behavior. Native mode changes card presentation without duplicating those handlers.

`BenderPostCard` receives a native compact mode or delegates its body and actions to small shared components. Web mode keeps the current layout.

### 6.2 Focused-post route

`/bender/:postId` is the canonical focused-post route for native and web deep links. New internal links, message references, and share URLs use this form.

Compatibility handling preserves existing links:

- `/bender?post=:postId` replaces itself with `/bender/:postId`.
- `/bender#post-:postId` replaces itself with `/bender/:postId` when the hash matches the legacy format.
- `/bender` remains the feed root.

The client adds a single-post read method backed by `GET /api/v1/bender/posts/{post_id}`. The endpoint returns the existing `BenderPostResponse`; it introduces no schema. It applies the same tenant, visibility, deletion, blocking, and viewer-projection rules as the feed. Missing, deleted, blocked, unauthorized, and cross-tenant posts all return the same not-found response.

The focused route fetches the exact post instead of paginating the feed in hope of finding it. A transient request failure offers Retry. A confirmed unavailable response shows a safe unavailable state. Back returns to History or `/bender` for a direct deep link.

### 6.3 Card density

- Text-only posts have no reserved media area and place actions directly below the caption.
- Media posts reserve dimensions to prevent layout movement.
- Native preview selection uses the existing safe Bender presentation helper and never sends a video URL to an image element.
- Captions wrap normally with no fixed card height. Text-only cards remove the unused media gap instead of hiding content to achieve a shorter card.
- Long author names, captions, timestamps, and counts must not create horizontal page scrolling.

### 6.4 Actions

Every native icon action has a 44 by 44 point target and a post-specific accessible name. Examples include `Like Alex Neighbor's post`, `View comments on Alex Neighbor's post`, and `Share Alex Neighbor's post`.

The visible icon set and existing mutation behavior remain unchanged. A native layout class controls sizing without changing desktop web controls.

### 6.5 Safe caption links

Native Bender turns the first valid caption URL into a compact text link card. The client must:

- Parse with `URL`.
- Allow only `http:` and `https:`.
- Reject URLs containing credentials.
- Reject `javascript:`, `data:`, `file:`, malformed, and whitespace-only values.
- Use a safe external browser path with `noopener` and `noreferrer` where an anchor is required.
- Display the hostname and original URL text without fetching remote metadata.

The app must not request arbitrary pages to build previews. That would add privacy, latency, and server-side request forgery risks.

### 6.6 Loading and errors

The first feed request exposes its real loading and error state. A failed first request renders an inline alert and a 44-point Retry control. It must not remain as a permanent skeleton or become an incorrect `No posts yet` state.

Pagination failure remains separate. Loaded posts stay visible while a load-more retry is offered. A retry cannot duplicate posts or let an obsolete response overwrite a newer feed state.

## 7. Account entry and registration

### 7.1 Login

Change the subtitle from `Sign in to your business account` to `Sign in to your account`. Business and individual accounts use the same login form and pending-destination behavior.

The login, forgot-password, reset-password, registration, and guidelines routes do not show the persistent bottom navigation. They retain native safe areas and keyboard handling.

### 7.2 Three-step registration

Registration keeps one React Hook Form instance and the existing final schema and API payload.

The steps are:

1. **Account type**
   - Choose Business or Individual.
   - Explain the approval difference in plain language.

2. **Your details**
   - Both account types enter owner name, email, and optional phone.
   - Businesses also enter business name and type, plus optional address and WhatsApp.
   - Individual accounts do not see or submit stale business-only values.

3. **Security and guidelines**
   - Enter and confirm password.
   - Open Community Guidelines.
   - Accept the required guidelines checkbox.
   - Submit registration.

A visible progress indicator announces the current step and total. Back preserves valid entered values. Changing account type intentionally clears or excludes fields that do not belong to the new type. Final submission runs the existing full schema and sends the same flat payload used today.

Per-step validation blocks forward movement only for fields required on that step. Validation errors appear near the field and receive focus or an announcement. The final Register action remains disabled until guidelines consent is checked and while submission is active. Network submission errors remain on the final step with all entered values intact.

## 8. Explore and Map

### 8.1 Type tabs

The type rail remains horizontally scrollable. Selecting a type scrolls the selected tab fully into view.

The tab contract includes:

- A stable id for each tab.
- `aria-controls` linking each tab to the result panel.
- One selected tab with `tabIndex="0"`; all others use `tabIndex="-1"`.
- Left and Right Arrow navigation.
- Home and End navigation.
- One result container with `role="tabpanel"` and `aria-labelledby`.

A trailing inset or subtle overflow cue makes a partial next item look intentional rather than clipped.

### 8.2 List, Map, and filters

Explore has one List and Map segmented control only when the selected type supports maps and the resolved result set contains at least one privacy-safe coordinate. All and Businesses are the supported types. Filters remain a separate action.

The UI does not render a removable `Map` filter chip because Map is a view mode, not a filter. Selecting a type that does not support maps canonicalizes the URL to List and removes stale map-only state. A supported type with zero eligible coordinates also canonicalizes to List after results resolve. Cached offline results use Map only when they contain eligible coordinates. A stale `mode=map` URL remains pending while results load, then resolves to Map or is replaced with List. Existing category, urgency, search, near, and sort query rules remain authoritative.

### 8.3 Map semantics

The interactive map is a labelled region, not a status message. Loading and result-count announcements use separate noninteractive live regions.

Each business marker and selector exposes the business name. Labels distinguish the controls, for example `Show Inn at Montross on map` and `Open Inn at Montross preview`. Marker selection and horizontal selector selection remain synchronized.

`Use my location` stays an explicit button. Supporting text explains that the app asks for location only after activation and uses it to sort or center nearby results. Denial leaves Westmoreland-wide discovery usable and offers retry without repeatedly prompting.

## 9. Partners and organization media

The approved Partners carousel keeps API order, one active slide, swipe, pagination dots, logo fallback, description, website behavior, and the `Partner with us` footer.

When the carousel has more than one partner, add labelled Previous and Next buttons. Both meet the 44-point touch target. Previous is disabled on the first slide and Next is disabled on the last slide. Controls update the physical scroll position, active dot, and live status together.

Dots remain visual position indicators. They do not become tiny interactive controls.

When the partner collection changes, the carousel resets the active index and scroll position to the first item. Website links accept only normalized `http:` or `https:` URLs. Partners without a valid website render as noninteractive cards.

Organization logos use `object-fit: contain` inside a bounded neutral logo stage. Photographic listing and event media continue using `object-fit: cover`. Presentation adapters carry an explicit media role or fit value based on the source field. They do not guess from the URL. Missing or broken logos display the existing text fallback without moving the card content.

## 10. Community Guidelines

Community Guidelines remains a public member page. It is not labelled or routed as an admin feature.

The native page adds a compact `On this page` disclosure after the title. It lists the existing top-level guideline sections in document order. Selecting an item moves focus to that section heading and updates the URL hash without reloading the route. Direct links to known section hashes perform the same focus behavior after content renders. Unknown hashes leave the document at the top.

The Back control has a 44-point target and returns to History or `/` for a direct deep link. Section links and the Back control remain usable with large text and screen readers.

## 11. State, errors, and continuity

- Each route owns its loading, empty, and retry state. One failed section does not blank unrelated content.
- Authentication preserves the validated pending destination and resumes it once after successful login.
- Registration preserves local form state across steps but does not persist passwords outside the form lifetime.
- Bender retry retains its viewer-sensitive, network-only cache policy.
- Explore query changes cancel or ignore obsolete requests.
- Location remains optional and request-driven.
- External links pass through validated native browser handling.
- Back navigation returns to the originating native context when router history exists and uses a safe root fallback for direct deep links.

## 12. Accessibility and adaptive layout

- Interactive controls meet the existing 44-point minimum.
- The shell, pages, dialogs, map, tabs, carousels, and errors expose the correct roles and names.
- Icon-only actions have specific accessible names.
- Focus order follows visible reading order.
- Focus moves to the registration step heading after a step change.
- Native back controls have a 44-point target and an accessible name.
- Text scaling can increase card and form height. It must not clip controls or create letter-by-letter columns.
- Page width remains bounded on compact phones and tablets. Only intentional rails scroll horizontally.
- Dark mode uses existing native semantic tokens.
- Reduced-motion settings disable smooth scrolling and optional transitions.
- Keyboard appearance does not hide the focused field or final action.

## 13. Testing strategy

Implementation follows test-driven development in bounded workstreams.

### 13.1 Route and shell tests

- Bottom navigation appears only on root destinations.
- Focused and auth routes remove reserved navigation spacing.
- Native detail props suppress website chrome and the install banner.
- Web routes keep their existing layout.
- The route matrix controls access, bottom-navigation state, embedded layout, header ownership, and direct-link fallback for every path.
- Event detail covers typed success, privacy-safe unavailable responses, transient retry, source link, and route wiring.

### 13.2 Bender tests

- First-page rejection ends loading and exposes Retry.
- Retry recovers without changing pagination behavior.
- Native text-only and media cards use the correct geometry.
- Actions have post-specific labels and native target classes.
- Safe-link parsing accepts only the approved URL forms.
- Canonical and legacy routes load the exact post, normalize the URL, and preserve safe unavailable behavior.
- The single-post endpoint enforces tenant, deletion, visibility, block, and viewer-projection rules.
- Web Bender presentation remains unchanged.

### 13.3 Authentication tests

- Login copy supports both account types.
- Auth and legal routes hide persistent navigation.
- Business and individual registration paths validate the correct fields.
- Back and forward preserve values.
- Switching account type excludes stale fields.
- Final payloads match the current API contract.
- Consent remains required and the final action stays disabled until it is checked.
- Submission failure preserves the form and selected step.

### 13.4 Explore, Partners, and Guidelines tests

- Tabs implement selection, focus, key navigation, tab-panel ownership, and selected-tab scrolling.
- Map mode is represented once. Unsupported types, zero-coordinate results, and offline results without eligible coordinates remove it from the URL after resolution.
- The map is a labelled region with unique marker and selector labels.
- Location text and denial behavior remain explicit.
- Partner Previous and Next controls synchronize scroll, index, dots, and status.
- Organization logos use contained fitting while content photos retain cover fitting.
- Guidelines contents links follow document order, move focus, maintain hashes, and ignore unknown hashes safely.
- The Guidelines Back control meets the touch-target and direct-link fallback contract.

### 13.5 Full verification

Run focused suites during each workstream, then:

- Full frontend test suite.
- Type checking.
- Lint.
- Web production build.
- Native web build and Capacitor copy for Android and iOS.
- Android Gradle debug build.
- iOS simulator build through Xcode.
- `git diff --check`.

Install the current-source builds on both simulators. Verify compact and large text, light and dark modes, no page-level horizontal overflow, route back behavior, registration state retention, Bender loading and retry, map selection, partner controls, and status-bar clearance. Run one TalkBack pass on Android and one VoiceOver pass on iOS across the changed tabs, map controls, partner controls, registration steps, error Retry controls, Guidelines contents, and native Back controls. Capture evidence from the exact APK and app bundle produced by the verified source.

## 14. Implementation boundaries

The work splits into five testable units:

1. Route-aware shell, embedded detail pages, event detail, and Guidelines navigation.
2. Bender compact native mode, focused-post retrieval, and feed error handling.
3. Login and three-step registration.
4. Explore and Map controls and semantics.
5. Partners controls and organization media fitting.

Each unit can be reviewed and verified independently. Shared files such as `NativeRoutes.tsx`, `NativeAppShell.tsx`, `BenderPage.tsx`, `NativeExplorePage.tsx`, and `native.css` require narrow edits because the active worktree already contains approved changes. Commits must stage explicit files or hunks and must never sweep unrelated work into the same commit.

## 15. Acceptance criteria

Phase 2 is complete when:

1. Native detail routes contain no website navigation, footer, sponsor strip, or install prompt.
2. Root tabs retain bottom navigation; focused, auth, and legal routes do not reserve or show it.
3. Event deep links render an actual event detail and distinguish privacy-safe unavailable responses from retryable failures.
4. Canonical and legacy Bender links load the exact permitted post or a safe unavailable state.
5. Native Bender text-only posts have no blank media gap, all actions meet the touch target, safe links render without metadata fetching, and first-load failure has Retry.
6. Login addresses every account type and registration is a state-preserving three-step flow with unchanged final payloads and consent-gated submission.
7. Explore exposes one List and Map control, valid tab semantics, a labelled map region, uniquely named markers, and deterministic zero-coordinate fallback.
8. Partners can be operated by swipe and labelled Previous and Next controls, and organization logos are not cropped.
9. Community Guidelines is member-facing, has section navigation, and exposes a 44-point Back control.
10. Android and iOS current-source builds pass the defined simulator and screen-reader checks with no page-level horizontal overflow or status-bar overlap.
11. Web build and regression tests show no unintended web presentation changes.
