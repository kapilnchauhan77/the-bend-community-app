import type { User, Shop } from '../types'

export type RuntimeKind = 'web' | 'ios' | 'android'

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

export interface StoredSession { refreshToken: string; }

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

export interface DeepLinkTarget { path: string; requiresAuth: boolean; }
export interface PushRegistration { installationId: string; platform: 'ios' | 'android'; token: string; appVersion: string; buildNumber: string; locale: string; }
export type PushCategory = 'message_received' | 'listing_interest_received' | 'registration_decision' | 'urgent_listing_published';
export interface CachedContent { key: string; kind: 'listing' | 'business' | 'event' | 'bender'; entityId: string; cachedAt: string; payload: unknown; imagePath: string | null; sizeBytes: number; }
export interface RemoveListener { remove(): Promise<void>; }
export interface PushForegroundEvent { target: DeepLinkTarget | null; suppressed: boolean; data: Record<string, unknown>; }
export interface PushService { explainAndRequest(): Promise<'granted' | 'denied' | 'prompt'>; register(session: AuthSnapshot): Promise<void>; unregister(mode: 'online' | 'offline'): Promise<void>; addTapListener(handler: (target: DeepLinkTarget) => void): Promise<RemoveListener>; openSystemSettings?(): Promise<void>; setActiveConversation?(id: string | null): void; addForegroundListener?(handler: (event: PushForegroundEvent) => void): Promise<RemoveListener>; }
export interface DeepLinkService { parse(url: string): DeepLinkTarget | null; addListener(handler: (target: DeepLinkTarget) => void): Promise<RemoveListener>; }
export interface BrowserService { open(url: string): Promise<void>; close(): Promise<void>; }
export interface MediaSelection { blob: Blob; localUri: string; mimeType: string; filename: string; }
export interface MediaService { pickPhoto(): Promise<MediaSelection | null>; capturePhoto(): Promise<MediaSelection | null>; captureVideo(): Promise<MediaSelection | null>; stopVideoCapture?(): void; }
export interface LocationService { getForegroundPosition(): Promise<{ latitude: number; longitude: number; accuracy: number }>; }
export interface ShareService { share(input: { title: string; text: string; url: string }): Promise<'shared' | 'cancelled'>; }
export interface NetworkService { getStatus(): Promise<'online' | 'offline'>; addListener(handler: (status: 'online' | 'offline') => void): Promise<RemoveListener>; }
export interface ContentCache { put(content: CachedContent): Promise<void>; get(key: string): Promise<CachedContent | null>; remove(key: string): Promise<void>; clear(): Promise<void>; stats(): Promise<{ items: number; bytes: number }>; }
export interface AnalyticsService { capture(event: string, properties?: Record<string, unknown>): void; identify(userId: string): void; reset(): void; setOptOut(value: boolean): Promise<void>; isOptedOut(): Promise<boolean>; }
export interface CrashReporter { captureException(error: unknown, context?: Record<string, unknown>): void; }
export interface PlatformServices { sessionStore: SessionStore; push: PushService; deepLinks: DeepLinkService; browser: BrowserService; media: MediaService; location: LocationService; share: ShareService; network: NetworkService; cache: ContentCache; analytics: AnalyticsService; crashes: CrashReporter; }
