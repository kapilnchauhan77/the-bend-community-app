import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import type { BenderPost } from '@/types'
import BenderPage from './BenderPage'

const mocks = vi.hoisted(() => ({ getPost: vi.fn() }))
const getPost = mocks.getPost
const feed = { posts: [], cursor: null, hasMore: false, loading: false, loadingMore: false, loadMoreError: null, cachedAt: null, loadNext: vi.fn(), prepend: vi.fn(), remove: vi.fn(), patch: vi.fn() }
const auth = { isAuthenticated: true, user: { id: 'user-1', role: 'individual' } }
vi.mock('@/services/benderApi', () => ({ benderApi: { getPost: mocks.getPost, listPosts: vi.fn(), deletePost: vi.fn(), like: vi.fn(), unlike: vi.fn(), listComments: vi.fn(), createComment: vi.fn(), deleteComment: vi.fn(), createPost: vi.fn() } }))
vi.mock('@/hooks/useBenderFeed', () => ({ useBenderFeed: vi.fn(() => feed) }))
vi.mock('@/stores/authStore', () => ({ useAuthStore: () => auth }))
vi.mock('@/hooks/useBenderDraft', () => ({ useBenderDraft: () => ({ caption: '', setCaption: vi.fn(), pending: null, setPending: vi.fn(), hydrated: true, discard: vi.fn(async () => undefined) }) }))
vi.mock('@/hooks/useOnlineMutation', () => ({ useOnlineMutation: () => ({ online: true, ready: true, run: (fn: () => unknown) => fn() }) }))
vi.mock('@/components/layout/Navbar', () => ({ Navbar: () => <div data-testid="web-navbar" /> }))
vi.mock('@/components/layout/BottomNav', () => ({ BottomNav: () => <div data-testid="web-bottom-nav" /> }))
vi.mock('@/components/layout/Footer', () => ({ Footer: () => <div data-testid="web-footer" /> }))
vi.mock('@/components/shared/InstallBanner', () => ({ InstallBanner: () => <div data-testid="web-install-banner" /> }))
vi.mock('@/components/shared/SponsorBanner', () => ({ SponsorBanner: () => <div data-testid="web-sponsor-banner" /> }))
vi.mock('@/components/shared/CameraCapture', () => ({ CameraCapture: () => null }))
vi.mock('@/components/features/messages/ShareToMessageButton', () => ({ ShareToMessageButton: () => null }))

const post: BenderPost = { id: '123e4567-e89b-12d3-a456-426614174000', caption: 'focused', media_url: null, media_thumbnail_url: null, media_type: null, like_count: 0, comment_count: 0, viewer_has_liked: false, created_at: '2026-08-18T00:00:00Z', author: { id: 'user-1', name: 'Author' } }
function Location() { return <output data-testid="location"><span>{useLocation().pathname}</span></output> }
function renderAt(path: string, nativeEmbedded = false) { return render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/bender/:postId?" element={<><BenderPage nativeEmbedded={nativeEmbedded} /><Location /></>} /></Routes></MemoryRouter>) }

describe('BenderPage focused phase 2', () => {
  afterEach(() => cleanup())
  beforeEach(() => { vi.clearAllMocks(); getPost.mockResolvedValue({ data: post }) })
  it('loads one focused card without feed controls', async () => { renderAt(`/bender/${post.id}`); await waitFor(() => expect(screen.getByText('focused')).toBeInTheDocument()); expect(document.querySelectorAll('article')).toHaveLength(1); expect(screen.queryByText('No posts yet')).not.toBeInTheDocument(); expect(screen.queryByLabelText('New post')).not.toBeInTheDocument() })
  it('replaces a valid legacy query route with canonical route', async () => { renderAt(`/bender?post=${post.id}`); await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(`/bender/${post.id}`)) })
  it('does not focus a noncanonical direct id', () => { renderAt('/bender/not-a-uuid'); expect(getPost).not.toHaveBeenCalled(); expect(screen.getByText('No posts yet')).toBeInTheDocument() })
  it('suppresses native focused sticky header and owns hidden heading', async () => { renderAt(`/bender/${post.id}`, true); await waitFor(() => expect(screen.getByText('focused')).toBeInTheDocument()); expect(screen.getByRole('heading', { name: 'Bender post' })).toHaveClass('sr-only'); expect(document.querySelector('.native-bender-header')).not.toBeInTheDocument() })
  it('keeps web focused chrome', async () => { renderAt(`/bender/${post.id}`); await waitFor(() => expect(screen.getByText('focused')).toBeInTheDocument()); expect(screen.getByTestId('web-navbar')).toBeInTheDocument() })
  it('returns to feed after deletion', async () => { window.confirm = vi.fn(() => true); renderAt(`/bender/${post.id}`); await waitFor(() => expect(screen.getByText('focused')).toBeInTheDocument()); fireEvent.click(screen.getByRole('button', { name: 'More' })); fireEvent.click(screen.getByRole('button', { name: 'Delete' })); await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/bender')) })
})
