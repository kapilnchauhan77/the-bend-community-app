import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearPendingDestination, consumePendingDestination, getPendingDestination, isAllowedPendingDestination, setPendingDestination } from './pendingDestination'

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
})
