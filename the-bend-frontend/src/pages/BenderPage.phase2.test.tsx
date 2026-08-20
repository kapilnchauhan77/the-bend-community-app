import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import type { BenderPost } from '@/types'
import BenderPage from './BenderPage'

const mocks = vi.hoisted(() => ({ getPost: vi.fn(), listPosts: vi.fn() }))
const getPost = mocks.getPost
const feed = { posts: [], cursor: null, hasMore: false, loading: false, firstPageError: null, retryFirstPage: vi.fn(), loadingMore: false, loadMoreError: null, cachedAt: null, loadNext: vi.fn(), prepend: vi.fn(), remove: vi.fn(), patch: vi.fn() }
const auth = { isAuthenticated: true, user: { id: 'user-1', role: 'individual' } }
vi.mock('@/services/benderApi', () => ({ benderApi: { getPost: mocks.getPost, listPosts: mocks.listPosts, deletePost: vi.fn(), like: vi.fn(), unlike: vi.fn(), listComments: vi.fn(), createComment: vi.fn(), deleteComment: vi.fn(), createPost: vi.fn() } }))
vi.mock('@/hooks/useBenderFeed', () => ({ useBenderFeed: vi.fn((options?: { enabled?: boolean }) => { if (options?.enabled !== false) void mocks.listPosts(); return feed }) }))
vi.mock('@/stores/authStore', () => ({ useAuthStore: () => auth }))
vi.mock('@/hooks/useBenderDraft', () => ({ useBenderDraft: () => ({ caption: '', setCaption: vi.fn(), pending: null, setPending: vi.fn(), hydrated: true, discard: vi.fn(async () => undefined) }) }))
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
function Location() { return <output data-testid="location"><span>{useLocation().pathname}</span></output> }
function renderAt(path: string, nativeEmbedded = false) { return render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/bender/:postId?" element={<><BenderPage nativeEmbedded={nativeEmbedded} /><Location /></>} /></Routes></MemoryRouter>) }

describe('BenderPage focused phase 2', () => {
  afterEach(() => cleanup())
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

describe('BenderPage compact native cards', () => {
  afterEach(() => { cleanup(); feed.posts = [] })
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
