import { describe, expect, it, vi } from 'vitest'
import { createTapNavigator } from './usePushNotifications'
import { getPendingDestination, clearPendingDestination } from '@/auth/pendingDestination'

describe('native push tap navigation', () => {
  it('navigates an allowlisted destination, including protected routes', () => {
    const navigate = vi.fn()
    createTapNavigator(navigate)({ path: '/messages/thread-1', requiresAuth: true })
    expect(navigate).toHaveBeenCalledWith('/messages/thread-1')
  })

  it('sends a signed-out protected tap to login while preserving its destination', () => {
    clearPendingDestination()
    const storage = new Map<string, string>()
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { setItem: (key: string, value: string) => storage.set(key, value), getItem: (key: string) => storage.get(key) ?? null, removeItem: (key: string) => storage.delete(key) } })
    const navigate = vi.fn()
    createTapNavigator(navigate, false)({ path: '/messages/thread-1', requiresAuth: true })
    expect(navigate).toHaveBeenCalledWith('/login')
    expect(getPendingDestination()).toBe('/messages/thread-1')
    clearPendingDestination()
  })

  it('sends a signed-out public tap directly to its destination', () => {
    const navigate = vi.fn()
    createTapNavigator(navigate, false)({ path: '/listing/listing-1', requiresAuth: false })
    expect(navigate).toHaveBeenCalledWith('/listing/listing-1')
  })

  it('rejects arbitrary or protocol-relative paths', () => {
    const navigate = vi.fn()
    const handler = createTapNavigator(navigate)
    handler({ path: 'https://evil.example/phish', requiresAuth: false })
    handler({ path: '//evil.example/phish', requiresAuth: false })
    expect(navigate).not.toHaveBeenCalled()
  })
})
