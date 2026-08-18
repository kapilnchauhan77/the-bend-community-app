import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearPendingDestination, consumePendingDestination, getPendingDestination, isAllowedPendingDestination, setPendingDestination, setPendingIntent, getPendingIntent, consumePendingIntent } from './pendingDestination'

describe('pending destinations', () => {
  const storage = { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() }
  beforeEach(() => { vi.clearAllMocks(); Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage }) })
  it.each(['/admin', '/super-admin/users', '//evil.example/login', 'https://evil.example/login', '/messages?thread=abc', '/listing/abc'])('validates destination %s', (path) => {
    expect(isAllowedPendingDestination(path)).toBe(path === '/messages?thread=abc' || path === '/listing/abc')
  })
  it('persists, consumes, and clears only allowlisted paths', () => {
    setPendingDestination('/settings?tab=profile')
    expect(storage.setItem).toHaveBeenCalledWith('native_pending_post_path', '/settings?tab=profile')
    storage.getItem.mockReturnValue('/settings?tab=profile')
    expect(getPendingDestination()).toBe('/settings?tab=profile')
    expect(consumePendingDestination()).toBe('/settings?tab=profile')
    expect(storage.removeItem).toHaveBeenCalledWith('native_pending_post_path')
    setPendingDestination('/admin')
    expect(storage.setItem).toHaveBeenCalledTimes(1)
    clearPendingDestination()
  })

  it('stores an allowlisted Create intent with typed action metadata', () => {
    setPendingIntent({ destination: '/create?type=offer', action: 'offer-listing' })
    expect(storage.setItem).toHaveBeenNthCalledWith(1, 'native_pending_post_path', '/create?type=offer')
    expect(storage.setItem).toHaveBeenNthCalledWith(2, 'native_pending_create_action', 'offer-listing')
    storage.getItem.mockImplementation((key: string) => key === 'native_pending_post_path' ? '/create?type=offer' : 'offer-listing')
    expect(getPendingIntent()).toEqual({ destination: '/create?type=offer', action: 'offer-listing' })
  })

  it.each([
    { destination: '/create?type=request', action: 'offer-listing' },
    { destination: '/bender', action: 'request-listing' },
    { destination: '/admin', action: 'bender-post' },
  ] as const)('rejects a non-matching Create pair %#', (intent) => {
    setPendingIntent(intent)
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it('consumes a valid Create intent once and clears both keys', () => {
    storage.getItem.mockImplementation((key: string) => key === 'native_pending_post_path' ? '/bender' : 'bender-post')
    expect(consumePendingIntent()).toEqual({ destination: '/bender', action: 'bender-post' })
    expect(storage.removeItem).toHaveBeenCalledWith('native_pending_post_path')
    expect(storage.removeItem).toHaveBeenCalledWith('native_pending_create_action')
  })

  it('clears malformed Create action metadata with a path-only continuation', () => {
    storage.getItem.mockImplementation((key: string) => key === 'native_pending_post_path' ? '/messages?thread=abc' : 'stale-action')
    clearPendingDestination()
    expect(storage.removeItem).toHaveBeenCalledWith('native_pending_post_path')
    expect(storage.removeItem).toHaveBeenCalledWith('native_pending_create_action')
  })
})
