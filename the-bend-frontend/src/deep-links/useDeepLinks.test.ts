import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useDeepLinks } from './useDeepLinks'

const mocks = vi.hoisted(() => ({
  getLaunchUrl: vi.fn(), addListener: vi.fn(), navigate: vi.fn(), state: { isAuthenticated: false, isLoading: true },
}))
vi.mock('@capacitor/app', () => ({ App: { getLaunchUrl: mocks.getLaunchUrl, addListener: mocks.addListener } }))
vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.navigate }))
vi.mock('@/stores/authStore', () => ({ useAuthStore: (selector: (state: typeof mocks.state) => unknown) => selector(mocks.state) }))

describe('useDeepLinks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.state.isAuthenticated = false
    mocks.state.isLoading = true
    mocks.getLaunchUrl.mockResolvedValue(undefined)
    mocks.addListener.mockResolvedValue({ remove: vi.fn().mockResolvedValue(undefined) })
  })

  it('handles a valid cold public launch and installs one listener', async () => {
    mocks.getLaunchUrl.mockResolvedValue({ url: 'https://westmoreland.bend.community/' })
    renderHook(() => useDeepLinks())
    await act(async () => { await Promise.resolve() })
    expect(mocks.navigate).toHaveBeenCalledWith('/')
    expect(mocks.addListener).toHaveBeenCalledTimes(1)
  })

  it('keeps a protected warm link on its route while auth is loading', async () => {
    let callback!: (event: { url: string }) => void
    mocks.addListener.mockImplementation(async (_name: string, handler: (event: { url: string }) => void) => { callback = handler; return { remove: vi.fn() } })
    renderHook(() => useDeepLinks())
    await act(async () => { await Promise.resolve() })
    act(() => callback({ url: 'https://westmoreland.bend.community/notifications' }))
    expect(mocks.navigate).toHaveBeenCalledWith('/notifications')
    expect(mocks.navigate).not.toHaveBeenCalledWith('/login', expect.anything())
  })

  it('removes the listener when addListener resolves after unmount', async () => {
    let resolve!: (handle: { remove: () => Promise<void> }) => void
    const remove = vi.fn().mockResolvedValue(undefined)
    mocks.addListener.mockReturnValue(new Promise((r) => { resolve = r }))
    const rendered = renderHook(() => useDeepLinks())
    rendered.unmount()
    await act(async () => { resolve({ remove }); await Promise.resolve() })
    expect(remove).toHaveBeenCalledTimes(1)
  })

  it('ignores invalid cold URLs', async () => {
    mocks.getLaunchUrl.mockResolvedValue({ url: 'https://evil.example/notifications' })
    renderHook(() => useDeepLinks())
    await act(async () => { await Promise.resolve() })
    expect(mocks.navigate).not.toHaveBeenCalled()
  })
})
