import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NativeBenderCard } from './NativeBenderCard'
import type { BenderPost } from '@/types'

const post = (overrides: Partial<BenderPost> = {}): BenderPost => ({
  id: 'post-1',
  author: { id: 'author-1', name: 'Alex Neighbor', avatar_url: null, shop_id: null, shop_name: null },
  caption: 'Fresh vegetables at the market today',
  media_url: null,
  media_thumbnail_url: null,
  media_type: null,
  like_count: 12,
  comment_count: 3,
  viewer_has_liked: false,
  created_at: '2026-08-19T10:00:00Z',
  ...overrides,
})

describe('NativeBenderCard', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-08-19T12:00:00Z')) })
  afterEach(() => { cleanup(); vi.useRealTimers() })

  it('uses the shop name as the headline and falls back to the author name', () => {
    render(<><NativeBenderCard post={post({ id: 'shop-post', author: { id: 'owner-1', name: 'Shop Owner', avatar_url: null, shop_id: 'shop-1', shop_name: "Leedstown's Plants & Produce" } })} onOpen={vi.fn()} /><NativeBenderCard post={post({ id: 'neighbor-post', author: { id: 'neighbor-1', name: 'Jordan Neighbor', avatar_url: null, shop_id: null, shop_name: null } })} onOpen={vi.fn()} /></>)
    expect(screen.getByText("Leedstown's Plants & Produce")).toBeInTheDocument()
    expect(screen.queryByText('Shop Owner')).not.toBeInTheDocument()
    expect(screen.getByText('Jordan Neighbor')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: "Open Bender post by Leedstown's Plants & Produce: Fresh vegetables at the market today" })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open Bender post by Jordan Neighbor: Fresh vegetables at the market today' })).toBeInTheDocument()
  })

  it('shows relative time and engagement counts', () => {
    render(<NativeBenderCard post={post()} onOpen={vi.fn()} />)
    expect(screen.getByText('2h ago')).toBeInTheDocument()
    expect(screen.getByText('12 likes')).toBeInTheDocument()
    expect(screen.getByText('3 comments')).toBeInTheDocument()
  })

  it('opens the canonical post query from its accessible card control', () => {
    const onOpen = vi.fn()
    render(<NativeBenderCard post={post({ id: 'post id/with spaces' })} onOpen={onOpen} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open Bender post by Alex Neighbor: Fresh vegetables at the market today' }))
    expect(onOpen).toHaveBeenCalledWith('/bender?post=post%20id%2Fwith%20spaces')
  })

  it('distinguishes posts from the same author and bounds extreme accessible names', () => {
    const { rerender } = render(<><NativeBenderCard post={post({ id: 'one', caption: 'Morning update' })} onOpen={vi.fn()} /><NativeBenderCard post={post({ id: 'two', caption: 'Evening update' })} onOpen={vi.fn()} /></>)
    expect(screen.getByRole('button', { name: 'Open Bender post by Alex Neighbor: Morning update' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open Bender post by Alex Neighbor: Evening update' })).toBeInTheDocument()

    rerender(<NativeBenderCard post={post({ author: { ...post().author, name: 'A'.repeat(200) }, caption: 'C'.repeat(500) })} onOpen={vi.fn()} />)
    const label = screen.getByRole('button').getAttribute('aria-label') ?? ''
    expect(label.length).toBeLessThanOrEqual(180)
    expect(label).toContain('…')
  })

  it('prefers a resolved image thumbnail and falls back to the full image', () => {
    const { rerender } = render(<NativeBenderCard post={post({ media_type: 'image', media_url: '/uploads/images/full.jpg', media_thumbnail_url: '/uploads/images/thumb.jpg' })} onOpen={vi.fn()} />)
    expect(screen.getByRole('img')).toHaveAttribute('src', 'http://localhost:8000/uploads/images/thumb.jpg')
    expect(screen.getByRole('img')).toHaveAttribute('loading', 'lazy')
    rerender(<NativeBenderCard post={post({ media_type: 'image', media_url: '/uploads/images/full.jpg', media_thumbnail_url: null })} onOpen={vi.fn()} />)
    expect(screen.getByRole('img')).toHaveAttribute('src', 'http://localhost:8000/uploads/images/full.jpg')
  })

  it('uses a video thumbnail without loading video media into an image', () => {
    const { rerender } = render(<NativeBenderCard post={post({ media_type: 'video', media_url: '/uploads/videos/clip.mp4', media_thumbnail_url: '/uploads/images/clip-thumb.jpg' })} onOpen={vi.fn()} />)
    expect(screen.getByRole('img')).toHaveAttribute('src', 'http://localhost:8000/uploads/images/clip-thumb.jpg')
    expect(document.querySelector('video')).toBeNull()
    rerender(<NativeBenderCard post={post({ media_type: 'video', media_url: '/uploads/videos/clip.mp4', media_thumbnail_url: null })} onOpen={vi.fn()} />)
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(document.querySelector('[data-fallback-icon="bender"]')).toBeInTheDocument()
  })

  it('rejects video URLs from image metadata and from the thumbnail field', () => {
    const { rerender } = render(<NativeBenderCard post={post({ media_type: 'image', media_url: '/uploads/videos/mislabeled.mp4', media_thumbnail_url: null })} onOpen={vi.fn()} />)
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(document.querySelector('[data-fallback-icon="bender"]')).toBeInTheDocument()

    rerender(<NativeBenderCard post={post({ media_type: 'image', media_url: '/uploads/images/full.jpg', media_thumbnail_url: '/uploads/videos/not-a-thumbnail.mp4' })} onOpen={vi.fn()} />)
    expect(screen.getByRole('img')).toHaveAttribute('src', 'http://localhost:8000/uploads/images/full.jpg')
  })

  it('shows the same fallback for a post without media and for broken preview media', () => {
    const { rerender } = render(<NativeBenderCard post={post()} onOpen={vi.fn()} />)
    expect(document.querySelector('[data-fallback-icon="bender"]')).toBeInTheDocument()
    rerender(<NativeBenderCard post={post({ media_type: 'image', media_url: '/uploads/images/broken.jpg' })} onOpen={vi.fn()} />)
    fireEvent.error(screen.getByRole('img'))
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(document.querySelector('[data-fallback-icon="bender"]')).toBeInTheDocument()
  })
})
