import { describe, expect, it, vi } from 'vitest'
import { createTapNavigator } from './usePushNotifications'

describe('native push tap navigation', () => {
  it('navigates an allowlisted destination, including protected routes', () => {
    const navigate = vi.fn()
    createTapNavigator(navigate)({ path: '/messages/thread-1', requiresAuth: true })
    expect(navigate).toHaveBeenCalledWith('/messages/thread-1')
  })

  it('rejects arbitrary or protocol-relative paths', () => {
    const navigate = vi.fn()
    const handler = createTapNavigator(navigate)
    handler({ path: 'https://evil.example/phish', requiresAuth: false })
    handler({ path: '//evil.example/phish', requiresAuth: false })
    expect(navigate).not.toHaveBeenCalled()
  })
})
