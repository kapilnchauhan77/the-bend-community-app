import type { AuthSnapshot, ContentCache, DeepLinkService, NetworkService, PlatformServices, PushService, ShareService } from '../contracts'
import { WebSessionStore } from './WebSessionStore'

const removed = { remove: async () => undefined }

class WebPushService implements PushService {
  async explainAndRequest() { return typeof Notification === 'undefined' ? 'denied' : Notification.permission === 'default' ? 'prompt' : Notification.permission }
  async register(_session: AuthSnapshot) { void _session; return undefined }
  async unregister(_mode: 'online' | 'offline') { void _mode; return undefined }
  async addTapListener(_handler: (target: import('../contracts').DeepLinkTarget) => void) { void _handler; return removed }
  async openSystemSettings() { return undefined }
  setActiveConversation(_id: string | null) { void _id }
  async addForegroundListener(_handler: (event: import('../contracts').PushForegroundEvent) => void) { void _handler; return removed }
}

class WebDeepLinkService implements DeepLinkService {
  parse(url: string) {
    try { const parsed = new URL(url, window.location.origin); return { path: `${parsed.pathname}${parsed.search}${parsed.hash}`, requiresAuth: parsed.pathname.startsWith('/app') } } catch { return null }
  }
  async addListener(_handler: (target: import('../contracts').DeepLinkTarget) => void) { void _handler; return removed }
}

class WebBrowserService {
  private handle: Window | null = null
  async open(url: string) { this.handle = window.open(url, '_blank', 'noopener,noreferrer') }
  async close() { this.handle?.close(); this.handle = null }
}

class WebMediaService {
  async pickPhoto() { return null }
  async capturePhoto() { return null }
  async captureVideo() { return null }
}

class WebLocationService { async getForegroundPosition() { return new Promise<GeolocationCoordinates>((resolve, reject) => navigator.geolocation.getCurrentPosition((position) => resolve(position.coords), reject)).then(({ latitude, longitude, accuracy }) => ({ latitude, longitude, accuracy })) } }
class WebShareService implements ShareService { async share(input: { title: string; text: string; url: string }) { if (!navigator.share) return 'cancelled'; try { await navigator.share(input); return 'shared' } catch { return 'cancelled' } } }
class WebNetworkService implements NetworkService { async getStatus() { return navigator.onLine ? 'online' : 'offline' } async addListener(handler: (status: 'online' | 'offline') => void) { const on = () => handler('online'); const off = () => handler('offline'); window.addEventListener('online', on); window.addEventListener('offline', off); return { remove: async () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) } } } }
class WebContentCache implements ContentCache { private values = new Map<string, import('../contracts').CachedContent>(); async put(c: import('../contracts').CachedContent) { this.values.set(c.key, c) } async get(k: string) { return this.values.get(k) ?? null } async remove(k: string) { this.values.delete(k) } async clear() { this.values.clear() } async stats() { return [...this.values.values()].reduce((s, c) => ({ items: s.items + 1, bytes: s.bytes + c.sizeBytes }), { items: 0, bytes: 0 }) } }
class WebAnalytics { private optedOut = false; capture() {} identify() {} reset() {} async setOptOut(v: boolean) { this.optedOut = v } async isOptedOut() { return this.optedOut } }
class WebCrashes { captureException(error: unknown, context?: Record<string, unknown>) { console.error('Unhandled application error', error, context) } }

export function createWebPlatformServices(): PlatformServices {
  return { sessionStore: new WebSessionStore(), push: new WebPushService(), deepLinks: new WebDeepLinkService(), browser: new WebBrowserService(), media: new WebMediaService(), location: new WebLocationService(), share: new WebShareService(), network: new WebNetworkService(), cache: new WebContentCache(), analytics: new WebAnalytics(), crashes: new WebCrashes() }
}
