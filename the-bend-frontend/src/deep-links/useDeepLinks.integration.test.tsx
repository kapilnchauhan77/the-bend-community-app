import { StrictMode, type ReactNode } from 'react'
import { act, cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getPendingDestination } from '@/auth/pendingDestination'
import { ProtectedRoute } from '@/components/shared/ProtectedRoute'
import { useDeepLinks } from './useDeepLinks'

const mocks = vi.hoisted(() => ({
  getLaunchUrl: vi.fn(), addListener: vi.fn(), state: { isAuthenticated: false, isLoading: true }, listeners: [] as Array<(event: { url: string }) => void>, handles: [] as Array<{ remove: ReturnType<typeof vi.fn> }>,
}))
vi.mock('@capacitor/app', () => ({ App: { getLaunchUrl: mocks.getLaunchUrl, addListener: mocks.addListener } }))
vi.mock('@/stores/authStore', () => ({ useAuthStore: (selector?: (state: typeof mocks.state) => unknown) => selector ? selector(mocks.state) : mocks.state }))

const messagePath = '/messages/00000000-0000-0000-0000-000000000005'
let pending: string | null = null

function Harness({ children }: { children?: ReactNode }) {
  useDeepLinks()
  return <Routes><Route path="/login" element={<div>LOGIN</div>} /><Route path="*" element={children ?? <ProtectedRoute><div>PROTECTED CONTENT</div></ProtectedRoute>} /></Routes>
}

function renderHarness(initialPath = "/") {
  return render(<MemoryRouter initialEntries={[initialPath]}><Harness /></MemoryRouter>)
}

describe('deep-link and protected-route integration', () => {
  afterEach(() => cleanup())

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.state.isAuthenticated = false
    mocks.state.isLoading = true
    mocks.listeners.length = 0
    mocks.handles.length = 0
    pending = null
    mocks.getLaunchUrl.mockResolvedValue(undefined)
    mocks.addListener.mockImplementation(async (_name: string, handler: (event: { url: string }) => void) => {
      mocks.listeners.push(handler)
      const handle = { remove: vi.fn() }
      mocks.handles.push(handle)
      return handle
    })
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: vi.fn(() => pending), setItem: vi.fn((_key: string, value: string) => { pending = value }), removeItem: vi.fn(() => { pending = null }) } })
  })

  it('keeps a protected cold link behind loading, then renders content after hydration success', async () => {
    mocks.getLaunchUrl.mockResolvedValue({ url: `https://westmoreland.bend.community${messagePath}` })
    const rendered = renderHarness()
    await act(async () => { await Promise.resolve() })
    expect(document.querySelector('.animate-spin')).toBeTruthy()
    expect(screen.queryByText('PROTECTED CONTENT')).toBeNull()
    expect(screen.queryByText(/welcome back/i)).toBeNull()

    mocks.state.isAuthenticated = true
    mocks.state.isLoading = false
    rendered.rerender(<MemoryRouter initialEntries={[messagePath]}><Harness /></MemoryRouter>)
    expect(screen.getAllByText('PROTECTED CONTENT').length).toBeGreaterThan(0)
    expect(getPendingDestination()).toBe(messagePath)
  })

  it('transitions an unauthenticated protected cold link to Login with exact pending path', async () => {
    mocks.getLaunchUrl.mockResolvedValue({ url: `https://westmoreland.bend.community${messagePath}` })
    const rendered = renderHarness()
    await act(async () => { await Promise.resolve() })
    mocks.state.isLoading = false
    rendered.rerender(<MemoryRouter initialEntries={[messagePath]}><Harness /></MemoryRouter>)
    expect(screen.getByText('LOGIN')).toBeTruthy()
    expect(getPendingDestination()).toBe(messagePath)
  })

  it('keeps exactly one effective listener through real StrictMode replay', async () => {
    const rendered = render(<StrictMode><MemoryRouter><Harness /></MemoryRouter></StrictMode>)
    await act(async () => { await Promise.resolve() })
    expect(mocks.addListener).toHaveBeenCalledTimes(2)
    expect(mocks.handles[0].remove).toHaveBeenCalledTimes(1)
    expect(mocks.handles[1].remove).not.toHaveBeenCalled()
    mocks.state.isAuthenticated = true
    mocks.state.isLoading = false
    act(() => mocks.listeners[1]({ url: `https://westmoreland.bend.community${messagePath}` }))
    expect(screen.getAllByText('PROTECTED CONTENT').length).toBeGreaterThan(0)
    expect(mocks.listeners).toHaveLength(2)
    rendered.unmount()
    expect(mocks.handles[1].remove).toHaveBeenCalledTimes(1)
  })
})
