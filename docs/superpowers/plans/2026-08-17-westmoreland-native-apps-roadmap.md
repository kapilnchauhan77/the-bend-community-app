# The Bend: Westmoreland Native Apps Implementation Roadmap

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver U.S.-only iOS and Android applications named **The Bend: Westmoreland** from the existing React/Vite member application, with secure native sessions, Westmoreland-only routing, push notifications, native device services, store-required safety/deletion flows, privacy-safe analytics, and staged release automation.

**Architecture:** Capacitor 8 packages the shared React/Vite member application while typed platform-service adapters isolate browser and native behavior. The existing FastAPI/PostgreSQL/Redis/Celery backend remains authoritative and gains transactional push delivery, session revocation, moderation/blocking, account deletion, and native checkout verification. Work is split into four executable plans because the approved design spans independently reviewable subsystems.

**Tech Stack:** React 19, TypeScript 5.9, Vite 8, Vitest, React Testing Library, Capacitor 8, iOS 15+, Android API 24+, FastAPI, SQLAlchemy async, Alembic, PostgreSQL 16, Redis 7, Celery, APNs, FCM, Stripe, PostHog, Sentry, GitHub Actions, Fastlane, Maestro.

## Global Constraints

- Native display name is `The Bend: Westmoreland`; bundle/package identifier is `community.bend.westmoreland`.
- Native production builds always use tenant slug `westmoreland`; no route, deep link, environment override, user setting, or backend response may change it.
- The existing website and backend remain multi-tenant; admin and super-admin remain website-only.
- Supported platforms are iOS 15+ and Android API 24+; Capacitor major version is 8.
- Guests may browse public content; member actions preserve their destination through authentication.
- Native access tokens exist in memory only; refresh credentials use iOS Keychain or Android Keystore.
- Push categories are exactly `message_received`, `listing_interest_received`, `registration_decision`, and `urgent_listing_published`.
- Recently viewed public content is read-only offline; messages, payments, account changes, and content mutations require a connection.
- Native Stripe Checkout opens in the secure system browser and success is never inferred from URL parameters.
- Analytics and crash reports must never contain message bodies, uploads, contact details, precise coordinates, tokens, push tokens, checkout IDs, or authenticated request/response bodies.
- Session replay is disabled for version one.
- Store territory is United States only.
- Admin/super-admin routes and components are never included in the native route table.
- Store submission is blocked until reporting, blocking, public support, privacy disclosures, and full account deletion work end-to-end.
- Preserve unrelated working-tree changes, including the pre-existing `the-bend-backend/uv.lock` modification and generated browser artifacts.

---

## Scope decomposition and execution order

The approved design contains four large, independently reviewable systems. Execute these plans in order:

1. [Foundation, Secure Sessions, and Routing](./2026-08-17-westmoreland-native-foundation.md)
2. [Backend Launch Services](./2026-08-17-westmoreland-native-backend-services.md)
3. [Native Device Experience and Observability](./2026-08-17-westmoreland-native-device-experience.md)
4. [CI/CD, QA, and Store Release](./2026-08-17-westmoreland-native-release.md)

Do not start a later plan until the prior plan's exit gate passes. Each plan ends with a working increment and a commit boundary.

## Shared TypeScript contracts

Create these contracts in Plan 1 and use their exact names throughout later plans:

```ts
export type RuntimeKind = 'web' | 'ios' | 'android';

export interface RuntimeConfig {
  kind: RuntimeKind;
  isNative: boolean;
  apiBaseUrl: string;
  wsBaseUrl: string;
  tenantSlug: string;
  appVersion: string;
  buildNumber: string;
  environment: 'development' | 'test' | 'production';
}

export interface StoredSession {
  refreshToken: string;
}

export interface SessionStore {
  load(): Promise<StoredSession | null>;
  save(session: StoredSession): Promise<void>;
  clear(): Promise<void>;
}

export interface AuthSnapshot {
  user: User | null;
  shop: Shop | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface DeepLinkTarget {
  path: string;
  requiresAuth: boolean;
}

export interface PushRegistration {
  installationId: string;
  platform: 'ios' | 'android';
  token: string;
  appVersion: string;
  buildNumber: string;
  locale: string;
}

export type PushCategory =
  | 'message_received'
  | 'listing_interest_received'
  | 'registration_decision'
  | 'urgent_listing_published';

export interface CachedContent {
  key: string;
  kind: 'listing' | 'business' | 'event' | 'bender';
  entityId: string;
  cachedAt: string;
  payload: unknown;
  imagePath: string | null;
  sizeBytes: number;
}

export interface RemoveListener {
  remove(): Promise<void>;
}

export interface PushService {
  explainAndRequest(): Promise<'granted' | 'denied' | 'prompt'>;
  register(session: AuthSnapshot): Promise<void>;
  unregister(mode: 'online' | 'offline'): Promise<void>;
  addTapListener(handler: (target: DeepLinkTarget) => void): Promise<RemoveListener>;
}

export interface DeepLinkService {
  parse(url: string): DeepLinkTarget | null;
  addListener(handler: (target: DeepLinkTarget) => void): Promise<RemoveListener>;
}

export interface BrowserService {
  open(url: string): Promise<void>;
  close(): Promise<void>;
}

export interface MediaSelection {
  blob: Blob;
  localUri: string;
  mimeType: string;
  filename: string;
}

export interface MediaService {
  pickPhoto(): Promise<MediaSelection | null>;
  capturePhoto(): Promise<MediaSelection | null>;
  captureVideo(): Promise<MediaSelection | null>;
}

export interface LocationService {
  getForegroundPosition(): Promise<{ latitude: number; longitude: number; accuracy: number }>;
}

export interface ShareService {
  share(input: { title: string; text: string; url: string }): Promise<'shared' | 'cancelled'>;
}

export interface NetworkService {
  getStatus(): Promise<'online' | 'offline'>;
  addListener(handler: (status: 'online' | 'offline') => void): Promise<RemoveListener>;
}

export interface ContentCache {
  put(content: CachedContent): Promise<void>;
  get(key: string): Promise<CachedContent | null>;
  remove(key: string): Promise<void>;
  clear(): Promise<void>;
  stats(): Promise<{ items: number; bytes: number }>;
}

export interface AnalyticsService {
  capture(event: string, properties?: Record<string, unknown>): void;
  identify(userId: string): void;
  reset(): void;
  setOptOut(value: boolean): Promise<void>;
  isOptedOut(): Promise<boolean>;
}

export interface CrashReporter {
  captureException(error: unknown, context?: Record<string, unknown>): void;
}

export interface PlatformServices {
  sessionStore: SessionStore;
  push: PushService;
  deepLinks: DeepLinkService;
  browser: BrowserService;
  media: MediaService;
  location: LocationService;
  share: ShareService;
  network: NetworkService;
  cache: ContentCache;
  analytics: AnalyticsService;
  crashes: CrashReporter;
}
```

## Shared backend contracts

Use these values across models, schemas, workers, APIs, and mobile adapters:

```python
NativePlatform = Literal["ios", "android"]
PushCategory = Literal[
    "message_received",
    "listing_interest_received",
    "registration_decision",
    "urgent_listing_published",
]
OutboxStatus = Literal["pending", "processing", "delivered", "failed"]
ReportTargetType = Literal["listing", "shop", "event", "bender", "user", "message"]
DeletionStatus = Literal["pending", "processing", "completed", "failed"]
CheckoutKind = Literal["advertising", "event", "connector"]
```

Native API shapes:

```json
{
  "installation_id": "uuid",
  "platform": "ios",
  "token": "provider-token",
  "app_version": "1.0.0",
  "build_number": "1",
  "locale": "en-US"
}
```

```json
{
  "push_enabled": true,
  "message_received": true,
  "listing_interest_received": true,
  "registration_decision": true,
  "urgent_listing_published": true
}
```

```json
{
  "native_commerce_enabled": true,
  "tenant_slug": "westmoreland",
  "support_url": "https://westmoreland.bend.community/support",
  "privacy_url": "https://westmoreland.bend.community/privacy",
  "account_deletion_url": "https://westmoreland.bend.community/delete-account"
}
```

## Cross-plan commit and verification policy

- Follow test-driven development: failing test, confirmed failure, minimal implementation, passing focused test, broader regression, commit.
- Commit one reviewer-sized task at a time with only the files named by that task.
- Never run an Alembic plan check against an implicit `.env` database. For local plan execution, start a disposable PostgreSQL 16 container named `bend-native-test-db-20260817` on port `55432`, then export `DATABASE_URL=postgresql+asyncpg://bend_native:bend_native@127.0.0.1:55432/bend_native_test`; verify the parsed host and database name before every migration command. Stop that named container after the plan gate passes.
- Run `npm run lint`, `npm run test:run`, and `npm run build` for frontend-affecting plans.
- Run `cd the-bend-backend && .venv/bin/pytest -q` plus `alembic upgrade head` against a disposable PostgreSQL database for backend-affecting plans.
- Run `npm run cap:sync`, Android debug assembly, and iOS simulator build for native-affecting plans.
- Never claim real push, universal/app links, Stripe return, signed builds, TestFlight, or Play testing from mocks alone.

Start the disposable migration database with:

```bash
docker run --rm -d --name bend-native-test-db-20260817 -e POSTGRES_USER=bend_native -e POSTGRES_PASSWORD=bend_native -e POSTGRES_DB=bend_native_test -p 127.0.0.1:55432:5432 postgres:16-alpine
export DATABASE_URL=postgresql+asyncpg://bend_native:bend_native@127.0.0.1:55432/bend_native_test
```

After the plan gate, run `docker stop bend-native-test-db-20260817`.

## Program exit gate

The program is complete only when all four plan exit gates pass, the launch thresholds in the approved design are met, production backend and worker health are verified, signed builds are installed from TestFlight and Play internal testing, and the staged U.S.-only release has an evidence pack tied to the exact backend SHA and mobile build numbers.
