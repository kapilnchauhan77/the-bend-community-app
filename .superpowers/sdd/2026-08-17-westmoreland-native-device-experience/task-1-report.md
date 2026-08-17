# Task 1 implementation report

## Files changed

- `the-bend-frontend/src/platform/native/NativePushService.ts`
- `the-bend-frontend/src/platform/native/NativePushService.test.ts`
- `the-bend-frontend/src/platform/native/NativePlatformServices.ts`
- `the-bend-frontend/src/services/notificationApi.ts`
- `the-bend-frontend/src/pages/SettingsPage.tsx`
- `the-bend-frontend/src/pages/NotificationsPage.tsx`
- `the-bend-frontend/ios/App/App/AppDelegate.swift`
- `the-bend-frontend/android/app/src/main/AndroidManifest.xml`

Existing contracts and browser/PWA push behavior were preserved; no provider credentials or generated native artifacts were staged.

## TDD evidence

The new focused suite was run before implementation and failed during module resolution because `NativePushService` did not exist. After implementation, the suite passed all three tests covering construction-time permission behavior, stable-ID token rotation, and allowlisted notification tap routing.

## Passing checks

- `npm run test:run -- src/platform/native/NativePushService.test.ts src/pages/SettingsPage.test.tsx` — 3 tests passed (SettingsPage test file is not present in this checkout).
- `npm run lint` — passed.
- `npm run build` — passed; existing chunk-size and missing optional Cloudflare analytics environment warnings remain.
- `npm run cap:sync` — passed for Android, iOS, and web.
- `the-bend-backend/uv.lock` SHA remains `c59e3d361f8f175c3d661018029aeb9df00761b74d70f79d6d1e3971fcc59082`.

## Commit

`866a91f3975a2b7de34c7479988f1f2144475981` — `feat(native): register and route native notifications`

## Self-review

Native registration is permission-gated, uses secure installation/revocation storage, rotates provider tokens against one installation ID, persists replacement revocation secrets, and maps only the four approved push categories to routes. Server-owned preferences are loaded and updated from Settings. Native notification permission metadata is declared for both platforms.

## Concerns

- Full Xcode compilation and physical-iPhone delivery could not be run in this environment.
- Settings now provides platform-correct `app-settings:` (iOS) and Android notification-settings intent shortcuts when permission is denied.
- Foreground push events now map through the same allowlist, suppress only when the active conversation matches the message target, and invoke an unread-count refresh callback for every foreground event. Deterministic tests cover both matching and non-matching conversations.

Follow-up limitation: full Xcode/physical-iPhone validation remains unavailable in this environment; the iOS delegate preserves badge/sound presentation while the JS foreground handler provides the active-conversation suppression decision.
