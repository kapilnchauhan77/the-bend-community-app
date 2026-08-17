# The Bend: Westmoreland Native Apps — Design Specification

**Date:** 2026-08-17
**Status:** Approved design; pending written-spec review
**Product:** Native iOS and Android applications for The Bend community in Westmoreland County, Virginia

---

## 1. Purpose

Create quality-focused public iOS and Android applications named **The Bend: Westmoreland** from the existing React/Vite progressive web application. The native applications serve only the Westmoreland community, preserve The Bend's brand and core member experience, and add mobile-native navigation, secure sessions, push notifications, verified deep links, device integrations, reliable offline reading, product analytics, and crash monitoring.

The existing website and backend remain multi-tenant. The website continues to host public, member, admin, and super-admin experiences. The native binaries expose public and member experiences only and always operate in the Westmoreland tenant.

Success means a Westmoreland resident can install the app from the U.S. Apple App Store or Google Play, browse as a guest, sign in as a member, create and interact with community content, message other members, receive the four required notification types, complete an eligible Stripe purchase through the system browser, and return to the exact in-app destination without encountering a web-wrapper experience.

---

## 2. Existing-system baseline

The current application consists of:

- A React 19 and Vite 8 frontend with responsive mobile layouts and a service-worker PWA.
- A FastAPI backend using async SQLAlchemy, PostgreSQL, Redis, Celery, and WebSockets.
- Tenant selection through subdomain resolution or `X-Tenant-Slug`, with Westmoreland as the current fallback.
- A production GCE deployment using Docker Compose and manual deployment commands. No tracked CI/CD workflow currently governs builds or deployments.
- Browser integrations for camera/video capture, location, sharing, clipboard access, Stripe Checkout redirects, WebSocket messaging, and partial web-push scaffolding.
- Browser authentication tokens persisted in `localStorage`.
- Notification records and worker tasks, but no complete domain-event-to-native-push pipeline. The notification service still has unfinished push/WebSocket dispatch work.
- Public/member, admin, and super-admin routes in the shared web application.

The migration reuses the stable web and backend capabilities while replacing browser-specific assumptions behind explicit platform boundaries.

---

## 3. Approved decisions

| Area | Decision |
|---|---|
| Community | Native apps are permanently locked to `westmoreland`; the website and backend remain multi-tenant. |
| Audience | Guests and members only. Admin and super-admin remain website-only. |
| Architecture | Capacitor 8 packages the shared React/Vite member experience for iOS and Android. |
| UX direction | Adaptive native shell: preserve brand and shared feature UI while adding native navigation, safe areas, gestures, permissions, and platform services. |
| Navigation | Home, Explore, central Post action, Inbox, and You. |
| Offline scope | Recently viewed content is readable offline; messages, posting, payments, and account mutations require a connection. |
| Push scope | New messages, listing interest, registration decisions, and urgent listings. |
| Payments | Start in app, open Stripe Checkout in the secure system browser, return through a verified HTTPS deep link, and verify server-side before success. |
| Analytics | PostHog product analytics plus Sentry crash and performance monitoring, with an explicit sensitive-data denylist. |
| Store territory | United States only for version one. |
| Store ownership | Organization accounts representing The Bend; organization verification and D-U-N-S work begin before implementation completes. |
| Release posture | Quality-focused public release with real-device testing, pilot users, store review, and staged rollout. |
| App identity | Display name `The Bend: Westmoreland`; bundle/package identifier `community.bend.westmoreland`. |
| Platform minimums | iOS 15+ and Android API 24+ (Android 7+), following Capacitor 8 requirements. |

---

## 4. Scope

### 4.1 Included public and member capabilities

- Public home content and Westmoreland discovery.
- Listings, businesses, events, Bender posts, volunteers, and talent.
- Guest browsing with authentication gates on protected actions.
- Member registration, sign-in, session recovery, and sign-out.
- Individual-member profiles and business profile/shop access for business-affiliated accounts.
- Creating and managing supported listings and Bender posts.
- Real-time direct messaging, media, entity references, unread state, and push-driven entry.
- Listing interest and registration-decision flows.
- Urgent-listing notifications.
- Sharing, camera/photo selection, short video capture, and foreground location access.
- Saved and owned content, discount codes, notification preferences, privacy settings, analytics opt-out, and account deletion.
- Paid event-submission or advertising entry only where enabled by the backend's native commerce capability.

### 4.2 Explicitly excluded from version one

- Admin and super-admin interfaces.
- Tenant selection or communities other than Westmoreland.
- Offline creation, an offline user-content/business mutation queue, or offline messaging. A minimal security-only device-revocation record is the sole exception.
- Background location tracking.
- A tablet-specific information architecture; tablet layouts must remain usable and responsive.
- Native StoreKit or Google Play Billing implementation. It is a contingency if store review rejects the approved external-checkout approach.
- Non-U.S. storefronts.
- Shipping production web code into installed binaries outside app-store release review.
- Unrelated backend or frontend refactoring.

---

## 5. User experience and information architecture

### 5.1 Native shell

The native application uses a platform-aware shell around shared React screens. It respects iOS and Android safe areas, native back behavior, keyboard insets, status/navigation bars, haptics on important confirmations, reduced-motion settings, and accessible touch targets. It must feel intentionally installed rather than like the website displayed inside a generic WebView.

### 5.2 Primary navigation

- **Home:** Personalized listings, urgent needs, nearby events and businesses, and Bender previews.
- **Explore:** Search and category access for Listings, Businesses, Events, Bender, Volunteers, and Talent.
- **Post:** Central action sheet for offering or requesting a listing and creating a Bender post. Guests retain their intended action through sign-in.
- **Inbox:** Real-time conversations, media and entity references, unread badges, and notification destinations.
- **You:** Profile or shop, saved items, owned content, notifications, discount codes, settings, privacy controls, and account deletion.

Guests can browse public content. A protected action opens authentication and preserves the intended route/action so the user resumes after success. Native navigation never exposes admin or super-admin routes, and the backend continues to enforce authorization independently of route visibility.

---

## 6. System architecture

```text
Shared React/Vite member application
            |
      PlatformServices
       /            \
Web implementations  Capacitor implementations
                           |
                 iOS and Android projects
                           |
               FastAPI API and WebSockets
                           |
        PostgreSQL, Redis, Celery, Stripe
                     /             \
                   APNs            FCM
```

### 6.1 Shared application core

The existing React/Vite application remains the source for shared pages, feature components, API clients, validation, and visual design. Runtime route configuration exposes the correct surfaces for web and native. The native shell adds mobile navigation and platform behavior without forking feature logic into separate iOS and Android clients.

### 6.2 Runtime configuration

`RuntimeConfig` is the single source for:

- Runtime type: web, iOS, or Android.
- API and WebSocket base URLs.
- App version and native build number.
- Release environment.
- Tenant slug.
- Enabled native commerce capability returned by the backend.

For native builds, the tenant is compiled and validated as `westmoreland`, and every API request sends `X-Tenant-Slug: westmoreland`. No user-controlled setting, deep link, remote value, or API response may change the native tenant.

### 6.3 Platform services boundary

Feature code depends on typed interfaces rather than calling browser or Capacitor APIs directly:

- `SecureSessionStore`
- `PushService`
- `DeepLinkService`
- `BrowserService`
- `MediaService`
- `LocationService`
- `ShareService`
- `NetworkService`
- `ContentCache`
- `AnalyticsService`
- `CrashReporter`

Web and native implementations may differ without changing feature consumers. Contract tests validate identical success, cancellation, denial, and failure semantics for each implementation.

### 6.4 Backend continuity

FastAPI, PostgreSQL, Redis, Celery, WebSockets, and Stripe remain the authoritative backend. Native support adds narrowly scoped device-installation, push-dispatch, account-deletion, blocking/moderation, deep-link verification, and native-capability behavior. Existing tenant and authorization checks remain mandatory.

---

## 7. Authentication and session lifecycle

The website may retain its current browser persistence during the migration. Native apps use a separate secure-session implementation:

1. On sign-in, the access token remains in application memory. The refresh credential is stored in iOS Keychain or Android Keystore through the secure native adapter.
2. On launch, the app hydrates the refresh credential, obtains a fresh access token, loads the member, then resolves the pending route.
3. Concurrent `401` responses share one serialized refresh operation. Requests wait for its result instead of issuing multiple refreshes.
4. If refresh fails, the app clears memory, secure credentials, local member state, and the registered device installation, then returns to sign-in.
5. Online sign-out revokes the refresh session server-side, disables the installation token, resets PostHog identity, clears private state, and returns to guest Home.
6. Offline sign-out clears the member session immediately, disables local notification handling, requests APNs/FCM token deletion or unregistration, and retains only an opaque installation-revocation credential. Before any later authenticated use, `PushService` sends that credential to a dedicated revocation endpoint and removes it after acknowledgement.

Tokens never enter analytics, crash breadcrumbs, logs, URLs, notifications, or the offline content cache.

---

## 8. Push notifications

### 8.1 Supported categories

- `message_received`
- `listing_interest_received`
- `registration_decision`
- `urgent_listing_published`

Each category has a server-backed member preference. The operating-system permission is the global control; category settings take effect only after permission is granted. The app asks for push permission after sign-in with a contextual explanation, not on first launch.

### 8.2 Device installations

Add a tenant-scoped `DeviceInstallation` record with:

- Installation UUID generated on device.
- Member and tenant IDs.
- Platform (`ios` or `android`).
- APNs/FCM token.
- Hash of an opaque installation-revocation credential whose secret exists only in secure device storage.
- App version and build number.
- Enabled state, locale, creation time, update time, and last-seen time.

Tokens are unique per active installation and treated as personal data. Token refresh updates the existing installation. Sign-out, account deletion, invalid-provider responses, and explicit notification disablement deactivate the installation. The revocation endpoint accepts only the installation ID and its opaque revocation credential; it cannot access account data or perform any other mutation.

### 8.3 Delivery flow

1. A committed domain action creates the in-app notification and an outbox job in the same transactional boundary.
2. Celery consumes the job, evaluates member preferences, finds active Westmoreland installations, and sends through APNs or FCM.
3. The provider result records delivery acceptance or an actionable failure. Permanently invalid tokens are disabled; transient failures retry with bounded exponential backoff.
4. The payload contains a category, notification ID, target entity type/ID, and privacy-safe display text. Message bodies, precise location, tokens, and private media URLs are excluded.
5. Tapping the notification opens the mapped route, passes through authentication if necessary, and fetches fresh server state.

Push complements rather than replaces WebSockets. Foreground messaging continues through the current real-time channel; duplicate notification presentation is suppressed when the user is already viewing the affected conversation.

---

## 9. Deep links and external browser flow

Verified links use `https://westmoreland.bend.community/...` with Apple Universal Links and Android App Links. The website hosts the required association files. Supported destinations include listings, businesses, events, Bender posts, conversations, notifications, authentication continuation, account deletion information, and checkout return routes.

The router follows this sequence:

1. Validate the host and map the path to an allowlisted native route.
2. Reject attempts to change the tenant or invoke admin routes.
3. If authentication is required, store the allowlisted destination, authenticate, and resume it.
4. Fetch the current entity. Missing, deleted, cross-tenant, or unauthorized entities open a safe unavailable screen rather than a blank view.

### 9.1 Stripe Checkout

1. The app asks the backend to create a tenant-scoped Checkout Session.
2. `BrowserService` opens Stripe Checkout in the operating system's secure browser.
3. Stripe returns to a verified HTTPS link containing an opaque session reference.
4. The app calls the backend for authoritative session/payment status.
5. Only the backend-verified result displays success or unlocks the submitted product.

Cancellation, provider failure, delayed webhook completion, and an invalid return each receive distinct recovery screens. URL parameters alone never establish payment success.

The backend exposes a native commerce capability so the iOS entry point can be disabled without an app update if review rejects paid promotion displayed in the app. In that contingency, purchasing remains available on the website while native users can still view already-approved content. StoreKit or Play Billing is a later policy-driven alternative, not part of version one.

---

## 10. Media, location, and sharing

- Camera, photo library, microphone, and location permissions are requested at the moment the member invokes the dependent action.
- A pre-permission explanation describes the user benefit. Denial leaves the app usable and provides a settings shortcut when the operating system permits it.
- Native photo selection and camera capture feed the existing upload APIs through `MediaService`.
- Existing upload size, type, duration, and short-video limits remain authoritative on both client and server.
- Upload progress is visible. Retrying uses an idempotency key so a network interruption cannot create duplicate posts or media.
- A failed upload preserves the local draft and selected local media reference until the member discards it, signs out, or completes the upload.
- Location is foreground-only and requested for a specific nearby/search action. The app does not continuously monitor or store background location.
- Native builds use the operating system's share sheet. The website uses its existing share or clipboard fallback.

---

## 11. Offline reading and network recovery

Version one provides bounded, read-only offline access:

- Cache the 50 most recently opened listings, businesses, events, and Bender posts using an LRU policy.
- Store normalized text metadata and the first display image when available, capped at 50 MB total. Native storage uses the `ContentCache` adapter; web retains its service-worker/browser strategy.
- Never cache messages, authentication responses, account settings, private media, payment responses, or admin data.
- Show an offline banner and the cache timestamp when serving stored content.
- On reconnection or foreground resume, refresh the visible item and then the recent-content index.
- Posting, messaging, profile changes, registration actions, listing interest, and checkout require a connection. They are not silently queued.
- Local form drafts may persist on the device, but they are not considered submitted and are cleared on sign-out or successful submission.
- The offline sign-out revocation credential described in Section 7 is a security-control exception. It contains no user content and cannot authorize any action except disabling that installation.

WebSocket reconnection uses bounded exponential backoff with jitter, resumes from the last known server cursor, and resynchronizes unread/message state before removing the reconnecting indicator.

---

## 12. Analytics and observability

### 12.1 Product analytics

Use PostHog behind `AnalyticsService` for an explicit allowlist of product events. Initial funnels cover:

- App opened to meaningful Home/Explore engagement.
- Guest protected action to registration/sign-in completion and resumed action.
- Listing or Bender draft started to successfully published.
- Search performed to result opened and interest sent.
- Conversation opened to message-send success/failure.
- Push explanation viewed, permission outcome, notification received, and notification opened.
- Checkout started, browser opened, return received, backend verification result, and submitted product status.
- Account-deletion flow started, confirmed, and completed.

Identify members with the backend user UUID only. Reset identity at sign-out. Session replay is disabled for version one. Users can opt out from Settings, and the choice applies before event collection resumes on later launches.

### 12.2 Crash and performance monitoring

Use Sentry's Capacitor SDK for JavaScript and native crash capture, release/build correlation, source maps, and sampled performance traces. Scrubbing runs before transmission.

### 12.3 Data denylist

Neither analytics nor crash reports may contain:

- Message bodies or draft text.
- Uploaded media, attachment URLs, or signed URLs.
- Names, email addresses, phone numbers, street addresses, or precise coordinates.
- Authentication tokens, cookies, push tokens, checkout session identifiers, or payment details.
- Raw API request/response bodies for authenticated endpoints.

Allowed properties are coarse and operational: event type, entity category, result, error class, app version/build, platform/OS, route template, connection state, and duration buckets.

---

## 13. Moderation, blocking, and support

Store submission is blocked until all user-generated-content surfaces provide the following:

- A visible report action for listings, businesses, events, Bender posts, profiles, and messages.
- A server-owned report record with tenant, reporter, target type/ID, reason, optional non-sensitive explanation, status, timestamps, and moderator audit history.
- A block action from profiles and conversations.
- A tenant-scoped block relationship that prevents either party from sending new direct messages or starting conversations. Existing thread history remains readable, its composer is disabled, and the blocked member's listings, events, businesses, Bender posts, and profile are removed from the blocker's feeds, search results, and directory surfaces.
- Immediate local UI removal after successful blocking, followed by server refresh.
- Server-side enforcement so a blocked member cannot bypass the UI through direct API calls.
- A published support/contact route accessible from Settings, content report confirmations, the website, and store metadata.
- Public user-authored titles, descriptions, captions, and profile text pass a configurable prohibited-term and spam/link-abuse filter before display. Failed submissions return an editable rejection; moderators can unpublish content, suspend accounts, and resolve reports through the existing website-only moderation surfaces.

Blocking does not erase historical shared records required for conversation integrity or moderation. It removes future contact and hides content for the blocker while preserving the moderator audit trail.

---

## 14. Account deletion and privacy

Settings contains an easy-to-find **Delete account** flow:

1. Explain the consequences and what legally retained records remain.
2. Require recent authentication and explicit confirmation.
3. Mark the account deletion-pending, revoke active access/refresh sessions, disable all device installations, and prevent new sign-in immediately.
4. A Celery job deletes the identity, contact details, profile, preferences, saved data, private uploads, and other personal data within 24 hours.
5. Shared messages or community records that must remain for other participants are detached from the identity and display an anonymized deleted-member attribution. Private message media owned solely by the deleted member is removed.
6. Minimal transaction and moderation records required by law or fraud/safety obligations remain access-controlled and detached from the public profile. Stripe remains the payment-system record; the application never stores card details.
7. Before the account is locked, let the member request an email confirmation. The deletion job retains that address only until it sends the completion notice, then removes it.

The website exposes a public deletion-request URL for Google Play requirements. It supports browser authentication without reinstalling the app and provides a support-assisted identity-verification route when the member cannot sign in. The privacy policy and store disclosures enumerate account data, content, messages, media, foreground location, device identifiers, push, analytics, crash diagnostics, retention, deletion, and contact methods.

---

## 15. Error handling

| Condition | Required behavior |
|---|---|
| Offline launch | Open cached public content, show offline state and timestamp, and disable network-only actions. |
| Session refresh failure | Clear protected state and route to sign-in while retaining only an allowlisted pending destination. |
| Push permission denied | Continue without push, show category settings as unavailable, and provide a system-settings path. |
| Invalid push token | Disable the installation and renew registration on the next eligible launch. |
| WebSocket disconnect | Show reconnecting state, back off with jitter, resynchronize, and avoid duplicate messages. |
| Upload interrupted | Preserve the draft and local media reference, offer retry/cancel, and prevent duplicate submission. |
| Deep-link target unavailable | Show a safe unavailable screen with navigation to the relevant section. |
| Checkout cancelled | Return to the purchase context with no success state and a retry option. |
| Checkout verification pending | Poll a bounded number of times, then show a pending state that can be refreshed later. |
| Backend capability disabled | Hide or disable the native purchase entry and explain that purchasing is available on the website. |
| Block/report failure | Keep the current state, show a retryable error, and never claim the safety action completed. |
| Deletion job failure | Keep the account locked, alert operations without personal content, retry safely, and provide support contact. |

User-facing errors are plain-language and actionable. Telemetry records stable error codes rather than private payloads.

---

## 16. Testing strategy

### 16.1 Automated tests

- Unit tests for runtime configuration, route allowlists, cache policy, analytics redaction, notification mapping, and checkout-state interpretation.
- Contract tests for every web/native `PlatformServices` implementation.
- React tests for navigation, authentication continuation, permission denial, offline states, drafts, notification taps, moderation, account deletion, and accessible interaction.
- FastAPI tests for tenant enforcement, device installation lifecycle, notification preferences, outbox creation, push fan-out, retry/invalid-token behavior, blocks, reports, account deletion, checkout verification, and native commerce capability.
- Existing frontend and backend regression suites remain required.
- Browser E2E validates the website separately from native-device E2E.

### 16.2 Native-device coverage

Test at least:

- An iPhone SE-class device or simulator at iOS 15.
- A current iPhone on the latest supported iOS.
- A low-memory Android device or emulator at API 24/26 with an updated WebView.
- A current Google Pixel-class device.
- A current Samsung Galaxy-class device.

Critical real-device scenarios include fresh install, upgrade, sign-in/out, secure session restore, all permission outcomes, camera/photo/video, foreground and resumed location, online/offline transitions, process termination, WebSocket reconnect, push foreground/background/terminated, every deep-link type, Stripe cancel/success/pending return, media retry, blocking/reporting, deletion initiation, safe-area/keyboard behavior, accessibility font scaling, screen-reader labels, and reduced motion.

### 16.3 Release-candidate evidence

Each candidate records:

- Commit SHA, backend version, app semantic version, and native build numbers.
- Automated test and build results.
- Tested devices and OS versions.
- Screenshots or video of authentication, push from terminated state, offline reading, deep-link routing, media posting, messaging, Stripe verification, report/block, and account deletion.
- Database migration and rollback verification.
- Known limitations and store-policy decisions.

---

## 17. CI/CD and environments

Add GitHub Actions with these boundaries:

### 17.1 Pull request and main verification

- Frontend dependency install, lint/type checks where configured, tests, and production Vite build.
- Backend dependency install, migrations check, targeted and full tests, and production image build.
- Android debug build on Linux.
- iOS simulator build on a macOS runner.
- Secret scanning and checks that native production configuration cannot target a non-Westmoreland tenant.

### 17.2 Signed native builds

- Signing certificates, provisioning data, store API credentials, Firebase configuration, APNs credentials, PostHog token, and Sentry upload token live only in protected CI/store environments.
- Release tags create signed candidate artifacts and source-map/symbol uploads.
- Store upload and promotion require an explicit human approval through protected environments.
- Development, internal testing, pilot, and production use separate analytics/crash environments and non-overlapping push credentials where providers support it.

### 17.3 Existing production backend

The initial native release does not replace the current GCE/Docker Compose deployment topology. Backend changes follow its existing deployment path, with added pre-deploy tests, migration inspection, post-deploy health/API checks, worker verification, and a documented rollback target. Native binaries and website/backend releases remain independently versioned.

---

## 18. Store preparation and rollout

### 18.1 Organization prerequisites

Before store submission:

- Enroll the legal organization representing The Bend in Apple Developer and Google Play Console.
- Complete D-U-N-S and organization/contact verification.
- Register `community.bend.westmoreland` and the required signing identities.
- Configure APNs and a Firebase project for FCM.
- Verify `westmoreland.bend.community` for Universal Links and Android App Links.
- Publish privacy, support, and account-deletion pages.
- Complete Apple privacy details and Google Play Data Safety from the actual implemented behavior.
- Prepare store icon, screenshots, description, age/content rating, moderation explanation, and reviewer credentials.

### 18.2 Release stages

1. Developer builds with test provider projects and non-production analytics.
2. Automated CI candidates.
3. Google Play internal testing and Apple TestFlight internal testing.
4. Invite-only Westmoreland pilot covering multiple devices and real notification conditions.
5. Store review with a working reviewer account and review notes for messaging, moderation, account deletion, permissions, and external checkout.
6. U.S.-only production release using store-managed phased/staged rollout.
7. Expand rollout only after at least 48 hours of stable evidence at each controllable stage.

### 18.3 Launch gates

The public release requires:

- No open severity-0 or severity-1 defect.
- 100% pass for scripted account deletion, report/block, payment verification, authentication restore, and critical deep-link scenarios.
- Successful push receipt and routing for all four categories in foreground, background, and terminated-state tests.
- At least 99.5% crash-free sessions during the pilot.
- At least 98% successful authentication completion among valid pilot attempts.
- At least 95% APNs/FCM provider acceptance for eligible active test installations, excluding intentionally invalidated tokens.
- Completed privacy/store disclosures matching production telemetry and permissions.
- Confirmed rollback targets for backend and remotely disabled native commerce if required.

---

## 19. Implementation sequence

Implementation proceeds in dependency order so each stage is testable:

1. **Foundation:** Capacitor projects, runtime configuration, native shell, Westmoreland lock, platform interfaces, CI build validation.
2. **Sessions and navigation:** Secure native authentication, primary tabs, route filtering, verified deep links, and auth continuation.
3. **Device experiences:** Media, foreground location, sharing, network state, offline cache, drafts, safe-area/keyboard/accessibility polish.
4. **Backend launch requirements:** Device installations, notification outbox and dispatch, preferences, blocking/reporting, account deletion, checkout verification, and native commerce capability.
5. **Observability:** Allowlisted PostHog events, opt-out, Sentry with redaction, release correlation, and operational dashboards.
6. **Release:** Full automation, real-device evidence, organization/store configuration, pilot, review, and staged public rollout.

No stage claims completion from a successful build alone. It must demonstrate its user-visible flow against the real backend or clearly identify provider/account prerequisites that prevent live verification.

---

## 20. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Apple treats paid promotion as an in-app digital purchase | Keep the entry behind a backend capability, document the U.S. storefront approach for review, and disable it on iOS if rejected while evaluating StoreKit. |
| A shared WebView UI is judged as a repackaged website | Deliver native information architecture, secure storage, push, deep links, offline reading, permissions, native share/media, haptics, and platform-correct behavior. |
| Push creates duplicates or privacy leaks | Use a transactional outbox, stable notification IDs, foreground suppression, idempotent workers, category preferences, and privacy-safe payloads. |
| Local cache exposes private data | Cache only allowlisted public content, cap and evict it, clear protected drafts at sign-out, and exclude messages/account/payment data. |
| Shared code accidentally exposes admin routes | Use compile/runtime route allowlists plus backend authorization tests; never rely on hidden navigation alone. |
| Organization enrollment delays launch | Begin D-U-N-S and account verification before native implementation completes. |
| Third-party PostHog Capacitor integration changes | Keep analytics behind `AnalyticsService`; fall back to the supported web SDK inside the shared runtime without changing feature code. |
| Store policy changes before submission | Re-check current Apple and Google policies during release preparation and treat privacy, payments, UGC, and deletion reviews as launch gates. |

---

## 21. Acceptance summary

The design is complete when the implementation can prove that one Westmoreland-only binary per platform provides an intentional native member experience, preserves the web application's multi-tenant/admin responsibilities, securely handles sessions, delivers and routes all required push categories, recovers predictably from network/provider failures, meets UGC and account-deletion obligations, produces privacy-safe analytics and crash evidence, and passes the staged release gates above.

The next step after written-spec approval is a detailed implementation plan. No application implementation is authorized by this document alone.
