import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import type { BenderPost } from '@/types'
import BenderPage from './BenderPage'

const mocks = vi.hoisted(() => ({ getPost: vi.fn(), listPosts: vi.fn(), createPost: vi.fn() }))
const getPost = mocks.getPost
const feed = { posts: [], cursor: null, hasMore: false, loading: false, firstPageError: null, retryFirstPage: vi.fn(), loadingMore: false, loadMoreError: null, cachedAt: null, loadNext: vi.fn(), prepend: vi.fn(), remove: vi.fn(), patch: vi.fn() }
const auth = { isAuthenticated: true, user: { id: 'user-1', role: 'individual' } }
vi.mock('@/services/benderApi', () => ({ benderApi: { getPost: mocks.getPost, listPosts: mocks.listPosts, deletePost: vi.fn(), like: vi.fn(), unlike: vi.fn(), listComments: vi.fn(), createComment: vi.fn(), deleteComment: vi.fn(), createPost: mocks.createPost } }))
vi.mock('@/hooks/useBenderFeed', () => ({ useBenderFeed: vi.fn((options?: { enabled?: boolean }) => { if (options?.enabled !== false) void mocks.listPosts(); return feed }) }))
vi.mock('@/stores/authStore', () => ({ useAuthStore: () => auth }))
vi.mock('@/hooks/useBenderDraft', async () => {
  const { useState } = await import('react')
  return {
    useBenderDraft: () => {
      const [caption, setCaption] = useState('')
      return { caption, setCaption, pending: null, setPending: vi.fn(), hydrated: true, discard: vi.fn(async () => setCaption('')) }
    },
  }
})
vi.mock('@/hooks/useOnlineMutation', () => ({ useOnlineMutation: () => ({ online: true, ready: true, run: (fn: () => unknown) => fn() }) }))
vi.mock('@/components/layout/Navbar', () => ({ Navbar: () => <div data-testid="web-navbar" /> }))
vi.mock('@/components/layout/BottomNav', () => ({ BottomNav: () => <div data-testid="web-bottom-nav" /> }))
vi.mock('@/components/layout/Footer', () => ({ Footer: () => <div data-testid="web-footer" /> }))
vi.mock('@/components/shared/InstallBanner', () => ({ InstallBanner: () => <div data-testid="web-install-banner" /> }))
vi.mock('@/components/shared/SponsorBanner', () => ({ SponsorBanner: () => <div data-testid="web-sponsor-banner" /> }))
vi.mock('@/components/shared/CameraCapture', () => ({ CameraCapture: () => null }))
vi.mock('@/components/features/messages/ShareToMessageButton', () => ({ ShareToMessageButton: ({ label }: { label?: string }) => <button type="button" aria-label={label}>Message</button> }))
vi.mock('@/platform/createPlatformServices', () => ({ usePlatformServices: () => ({ browser: { open: vi.fn() } }) }))

const post: BenderPost = { id: '123e4567-e89b-12d3-a456-426614174000', caption: 'focused', media_url: null, media_thumbnail_url: null, media_type: null, like_count: 0, comment_count: 0, viewer_has_liked: false, created_at: '2026-08-18T00:00:00Z', author: { id: 'user-1', name: 'Author' } }
const nativeCss = readFileSync('src/styles/native.css', 'utf8')
const originalLocation = window.location
const originalNavigatorShare = navigator.share
const originalMatchMedia = window.matchMedia
const originalScrollIntoView = HTMLElement.prototype.scrollIntoView
const originalRequestAnimationFrame = window.requestAnimationFrame
function Location() { return <output data-testid="location"><span>{useLocation().pathname}</span></output> }
function renderAt(path: string, nativeEmbedded = false) { return render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/bender/:postId?" element={<><BenderPage nativeEmbedded={nativeEmbedded} /><Location /></>} /></Routes></MemoryRouter>) }
function setReducedMotion(reduced: boolean) {
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: vi.fn(() => ({ matches: reduced } as MediaQueryList)) })
}
function restoreMotionGlobals() {
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: originalMatchMedia })
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: originalScrollIntoView })
  Object.defineProperty(window, 'requestAnimationFrame', { configurable: true, value: originalRequestAnimationFrame })
}

describe('BenderPage focused phase 2', () => {
  afterEach(() => { cleanup(); restoreMotionGlobals() })
  beforeEach(() => { vi.clearAllMocks(); getPost.mockResolvedValue({ data: post }) })
  it('loads one focused card without feed controls', async () => { renderAt(`/bender/${post.id}`); await waitFor(() => expect(screen.getByText('focused')).toBeInTheDocument()); expect(document.querySelectorAll('article')).toHaveLength(1); expect(screen.queryByText('No posts yet')).not.toBeInTheDocument(); expect(screen.queryByLabelText('New post')).not.toBeInTheDocument() })
  it('replaces a valid legacy query route with canonical route', async () => { renderAt(`/bender?post=${post.id}`); await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(`/bender/${post.id}`)) })
  it('renders a safe unavailable state for a noncanonical direct id without starting feed or detail requests', () => {
    renderAt('/bender/not-a-uuid')
    expect(getPost).not.toHaveBeenCalled()
    expect(mocks.listPosts).not.toHaveBeenCalled()
    expect(screen.getByText('Post unavailable')).toBeInTheDocument()
    expect(screen.queryByText('No posts yet')).not.toBeInTheDocument()
  })
  it('suppresses native focused sticky header and owns hidden heading', async () => { renderAt(`/bender/${post.id}`, true); await waitFor(() => expect(screen.getByText('focused')).toBeInTheDocument()); expect(screen.getByRole('heading', { name: 'Bender post' })).toHaveClass('sr-only'); expect(document.querySelector('.native-bender-header')).not.toBeInTheDocument() })
  it('keeps web focused chrome', async () => { renderAt(`/bender/${post.id}`); await waitFor(() => expect(screen.getByText('focused')).toBeInTheDocument()); expect(screen.getByTestId('web-navbar')).toBeInTheDocument() })
  it('returns to feed after deletion', async () => { window.confirm = vi.fn(() => true); renderAt(`/bender/${post.id}`); await waitFor(() => expect(screen.getByText('focused')).toBeInTheDocument()); fireEvent.click(screen.getByRole('button', { name: 'More' })); fireEvent.click(screen.getByRole('button', { name: 'Delete' })); await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/bender')) })
})

describe('BenderPage scroll motion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    feed.posts = []
    feed.firstPageError = null
    getPost.mockResolvedValue({ data: post })
    mocks.createPost.mockResolvedValue({ data: post })
  })
  afterEach(() => {
    cleanup()
    feed.posts = []
    feed.firstPageError = null
    restoreMotionGlobals()
  })

  it.each([
    { reduced: true, behavior: 'auto' as const },
    { reduced: false, behavior: 'smooth' as const },
  ])('uses $behavior scrolling for a focused post when reduced motion is $reduced', async ({ reduced, behavior }) => {
    const scrollIntoView = vi.fn()
    setReducedMotion(reduced)
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView })

    renderAt(`/bender/${post.id}`)

    expect(await screen.findByText('focused')).toBeInTheDocument()
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({ behavior, block: 'center' }))
  })

  it.each([
    { reduced: true, behavior: 'auto' as const },
    { reduced: false, behavior: 'smooth' as const },
  ])('uses $behavior scrolling after a new post when reduced motion is $reduced', async ({ reduced, behavior }) => {
    const scrollIntoView = vi.fn()
    setReducedMotion(reduced)
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView })
    Object.defineProperty(window, 'requestAnimationFrame', { configurable: true, value: (callback: FrameRequestCallback) => { callback(0); return 1 } })

    renderAt('/bender')
    fireEvent.click(screen.getAllByRole('button', { name: 'New post' })[0])
    fireEvent.change(screen.getByPlaceholderText('Write a caption…'), { target: { value: 'A new post' } })
    fireEvent.click(screen.getByRole('button', { name: 'Post' }))

    await waitFor(() => expect(mocks.createPost).toHaveBeenCalled())
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({ behavior, block: 'start' }))
  })
})

describe('BenderPage compact native cards', () => {
  afterEach(() => {
    cleanup()
    feed.posts = []
    feed.firstPageError = null
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation })
    if (originalNavigatorShare === undefined) delete (navigator as { share?: unknown }).share
    else Object.defineProperty(navigator, 'share', { configurable: true, value: originalNavigatorShare })
    restoreMotionGlobals()
  })
  it('keeps text, safe media, captions, and post-specific action labels in native order', () => {
    const longAuthor = 'Alex Neighbor ' + 'Z'.repeat(80)
    const boundedAuthor = longAuthor.slice(0, 60)
    feed.posts = [{ ...post, caption: `A long caption ${'word '.repeat(80)}https://example.com`, media_url: 'https://cdn.example/video.mp4', media_type: 'video', author: { id: 'user-1', name: longAuthor } }]
    renderAt('/bender', true)
    const article = document.querySelector('article')!
    expect(article.querySelector('img')).toBeNull()
    expect(article.querySelector('video')).toBeInTheDocument()
    expect(article.querySelector('.native-bender-caption')).toBeInTheDocument()
    expect(article.querySelector('.native-bender-caption')!.compareDocumentPosition(article.querySelector('.native-bender-actions')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByRole('button', { name: `Like ${boundedAuthor}'s post` })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: `View comments on ${boundedAuthor}'s post` })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: `Share ${boundedAuthor}'s post` })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: `More actions for ${boundedAuthor}'s post` })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: `More actions for ${boundedAuthor}'s post` })).toHaveClass('native-bender-kebab')
  })

  it('keeps native kebab controls at least 44 pixels without changing card layout', () => {
    feed.posts = [{ ...post, author: { id: 'user-1', name: 'Author' } }]
    const { container } = renderAt('/bender', true)
    expect(container.querySelector('.native-bender-post-card')).toBeInTheDocument()
    expect(nativeCss).toMatch(/\.native-app \.native-bender-kebab\s*\{[^}]*min-width:\s*44px[^}]*min-height:\s*44px/)
  })

  it('shares a web post on the tenant origin that rendered it', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    feed.posts = [post]
    Object.defineProperty(window, 'location', { configurable: true, value: { origin: 'https://northumberland.bend.community' } })
    Object.defineProperty(navigator, 'share', { configurable: true, value: share })

    renderAt('/bender')
    fireEvent.click(screen.getByRole('button', { name: 'Share' }))

    await waitFor(() => expect(share).toHaveBeenCalledWith(expect.objectContaining({
      url: `https://northumberland.bend.community/bender/${post.id}`,
    })))
  })

  it('shares a native post on the fixed Westmoreland public origin', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    feed.posts = [post]
    Object.defineProperty(window, 'location', { configurable: true, value: { origin: 'capacitor://localhost' } })
    Object.defineProperty(navigator, 'share', { configurable: true, value: share })

    renderAt('/bender', true)
    fireEvent.click(screen.getByRole('button', { name: "Share Author's post" }))

    await waitFor(() => expect(share).toHaveBeenCalledWith(expect.objectContaining({
      url: `https://westmoreland.bend.community/bender/${post.id}`,
    })))
  })
})

describe('BenderPage first-page recovery', () => {
  afterEach(() => cleanup())
  it('shows a retry state instead of the empty feed when the first page fails', () => {
    feed.firstPageError = new Error('network unavailable')
    renderAt('/bender')
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to load posts. Try again.')
    expect(screen.queryByText('No posts yet')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toHaveStyle({ minHeight: '44px' })
  })

  it('retries the first page once', () => {
    feed.firstPageError = new Error('network unavailable')
    renderAt('/bender')
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(feed.retryFirstPage).toHaveBeenCalledTimes(1)
  })
})
