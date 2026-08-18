# The Bend: Westmoreland Native UI Redesign — Design Specification

**Date:** 2026-08-18

**Status:** Approved design; implementation plan pending approval

**Product:** The Bend: Westmoreland native iOS and Android applications

**Phase:** Phase 1 — native design system, shell, Home, and Explore

## 1. Purpose

Replace the current web-derived native presentation with a warm, modern community experience focused on Westmoreland County. Phase 1 redesigns the shared native shell, primary navigation, Home, and Explore while preserving the existing backend, authentication, offline coordination, drafts, API clients, tenant lock, and web application.

Success means a guest can open the app and quickly understand what is happening in Westmoreland, find urgent needs and local opportunities, search across public content, and move into a focused detail flow without encountering oversized web layouts, overlapping content, or desktop-oriented navigation. Signed-in members retain the same underlying account and mutation capabilities.

## 2. Relationship to the native-app specification

This document refines `docs/superpowers/specs/2026-08-17-westmoreland-native-apps-design.md` and is authoritative for Phase 1 native UI presentation.

It makes one deliberate refinement to that specification: Home and Explore receive dedicated native page components instead of directly rendering the existing responsive web pages. Shared services, state, data contracts, platform adapters, and reusable feature logic remain common. The website remains multi-tenant and continues using its existing web routes and page presentation.

All previously approved security, tenant isolation, native session, push, deep-link, offline privacy, moderation, account deletion, analytics, and release requirements remain unchanged.

## 3. Approved product decisions

| Area | Decision |
|---|---|
| Visual direction | Warm modern community: sans-first interface, compact hierarchy, restrained heritage accents, friendly native interactions. |
| Phase 1 anchor | Home and Explore. |
| Home model | Local dashboard with urgent needs, nearby opportunities, upcoming events, and community highlights. |
| Explore model | Unified discovery through one search surface, type chips, grouped All results, full type views, and list/map switching. |
| Guest access | Public discovery first; authentication is required only for protected actions such as posting, saving, messaging, and endorsing. |
| Location | Westmoreland-wide by default. Ask for device location only when the user selects Near me or invokes map behavior that requires it. |
| Primary navigation | Home, Explore, central Create action, Inbox, and You. |
| Release strategy | Phased. Ship the native system, shell, Home, and Explore before redesigning detail, posting, messaging, profile, endorsement, and settings screens. |
| Technical approach | Dedicated native presentation layer over existing shared services and state. |

## 4. Current problems to solve

The current native Home reuses a desktop-oriented page and global museum styling. On a phone this produces:

- Oversized serif typography and insufficient information density.
- A hero/search composition that can collide with urgent content.
- Tall category tiles that consume multiple screens before primary content appears.
- Weak prioritization between urgent needs, search, categories, partners, events, and listings.
- Web-era grids and page chrome competing with the native bottom navigation.
- Global type and color rules that are difficult to evolve without affecting the website.
- Inconsistent loading, empty, error, offline, permission, and authentication-continuation states.

The redesign addresses these presentation and interaction problems without changing domain behavior or weakening the existing offline and security guarantees.

## 5. Phase 1 scope

### 5.1 Included

- Native-scoped design tokens and reusable components.
- Safe-area-aware native shell and redesigned five-tab navigation.
- Dedicated `NativeHomePage`.
- Dedicated `NativeExplorePage`.
- Shared native loading, empty, error, cached/offline, and permission states.
- Contextual location flow for Near me and map use.
- Authentication continuation for protected actions reached from Home or Explore.
- Android and iOS simulator verification in light and dark modes.
- Regression protection proving the web presentation remains unchanged.

### 5.2 Explicitly excluded

- Backend schema changes or a new federated-search endpoint.
- A recommendation engine or behavioral ranking system.
- Background location.
- Redesign of listing, business, event, volunteer, Bender, message, profile, endorsement, settings, authentication, or creation detail screens.
- Changes to desktop web navigation or typography.
- A tablet-specific information architecture.
- New analytics, push, payment, or moderation behavior beyond the previously approved native specification.

Excluded screens remain reachable and functional through the Phase 1 native shell. They retain their current presentation until later phases.

## 6. Presentation architecture

### 6.1 Route boundary

`NativeRoutes` maps `/` and `/explore` to dedicated native pages. `WebRoutes` continues mapping equivalent destinations to the existing web pages. This route split is the hard boundary preventing Phase 1 layout changes from leaking into the website.

```text
Shared domain types, API clients, stores, platform services, and cache
                              |
                  Native view-model adapters
                     /                  \
          NativeHomePage          NativeExplorePage
                     \                  /
               Native UI components and tokens
                              |
             NativeAppShell + NativeBottomNav
```

### 6.2 Native style scope

`NativeAppShell` provides a native root scope. Native tokens and selectors live beneath that root rather than changing global heading, body, card, or navigation rules. Components use tokens for color, spacing, radius, elevation, type, motion, and safe-area behavior.

The native system wraps existing headless UI primitives only where their behavior already satisfies this specification; page composition and visual styling remain native-specific.

### 6.3 Shared data continuity

The new pages continue using the current tenant context, authentication store, listing/event/business/volunteer clients, network adapter, public-content cache, and route contracts. They do not duplicate API access or create a second source of truth.

Small native view-model adapters normalize heterogeneous public entities into presentation-safe cards. These adapters contain formatting and display selection only; they do not persist new domain data or infer authorization.

## 7. Visual system

### 7.1 Personality

The approved personality is warm, modern, local, and trustworthy. It should feel more polished than a marketplace utility while remaining faster and clearer than the current heritage-heavy presentation.

### 7.2 Typography

- Use the native/system sans stack for interface text, content, controls, navigation, and section headings.
- Preserve serif usage for the Bend mark and rare identity moments, not general UI hierarchy.
- Use compact type scales with readable line height and no decorative tracking on action labels.
- Respect operating-system text scaling without clipping or hiding actions.

### 7.3 Color

- Community green is the primary action, active-navigation, and trust color.
- Bronze is a restrained editorial accent for category labels, dividers, and selected highlights.
- Warm ivory is the principal page surface; cards remain warm white.
- Urgent content uses an accessible red family and never relies on color alone.
- Dark mode has dedicated semantic tokens rather than global class overrides.

### 7.4 Shape, spacing, and elevation

- Use an 8-point spacing rhythm with controlled 4-point adjustments.
- Interactive controls are at least 44 by 44 points.
- Cards generally use 16–18 point radii; small chips use pill radii.
- Elevation is subtle and reserved for floating search, sheets, and the central Create action.
- Images use fixed aspect ratios to prevent layout movement.

### 7.5 Motion and haptics

- Transitions are brief, purposeful, and disabled or reduced when the operating-system preference requires it.
- Haptics are limited to opening Create, meaningful selection, and confirmed success.
- Loading motion uses restrained skeleton shimmer or pulse and never blocks screen-reader announcements.

## 8. Native shell and navigation

`NativeAppShell` owns page background, top and bottom safe areas, status/navigation bar coordination, keyboard insets, main scroll regions, transition boundaries, and persistent primary navigation.

The five destinations are:

1. **Home** — local dashboard.
2. **Explore** — unified public discovery.
3. **Create** — central action that opens a bottom sheet.
4. **Inbox** — protected messages destination.
5. **You** — protected member hub.

Selecting an inactive tab navigates to its root. Selecting the active Home or Explore tab scrolls its root view to the top. Detail routes open as focused routes with a visible back affordance and preserve deep-link behavior.

Create opens an action sheet before authentication. A guest can choose an intended action, authenticate, and resume that allowlisted action. Inbox and You preserve their current protected-route behavior.

## 9. Home design

Home is a public Westmoreland dashboard, not a promotional landing page.

### 9.1 Content order

1. Compact Bend/Westmoreland header with notifications or account entry.
2. “Around Westmoreland” context, concise title, and search entry.
3. Quick actions: Offer, Find, Volunteer, and Events.
4. Urgent nearby/Westmoreland-wide needs.
5. Happening soon.
6. Opportunities nearby or across Westmoreland.
7. Community highlights.
8. Restrained community-partner placement.

The first viewport should expose context, search, quick actions, and the beginning of useful live content. It must not contain a large decorative hero.

### 9.2 Guest and member behavior

Guests see public Westmoreland content. Signed-in members additionally see saved-state indicators and relevant account activity when those values are returned by existing clients. Phase 1 does not add personalized ranking.

Search transfers the current query to Explore. “See all” actions select the relevant Explore type/filter rather than opening redundant bespoke indexes.

### 9.3 Urgency

Urgent needs receive prominent but compact treatment. The component communicates count, urgency, title, location/date, and primary destination without rendering a full listing card inside an oversized alert container.

## 10. Explore design

Explore is one discovery surface for listings, businesses, events, and volunteer opportunities.

### 10.1 Search and filters

- Search remains visible near the top.
- Type chips are All, Listings, Businesses, Events, and Volunteer.
- Secondary filters open in a bottom sheet.
- Active filters remain visible as removable chips.
- List/map switching appears only when the selected result set contains mappable entities.
- Near me clearly triggers the contextual location flow.

### 10.2 Result composition

The All view queries existing public endpoints in parallel and presents grouped sections by entity type. Each group has a bounded result count and a “See all” action that selects its type view. This avoids pretending heterogeneous API pagination is one authoritative mixed feed.

Type views use their existing endpoint pagination and filters. Presentation adapters normalize only the shared card shell fields such as label, title, supporting metadata, thumbnail, location availability, and target route.

### 10.3 Partial failures

If one endpoint fails in All mode, successful groups remain visible and the failed group displays an inline Retry state. A partial failure never removes all valid results or becomes a full-screen error.

### 10.4 Map behavior

Map mode includes only results with valid display coordinates. It never exposes private or more precise coordinates than the existing public API permits. Selecting a marker opens a compact preview before navigating to the detail route.

## 11. Reusable native components

Phase 1 establishes the following small, independently testable components:

- `NativePageHeader`
- `NativeSearchBar`
- `NativeQuickAction`
- `NativeSectionHeader`
- `NativeUrgentCard`
- `NativeDiscoveryCard`
- `NativeFilterChip`
- `NativeFilterSheet`
- `NativeResultGroup`
- `NativeEmptyState`
- `NativeInlineError`
- `NativeOfflineBanner`
- `NativeSkeleton`

Each component accepts presentation data and callbacks. It does not fetch domain data or access route globals directly. Page components or view-model hooks own orchestration.

## 12. Data flow and state ownership

### 12.1 Home

Home view-model logic starts independent public requests through existing clients. Each section resolves separately so one slow service does not block the full dashboard. When stable cached public projections exist, they render first; successful network responses replace them and refresh cache metadata through the existing cache layer.

### 12.2 Explore

Explore owns URL-backed query, selected type, filters, sort, map/list mode, and pagination cursor for the active type. Navigating away and back restores meaningful discovery state through the route rather than a second global store.

The All view has independent request states per entity group. Type views use existing typed responses and pagination. Rapid query or filter changes cancel or disregard obsolete responses so late results cannot overwrite the latest selection.

### 12.3 Location

Westmoreland-wide results require no permission. Selecting Near me or a location-dependent map control calls the existing location platform service. Granted coordinates remain ephemeral search inputs unless existing privacy-safe behavior explicitly persists a coarse choice. Denial or unavailability leaves discovery usable and offers manual Westmoreland-wide filters.

### 12.4 Authentication continuation

Protected actions create an allowlisted pending intent containing the destination and safe action identifier. Authentication success resumes that intent once. Cancellation or failure returns to the originating public context without performing the action.

## 13. Loading, empty, offline, and error behavior

- Skeletons match final card geometry and section size.
- Sections resolve independently; the screen remains interactive while lower sections load.
- Empty states explain the exact missing result and offer one useful action, such as clearing filters or creating the first listing.
- API errors stay local where partial content is valid and include Retry.
- A full-screen unavailable state is reserved for a required route payload that cannot render safely.
- Cached content displays an offline/stale banner with freshness context.
- Map and Near me controls clearly disable or degrade when their required network/location capability is unavailable.
- Posting, saving, messaging, endorsing, and other mutations retain existing online/authentication requirements and never claim success from local presentation state alone.

## 14. Accessibility, performance, and platform behavior

### 14.1 Accessibility

- Minimum 44-point interactive targets.
- Semantic headings and landmarks with one logical page title.
- Screen-reader labels for icon-only controls, distance, urgency, filter state, and navigation selection.
- Logical focus order through search, quick actions, sections, filters, sheets, and results.
- Contrast compliant semantic colors in light and dark modes.
- Text scaling without clipped labels, hidden actions, or horizontal page scrolling.
- Reduced-motion support and non-motion status announcements.

### 14.2 Performance

- Reserve image dimensions and lazy-load below-the-fold media.
- Use bounded Home and All-mode result counts.
- Debounce query input while preserving immediate keyboard feedback.
- Cancel or ignore obsolete requests.
- Avoid mounting the map implementation until map mode is selected.
- Keep first useful public content independent of protected session hydration.

### 14.3 Native conventions

- Respect iOS and Android safe areas and system back behavior.
- Bottom sheets avoid keyboard and home-indicator overlap.
- The central Create action remains reachable without obscuring content.
- Deep links use the same native destinations and unavailable-state rules defined by the native-app specification.

## 15. Testing strategy

### 15.1 Component and page tests

- Render every reusable component in populated, loading, empty, error, offline, light, and dark states where applicable.
- Verify Home ordering, search handoff, quick actions, section independence, urgent content, guest/member differences, and partner placement.
- Verify Explore type selection, filter sheet behavior, removable filters, grouped All results, typed pagination, stale-response rejection, map eligibility, and partial endpoint failure.
- Verify active-tab reselection, Create intent continuation, protected tabs, detail back behavior, and deep-link routing.

### 15.2 Platform and permission tests

- Prove location is not requested on launch or ordinary Westmoreland-wide discovery.
- Cover permission granted, denied, restricted, unavailable, and service-error outcomes.
- Verify offline cache messaging and disabled location/map actions.
- Verify haptics and motion respect platform capability and reduced-motion settings.

### 15.3 Regression and visual evidence

- Existing frontend and backend suites remain green.
- Route tests prove web Home/Explore are unchanged and native routes select the dedicated pages.
- Android and iOS simulator evidence covers compact and large phone sizes, signed out and signed in, light and dark modes, online and cached offline content, filters, location denial, and partial API failure.
- Screenshots must show no overlap, clipping, hidden navigation, inaccessible controls, or unintended desktop UI.

## 16. Implementation and release sequence

Phase 1 proceeds in dependency order:

1. Native tokens, style scope, and component test harness.
2. Native shell and navigation behavior.
3. Home view-model and page.
4. Explore view-model, filters, grouped All results, typed views, and map activation.
5. Accessibility, dark mode, performance, and platform polish.
6. Full regression suite and fresh Android/iOS simulator evidence.

No production native release occurs from a successful build alone. Both simulators must display live Westmoreland API content and pass the required interaction/state matrix. Existing manual backend deployment and app-store release boundaries remain unchanged.

## 17. Phase 2 boundary

After Phase 1 evidence is accepted, the same system is eligible to be applied to:

- Listing, business, event, volunteer, and Bender detail screens.
- Creation and editing flows.
- Messages and conversation details.
- Profile, business identity, endorsements, and trust states.
- Notifications, settings, privacy, and account controls.
- Authentication screens.

Phase 2 receives its own scoped design and implementation plan. Phase 1 does not opportunistically restyle these screens.

## 18. Acceptance criteria

Phase 1 is complete only when all of the following are proven:

1. Native Home and Explore use dedicated presentation components while the web pages remain visually and behaviorally unchanged.
2. The first Home viewport shows Westmoreland context, search, quick actions, and useful live content without overlap.
3. Urgent needs, events, opportunities, highlights, and partners have a clear visual hierarchy.
4. Explore searches all approved public entity types through one surface and supports grouped All results plus complete typed views.
5. Location is requested only after an explicit Near me or location-dependent map action.
6. Guest browsing works without authentication; protected actions resume safely after authentication.
7. Loading, empty, partial failure, full failure, cached offline, denied permission, light, and dark states are usable and tested.
8. Accessibility requirements pass at supported text sizes and with screen-reader navigation.
9. Android and iOS simulator evidence shows live API content with no clipping, collisions, desktop chrome, or broken bottom navigation.
10. Existing offline privacy, tenant isolation, session, deep-link, and mutation-safety tests remain green.

## 19. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Native and web presentation drift creates duplicate domain behavior | Share API clients, state, platform services, and domain types; keep dedicated pages presentation-only. |
| Global museum CSS leaks into native screens | Scope native tokens beneath `NativeAppShell` and avoid modifying global heading/body rules for Phase 1. |
| Unified Explore implies unsupported cross-type ranking | Use grouped All results and authoritative typed pagination rather than inventing one mixed ranking. |
| Parallel endpoint failure blanks discovery | Track state per group and retain successful sections with inline Retry for failures. |
| Location prompts reduce trust | Default to Westmoreland-wide discovery and request permission only after explicit intent. |
| Redesign expands into every existing screen | Enforce the Phase 1 route/component boundary and defer detail flows to a separately approved Phase 2. |
| Visual polish masks offline or mutation regressions | Reuse existing coordination layers and require the full online/offline interaction matrix before release. |

## 20. Design approval record

The approved choices are:

- Warm modern community visual direction.
- Home and Explore as the redesign anchor.
- Local-dashboard Home.
- Unified-discovery Explore.
- Public discovery before authentication.
- Contextual location permission.
- Home, Explore, Create, Inbox, and You navigation.
- Phased release.
- Dedicated native presentation layer over shared services.
- Approved architecture, visual system, information architecture, interaction components, verification strategy, and release boundary.

The next authorized activity after review of this written specification is to create a detailed implementation plan. Application implementation is not authorized by this document alone.
