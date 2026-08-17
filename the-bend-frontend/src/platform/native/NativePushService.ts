import { PushNotifications, type PermissionStatus } from '@capacitor/push-notifications'
import { SecureStorage } from '@aparajita/capacitor-secure-storage'
import type { AuthSnapshot, DeepLinkTarget, PushCategory, PushForegroundEvent, PushService, RemoveListener } from '../contracts'
import { notificationApi } from '@/services/notificationApi'

const INSTALLATION_KEY = 'bend.push.installation-id'
const REVOCATION_KEY = 'bend.push.revocation-secret'

type PushPermission = PermissionStatus['receive']
type PushApi = typeof PushNotifications
type SecureStore = { get(key: string): Promise<string | null>; set(key: string, value: string): Promise<void>; remove(key: string): Promise<void> }

export interface NativePushDependencies {
  platform: 'ios' | 'android'
  appVersion: string
  buildNumber: string
  locale: string
  push?: PushApi
  api?: typeof notificationApi
  secureStorage?: SecureStore
  createInstallationId?: () => string
  createRevocationSecret?: () => string
}

const secureStore: SecureStore = {
  async get(key) { const value = await SecureStorage.get(key, false, false); return value == null ? null : String(value) },
  async set(key, value) { await SecureStorage.set(key, value, false, false) },
  async remove(key) { await SecureStorage.remove(key, false) },
}

const randomValue = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

const PUSH_TARGETS: Record<PushCategory, (id: string) => DeepLinkTarget> = {
  message_received: (id) => ({ path: `/messages/${encodeURIComponent(id)}`, requiresAuth: true }),
  listing_interest_received: (id) => ({ path: `/listing/${encodeURIComponent(id)}`, requiresAuth: true }),
  registration_decision: () => ({ path: '/notifications', requiresAuth: true }),
  urgent_listing_published: (id) => ({ path: `/listing/${encodeURIComponent(id)}`, requiresAuth: false }),
}

function targetFromData(data: Record<string, unknown> | undefined): DeepLinkTarget | null {
  const type = data?.target_type
  const id = data?.target_id
  if (typeof type !== 'string' || typeof id !== 'string') return null
  const category = type === 'message' ? 'message_received' : type
  const target = PUSH_TARGETS[category as PushCategory]
  return target ? target(id) : null
}

export class NativePushService implements PushService {
  private readonly deps: Required<Pick<NativePushDependencies, 'platform' | 'appVersion' | 'buildNumber' | 'locale'>> & Omit<NativePushDependencies, 'platform' | 'appVersion' | 'buildNumber' | 'locale'>
  private permission: PushPermission = 'prompt'
  private registrationListener: RemoveListener | null = null
  private currentToken: string | null = null
  private activeConversationId: string | null = null

  constructor(deps: NativePushDependencies) {
    this.deps = { ...deps, push: deps.push ?? PushNotifications, api: deps.api ?? notificationApi, secureStorage: deps.secureStorage ?? secureStore, createInstallationId: deps.createInstallationId ?? randomValue, createRevocationSecret: deps.createRevocationSecret ?? randomValue }
  }

  async explainAndRequest(): Promise<'granted' | 'denied' | 'prompt'> {
    const push = this.deps.push!
    const checked = await push.checkPermissions()
    this.permission = checked.receive
    if (checked.receive === 'prompt') this.permission = (await push.requestPermissions()).receive
    return this.permission === 'granted' ? 'granted' : this.permission === 'denied' ? 'denied' : 'prompt'
  }

  async register(session: AuthSnapshot): Promise<void> {
    if (!session.isAuthenticated || session.isLoading) return
    if (this.permission !== 'granted') {
      const status = await this.explainAndRequest()
      if (status !== 'granted') return
    }
    const store = this.deps.secureStorage!
    let installationId = await store.get(INSTALLATION_KEY)
    if (!installationId) { installationId = this.deps.createInstallationId!(); await store.set(INSTALLATION_KEY, installationId) }
    if (!await store.get(REVOCATION_KEY)) await store.set(REVOCATION_KEY, this.deps.createRevocationSecret!())
    const push = this.deps.push!
    this.registrationListener?.remove()
    this.registrationListener = await push.addListener('registration', ({ value }: { value: string }) => { this.currentToken = value; void this.sendRegistration(installationId!, value) })
    await push.register()
  }

  private async sendRegistration(installationId: string, token: string) {
    const response = await this.deps.api!.registerInstallation(installationId, { platform: this.deps.platform, provider_token: token, token, app_version: this.deps.appVersion, build_number: this.deps.buildNumber, locale: this.deps.locale } as Parameters<typeof notificationApi.registerInstallation>[1])
    const replacement = (response as { data?: { revocation_secret?: string } }).data?.revocation_secret
    if (replacement) await this.deps.secureStorage!.set(REVOCATION_KEY, replacement)
  }

  async unregister(mode: 'online' | 'offline'): Promise<void> {
    const installationId = await this.deps.secureStorage!.get(INSTALLATION_KEY)
    if (!installationId) return
    this.registrationListener?.remove(); this.registrationListener = null
    try { await this.deps.push!.unregister() } catch { /* provider token deletion is best effort */ }
    if (mode === 'online') {
      await this.deps.api!.disableInstallation(installationId)
      await this.deps.secureStorage!.remove(REVOCATION_KEY)
    }
  }

  async addTapListener(handler: (target: DeepLinkTarget) => void): Promise<RemoveListener> {
    const listener = await this.deps.push!.addListener('pushNotificationActionPerformed', (event: { notification?: { data?: Record<string, unknown> } }) => {
      const target = targetFromData(event.notification?.data)
      if (target) handler(target)
    })
    return { remove: async () => { await listener.remove() } }
  }

  setActiveConversation(id: string | null) { this.activeConversationId = id }

  async addForegroundListener(handler: (event: PushForegroundEvent) => void): Promise<RemoveListener> {
    const listener = await this.deps.push!.addListener('pushNotificationReceived', (event: { data?: Record<string, unknown> }) => {
      const data = event.data ?? {}
      const target = targetFromData(data)
      const targetId = typeof data.target_id === 'string' ? data.target_id : null
      const suppressed = data.target_type === 'message_received' || data.target_type === 'message'
        ? targetId !== null && targetId === this.activeConversationId
        : false
      handler({ target, suppressed, data })
    })
    return { remove: async () => { await listener.remove() } }
  }

  async openSystemSettings(): Promise<void> {
    if (typeof window === 'undefined') return
    const packageName = 'community.bend.westmoreland'
    window.location.href = this.deps.platform === 'ios'
      ? 'app-settings:'
      : `intent:#Intent;action=android.settings.APP_NOTIFICATION_SETTINGS;S.android.provider.extra.APP_PACKAGE=${packageName};end`
  }
}

export { INSTALLATION_KEY, REVOCATION_KEY, PUSH_TARGETS, targetFromData }
