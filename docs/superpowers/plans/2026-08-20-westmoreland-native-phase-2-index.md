# Westmoreland native Phase 2 plan bundle

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this bundle task by task.

**Spec:** `docs/superpowers/specs/2026-08-20-westmoreland-native-phase-2-ux-design.md`

## Plans

1. `docs/superpowers/plans/2026-08-20-westmoreland-native-bender.md`
2. `docs/superpowers/plans/2026-08-20-westmoreland-native-routes-events-guidelines.md`
3. `docs/superpowers/plans/2026-08-20-westmoreland-native-auth.md`
4. `docs/superpowers/plans/2026-08-20-westmoreland-native-explore-map.md`
5. `docs/superpowers/plans/2026-08-20-westmoreland-native-partners-media.md`

## Execution order

The plans are independently testable, but shared interfaces create a required order when the full bundle runs in one worktree:

1. Complete Task 0 below and commit the verified approved baseline.
2. Run Bender Task 1 to create safe external URL and canonical public URL helpers.
3. Run Routes Task 1 to create `useNativePresentation`, `NativeBackButton`, and the route policy.
4. Run Bender Tasks 2 through 6. The focused Bender page can then render inside one native frame.
5. Run Routes Tasks 2 through 5. Event detail consumes both shared URL helpers.
6. Run Auth Tasks 1 through 3. Auth consumes native presentation and Back controls.
7. Run the Explore and Map plan.
8. Run the Partners and media plan.
9. Run the full test and build gate, then produce one exact current-source Android APK and iOS simulator app. Complete every platform checklist from the five plans against those packages.

## Task 0: Establish a verified baseline

The branch contains approved uncommitted Bender, navigation, status-bar, Explore, Partners, Guidelines, geolocation, backend search, and test changes from Phase 1. Phase 2 must not mix new work with that unrecorded source state.

- [ ] **Step 1: Inventory the current worktree and exclusions**

```bash
git status --short
git diff --check
git diff --stat
git diff --cached --name-only
git diff -- the-bend-frontend/ios/App/CapApp-SPM/Package.swift
```

Confirm the Swift package change only registers the already installed Capacitor Geolocation package. Never stage `.superpowers/audits/` or `the-bend-frontend/ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/`. Never use `git add .`, `git add -A`, or a directory-wide add.

- [ ] **Step 2: Verify the approved baseline before staging it**

```bash
cd the-bend-frontend
npm run test:run
npx tsc --noEmit
npm run lint
npm run build
npm run build:native

cd ../the-bend-backend
uv run --frozen pytest -q
```

If a check fails, reproduce and repair that approved baseline behavior with `superpowers:systematic-debugging` and `superpowers:test-driven-development` before continuing. Do not weaken or delete a failing test to reach the commit.

- [ ] **Step 3: Stage the exact verified Phase 1 source set**

```bash
cd "$(git rev-parse --show-toplevel)"
git add -- \
  the-bend-backend/app/api/v1/bender.py \
  the-bend-backend/app/services/bender_service.py \
  the-bend-backend/tests/test_user_block_discovery.py \
  the-bend-frontend/capacitor.config.ts \
  the-bend-frontend/ios/App/CapApp-SPM/Package.swift \
  the-bend-frontend/src/components/layout/NativeAppShell.test.tsx \
  the-bend-frontend/src/components/layout/NativeAppShell.tsx \
  the-bend-frontend/src/components/layout/NativeBottomNav.test.tsx \
  the-bend-frontend/src/components/layout/NativeBottomNav.tsx \
  the-bend-frontend/src/components/layout/PageLayout.tsx \
  the-bend-frontend/src/components/native/ui/NativeBenderCard.test.tsx \
  the-bend-frontend/src/components/native/ui/NativeBenderCard.tsx \
  the-bend-frontend/src/components/native/ui/NativeComponents.test.tsx \
  the-bend-frontend/src/components/native/ui/NativeDiscoveryCard.tsx \
  the-bend-frontend/src/components/native/ui/NativePageHeader.tsx \
  the-bend-frontend/src/components/native/ui/NativePartnerCarousel.test.tsx \
  the-bend-frontend/src/components/native/ui/NativePartnerCarousel.tsx \
  the-bend-frontend/src/components/native/ui/NativeResultGroup.tsx \
  the-bend-frontend/src/components/native/ui/NativeUrgentCard.tsx \
  the-bend-frontend/src/hooks/useBenderFeed.test.tsx \
  the-bend-frontend/src/hooks/useBenderFeed.ts \
  the-bend-frontend/src/hooks/useNativeExplore.hydration.capacity.integration.test.tsx \
  the-bend-frontend/src/hooks/useNativeExplore.near.integration.test.tsx \
  the-bend-frontend/src/hooks/useNativeExplore.network.integration.test.tsx \
  the-bend-frontend/src/hooks/useNativeExplore.privacy.integration.test.tsx \
  the-bend-frontend/src/hooks/useNativeExplore.test.tsx \
  the-bend-frontend/src/hooks/useNativeExplore.ts \
  the-bend-frontend/src/hooks/useNativeHome.test.tsx \
  the-bend-frontend/src/hooks/useNativeHome.ts \
  the-bend-frontend/src/native/discovery/adapters.test.ts \
  the-bend-frontend/src/native/discovery/adapters.ts \
  the-bend-frontend/src/native/discovery/benderPresentation.ts \
  the-bend-frontend/src/native/discovery/queries.test.ts \
  the-bend-frontend/src/native/discovery/queries.ts \
  the-bend-frontend/src/native/discovery/types.ts \
  the-bend-frontend/src/pages/BenderPage.native.test.tsx \
  the-bend-frontend/src/pages/BenderPage.tsx \
  the-bend-frontend/src/pages/GuidelinesViewPage.native.test.tsx \
  the-bend-frontend/src/pages/GuidelinesViewPage.tsx \
  the-bend-frontend/src/pages/native/NativeExplorePage.test.tsx \
  the-bend-frontend/src/pages/native/NativeExplorePage.tsx \
  the-bend-frontend/src/pages/native/NativeExplorePermission.integration.test.tsx \
  the-bend-frontend/src/pages/native/NativeHomePage.test.tsx \
  the-bend-frontend/src/pages/native/NativeHomePage.tsx \
  the-bend-frontend/src/platform/NativeStatusBarConfig.test.ts \
  the-bend-frontend/src/routes/NativeRoutes.test.tsx \
  the-bend-frontend/src/routes/NativeRoutes.tsx \
  the-bend-frontend/src/services/benderApi.ts \
  the-bend-frontend/src/styles/native.css
git diff --cached --name-only
git diff --cached --check
```

Compare the staged-name output with the command above. It must contain no audit evidence, credentials, signing material, generated native assets, or SwiftPM workspace metadata.

- [ ] **Step 4: Commit the verified baseline and prove tracked cleanliness**

```bash
git commit -m "feat(native): integrate approved Westmoreland changes"
git diff --exit-code
git diff --cached --exit-code
git status --short --untracked-files=no
```

Expected: the three final commands produce no output. Local untracked audit evidence and generated SwiftPM workspace metadata may remain, but they cannot enter later commits.

## Staging rule for every Phase 2 task

Every task below names exact paths to stage. After each `git add -- ...`, inspect `git diff --cached --name-only` and run `git diff --cached --check` before committing. Stop if the staged set differs from the task's Files list. Because Task 0 establishes a clean tracked baseline, do not use interactive hunk staging to compensate for unrelated modifications. Investigate any unexpected modification before continuing.

## Full verification and package gate

After every plan is complete:

```bash
git diff --exit-code
git diff --cached --exit-code
git status --short --untracked-files=no
PHASE2_WORKTREE="$(git rev-parse --show-toplevel)"
PHASE2_SOURCE_COMMIT="$(git rev-parse HEAD)"
PHASE2_ANDROID_SERIAL="emulator-5554"
PHASE2_ANDROID_AVD="Bend_Westmoreland_API_36"
PHASE2_APK="$PHASE2_WORKTREE/the-bend-frontend/android/app/build/outputs/apk/debug/app-debug.apk"
PHASE2_JAVA_HOME="/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home"
PHASE2_ANDROID_SDK="/Users/kapil/Library/Android/sdk"
PHASE2_IOS_UDID="C824154C-356B-4B2C-BDF1-2DC8F71BDB23"
PHASE2_IOS_DERIVED="/tmp/bend-native-phase2-$PHASE2_SOURCE_COMMIT"
PHASE2_IOS_APP="$PHASE2_IOS_DERIVED/Build/Products/Debug-iphonesimulator/App.app"

cd "$PHASE2_WORKTREE/the-bend-frontend"
npm run test:run
npx tsc --noEmit
npm run lint
npm run build
npm run build:native
npx cap copy android
npx cap copy ios

cd "$PHASE2_WORKTREE/the-bend-backend"
uv run --frozen pytest -q

cd "$PHASE2_WORKTREE/the-bend-frontend/android"
test -x "$PHASE2_JAVA_HOME/bin/java"
test -d "$PHASE2_ANDROID_SDK"
env \
  JAVA_HOME="$PHASE2_JAVA_HOME" \
  PATH="$PHASE2_JAVA_HOME/bin:$PATH" \
  ANDROID_HOME="$PHASE2_ANDROID_SDK" \
  ANDROID_SDK_ROOT="$PHASE2_ANDROID_SDK" \
  ./gradlew assembleDebug
test -f "$PHASE2_APK"
shasum -a 256 "$PHASE2_APK"

cd "$PHASE2_WORKTREE/the-bend-frontend"
xcodebuild \
  -project ios/App/App.xcodeproj \
  -scheme App \
  -sdk iphonesimulator \
  -destination "platform=iOS Simulator,id=$PHASE2_IOS_UDID" \
  -configuration Debug \
  -derivedDataPath "$PHASE2_IOS_DERIVED" \
  CODE_SIGNING_ALLOWED=NO \
  build
test -d "$PHASE2_IOS_APP"
(
  cd "$PHASE2_IOS_APP"
  find . -type f -exec shasum -a 256 {} + | LC_ALL=C sort
) > "$PHASE2_IOS_APP.sha256"
shasum -a 256 "$PHASE2_IOS_APP.sha256"

if ! adb -s "$PHASE2_ANDROID_SERIAL" get-state >/dev/null 2>&1; then
  "$HOME/Library/Android/sdk/emulator/emulator" \
    -avd "$PHASE2_ANDROID_AVD" \
    -port 5554 \
    -no-snapshot-save \
    > "/tmp/bend-native-phase2-android-$PHASE2_SOURCE_COMMIT.log" 2>&1 &
fi
adb -s "$PHASE2_ANDROID_SERIAL" wait-for-device
adb -s "$PHASE2_ANDROID_SERIAL" shell \
  'while [ "$(getprop sys.boot_completed)" != "1" ]; do sleep 1; done'
adb -s "$PHASE2_ANDROID_SERIAL" install -r -t "$PHASE2_APK"
adb -s "$PHASE2_ANDROID_SERIAL" shell am force-stop community.bend.westmoreland
adb -s "$PHASE2_ANDROID_SERIAL" shell monkey -p community.bend.westmoreland 1

xcrun simctl boot "$PHASE2_IOS_UDID" 2>/dev/null || true
xcrun simctl bootstatus "$PHASE2_IOS_UDID" -b
xcrun simctl install "$PHASE2_IOS_UDID" "$PHASE2_IOS_APP"
xcrun simctl launch "$PHASE2_IOS_UDID" community.bend.westmoreland

cd "$PHASE2_WORKTREE"
git diff --check
git diff --exit-code
git diff --cached --exit-code
git status --short --untracked-files=no
test "$(git rev-parse HEAD)" = "$PHASE2_SOURCE_COMMIT"
```

Expected results:

- Frontend tests, type checking, lint, web build, and native build pass.
- Backend tests pass without changing `uv.lock`.
- Capacitor copies contain the current native configuration and current frontend bundle.
- Gradle produces and installs the exact debug APK at `the-bend-frontend/android/app/build/outputs/apk/debug/app-debug.apk`.
- Xcode produces and installs the exact simulator app at `/tmp/bend-native-phase2-{source-commit}/Build/Products/Debug-iphonesimulator/App.app`.
- The tracked source tree is clean before and after package generation.
- No credential, signing file, or unrelated SwiftPM change is staged.

Save the printed APK SHA-256 and iOS bundle-manifest SHA-256 with `PHASE2_SOURCE_COMMIT`, exact artifact paths, simulator identifiers, and evidence file names. Run every platform checklist from the five subplans against these installed packages. Do not rebuild between workstream checklists. Complete TalkBack and VoiceOver checks before claiming Phase 2 complete.
