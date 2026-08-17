# Task 1 Report: Tested Capacitor Runtime Foundation

## Root decisions

- Added Capacitor 8 core and requested native plugins, using `--legacy-peer-deps` because the existing Vite PWA dependency does not declare a Vite 8 peer.
- Kept `RuntimeKind` and `RuntimeConfig` local to `src/platform/runtimeConfig.ts` as the minimal Task 1 interfaces.
- Native runtime defaults to `https://api.bend.community/api/v1`; web runtime defaults to `http://localhost:8000/api/v1`. Explicit `VITE_API_URL` remains authoritative.
- Native builds use relative Vite asset URLs (`base: './'`) while web builds retain root-relative URLs.
- Scoped lint to source/config files so generated iOS and Android trees do not become lint inputs.

## TDD evidence

RED:

```text
$ npm run test:run -- src/platform/runtimeConfig.test.ts
npm error Missing script: "test:run"
```

GREEN:

```text
$ npm run test:run -- src/platform/runtimeConfig.test.ts
Test Files  1 passed (1)
Tests       3 passed (3)
```

## Verification

- `npx tsc --noEmit -p tsconfig.node.json` — passed.
- `npm run test:run` — passed, 1 file / 3 tests.
- `npm run lint` — passed.
- `npm run build` — passed; existing dynamic-import and chunk-size warnings remain.
- `npm run cap:sync` — passed; native build and iOS/Android synchronization completed.
- Generated iOS deployment target is 15.0 and Android `minSdkVersion` is 24.

## Files changed

- Updated frontend package scripts and Capacitor/test dependencies.
- Updated Vite config and added Vitest config/setup.
- Added runtime config and focused runtime tests.
- Added typed Capacitor config.
- Generated `ios/` and `android/` projects and synchronized web assets/plugins.

## Self-review and concerns

- `bundledWebRuntime: false` is accepted by the installed Capacitor 8 CLI/types and synchronization succeeds.
- The full test command initially discovered an existing non-Vitest `tests/task0-initial-state.test.mjs`; Vitest is now scoped to `src/**/*.{test,spec}.{ts,tsx}` so that legacy script is not treated as a Vitest suite.
- `npm install` reports existing dependency vulnerabilities; no audit remediation was attempted because it is outside this task.
