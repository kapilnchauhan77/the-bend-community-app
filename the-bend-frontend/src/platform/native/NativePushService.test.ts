import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthSnapshot } from '../contracts'
import { NativePushService, targetFromData, type NativePushDependencies } from './NativePushService'

const secure = new Map<string, string>()
const listeners: Record<string, (event: unknown) => void> = {}
type MockPush = { checkPermissions: typeof push.checkPermissions; requestPermissions: typeof push.requestPermissions; register: typeof push.register; addListener: typeof push.addListener; unregister: typeof push.unregister }
const push = {
  checkPermissions: vi.fn(async () => ({ receive: 'prompt' as const })),
  requestPermissions: vi.fn(async () => ({ receive: 'granted' as const })),
  register: vi.fn(async () => undefined),
  addListener: vi.fn(async (name: string, handler: (event: unknown) => void) => {
    listeners[name] = handler
    return { remove: async () => { delete listeners[name] } }
  }),
  unregister: vi.fn(async () => undefined),
}
const api = {
  registerInstallation: vi.fn(async () => ({ data: { revocation_secret: 'replacement-secret' } })),
  disableInstallation: vi.fn(async () => undefined),
  revokeInstallation: vi.fn(async () => undefined),
}

const deps: NativePushDependencies = {
  platform: 'ios',
  appVersion: '1.0.0',
  buildNumber: '1',
  locale: 'en-US',
  push: push as unknown as MockPush,
  api: api as unknown as NativePushDependencies['api'],
  secureStorage: {
    get: async (key) => secure.get(key) ?? null,
    set: async (key, value) => { secure.set(key, value) },
    remove: async (key) => { secure.delete(key) },
  },
  createInstallationId: () => 'stable-installation-id',
  createRevocationSecret: () => 'initial-secret',
}

const authenticatedMember: AuthSnapshot = { user: { id: 'member-1', name: 'Member', email: 'member@example.test', role: 'individual' }, shop: null, isAuthenticated: true, isLoading: false }

describe('NativePushService', () => {
  beforeEach(() => {
    secure.clear()
    vi.clearAllMocks()
    push.checkPermissions.mockResolvedValue({ receive: 'granted' })
    push.requestPermissions.mockResolvedValue({ receive: 'granted' })
    Object.keys(listeners).forEach((key) => delete listeners[key])
  })

  it('does not request permission during construction', () => {
    new NativePushService(deps)
    expect(push.requestPermissions).not.toHaveBeenCalled()
  })

  it('does not request permission from authenticated lifecycle registration', async () => {
    push.checkPermissions.mockResolvedValue({ receive: 'prompt' })
    const service = new NativePushService(deps)
    await service.register(authenticatedMember)
    expect(push.requestPermissions).not.toHaveBeenCalled()
    expect(push.register).not.toHaveBeenCalled()
  })

  it('registers a rotated token against the stable installation id', async () => {
    const service = new NativePushService(deps)
    await service.explainAndRequest()
    await service.register(authenticatedMember)
    const registrationHandler = push.addListener.mock.calls.find(([name]) => name === 'registration')?.[1] as ((event: { value: string }) => void)
    registrationHandler({ value: 'new-token' })
    await Promise.resolve()
    expect(api.registerInstallation).toHaveBeenCalledWith('stable-installation-id', expect.objectContaining({ provider_token: 'new-token', platform: 'ios' }))
  })

  it('maps a notification tap through the same deep-link allowlist', async () => {
    const service = new NativePushService(deps)
    const handler = vi.fn()
    expect(targetFromData({ target_type: 'message_received', target_id: 'thread-id' })).toEqual({ path: '/messages/thread-id', requiresAuth: true })
    await service.addTapListener(handler)
    const tapHandler = push.addListener.mock.calls.find(([name]) => name === 'pushNotificationActionPerformed')?.[1] as ((event: unknown) => void)
    tapHandler({ notification: { data: { target_type: 'message_received', target_id: 'thread-id' } } })
    expect(handler).toHaveBeenCalledWith({ path: '/messages/thread-id', requiresAuth: true })
  })

  it('suppresses only an active conversation while still emitting an unread refresh event', async () => {
    const service = new NativePushService(deps)
    service.setActiveConversation('thread-id')
    const handler = vi.fn()
    await service.addForegroundListener(handler)
    const foregroundHandler = push.addListener.mock.calls.find(([name]) => name === 'pushNotificationReceived')?.[1] as ((event: unknown) => void)
    foregroundHandler({ data: { target_type: 'message_received', target_id: 'thread-id' } })
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ suppressed: true, target: { path: '/messages/thread-id', requiresAuth: true } }))
    foregroundHandler({ data: { target_type: 'message_received', target_id: 'other-thread' } })
    expect(handler).toHaveBeenLastCalledWith(expect.objectContaining({ suppressed: false }))
  })

  it('reconciles an offline unregister secret before a later registration', async () => {
    const service = new NativePushService(deps)
    await service.register(authenticatedMember)
    await service.unregister('offline')
    api.revokeInstallation.mockResolvedValue(undefined)
    await service.register(authenticatedMember)
    expect(api.revokeInstallation).toHaveBeenCalledWith('stable-installation-id', expect.any(String))
  })

  it('removes the native tap listener without leaving a callback registered', async () => {
    const service = new NativePushService(deps)
    const removal = await service.addTapListener(vi.fn())
    await removal.remove()
    expect(listeners.pushNotificationActionPerformed).toBeUndefined()
  })
})
