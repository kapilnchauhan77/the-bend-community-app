import { StrictMode, type ReactNode } from 'react'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { BrowserRouter, MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getPendingDestination } from '@/auth/pendingDestination'
import { ProtectedRoute } from '@/components/shared/ProtectedRoute'
import { NativeRouteFrame } from '@/components/layout/NativeRouteFrame'
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

function LocationPath() {
  return <output data-testid="history-path">{useLocation().pathname}</output>
}

function PublicHistoryHarness() {
  useDeepLinks()
  return <><Routes>
    <Route path="/" element={<h1>Home</h1>} />
    <Route path="/explore" element={<h1>Explore</h1>} />
    <Route path="/bender" element={<h1>Bender feed</h1>} />
    <Route path="/bender/:postId" element={<NativeRouteFrame title="Bender post" fallbackPath="/bender"><h1>Focused post</h1></NativeRouteFrame>} />
  </Routes><LocationPath /></>
}

function ProtectedColdHistoryHarness() {
  useDeepLinks()
  return <><Routes>
    <Route path="/" element={<h1>Home</h1>} />
    <Route path="/login" element={<h1>Login</h1>} />
    <Route path="/messages/:threadId" element={<ProtectedRoute><h1>Conversation</h1></ProtectedRoute>} />
  </Routes><LocationPath /></>
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
    window.history.replaceState({}, '', '/')
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

  it('replaces a cold focused launch so Back uses the named fallback at history index zero', async () => {
    const id = '00000000-0000-0000-0000-000000000006'
    mocks.getLaunchUrl.mockResolvedValue({ url: `https://westmoreland.bend.community/bender/${id}` })
    render(<BrowserRouter><PublicHistoryHarness /></BrowserRouter>)
    expect(await screen.findByRole('heading', { name: 'Focused post' })).toBeInTheDocument()
    expect(window.history.state.idx).toBe(0)
    act(() => screen.getByRole('button', { name: 'Back' }).click())
    await waitFor(() => expect(screen.getByTestId('history-path')).toHaveTextContent('/bender'))
  })

  it('pushes a warm focused link so Back returns to the prior route', async () => {
    const id = '00000000-0000-0000-0000-000000000007'
    window.history.replaceState({}, '', '/explore')
    mocks.state.isAuthenticated = true
    mocks.state.isLoading = false
    render(<BrowserRouter><PublicHistoryHarness /></BrowserRouter>)
    await act(async () => { await Promise.resolve() })
    act(() => mocks.listeners[0]({ url: `https://westmoreland.bend.community/bender/${id}` }))
    expect(await screen.findByRole('heading', { name: 'Focused post' })).toBeInTheDocument()
    expect(window.history.state.idx).toBe(1)
    act(() => screen.getByRole('button', { name: 'Back' }).click())
    await waitFor(() => expect(screen.getByTestId('history-path')).toHaveTextContent('/explore'))
  })

  it('replaces a protected cold launch with Login at index zero and stores the canonical target', async () => {
    mocks.state.isAuthenticated = false
    mocks.state.isLoading = false
    mocks.getLaunchUrl.mockResolvedValue({ url: `https://westmoreland.bend.community${messagePath}` })
    render(<BrowserRouter><ProtectedColdHistoryHarness /></BrowserRouter>)
    expect(await screen.findByRole('heading', { name: 'Login' })).toBeInTheDocument()
    expect(screen.getByTestId('history-path')).toHaveTextContent('/login')
    expect(window.history.state.idx).toBe(0)
    expect(getPendingDestination()).toBe(messagePath)
  })
})
