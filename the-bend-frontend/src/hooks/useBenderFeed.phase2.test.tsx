import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BenderPost, PaginatedResponse } from '@/types'
import { useBenderFeed } from './useBenderFeed'

let cachedData: PaginatedResponse<BenderPost> | BenderPost[] | null = null
let cachedStatus: 'loading' | 'success' | 'empty' | 'error' = 'loading'
let cachedError: Error | null = null
const refresh = vi.fn()

vi.mock('./useCachedPublicContent', () => ({
  useCachedPublicContent: () => ({
    data: cachedData,
    status: cachedStatus,
    error: cachedError,
    source: null,
    cachedAt: null,
    refresh,
  }),
}))
vi.mock('@/services/benderApi', () => ({ benderApi: { listPosts: vi.fn() } }))

const post = (id: string): BenderPost => ({
  id, caption: id, media_url: null, media_thumbnail_url: null, media_type: null,
  like_count: 0, comment_count: 0, viewer_has_liked: false, created_at: '2026-08-18T00:00:00Z',
  author: { id: `author-${id}`, name: `Author ${id}` },
})

describe('useBenderFeed first-page recovery', () => {
  beforeEach(() => {
    cachedData = null
    cachedStatus = 'loading'
    cachedError = null
    vi.clearAllMocks()
  })

  it('ends loading and exposes the original initial request error', () => {
    const original = new Error('network unavailable')
    cachedStatus = 'error'
    cachedError = original

    const { result } = renderHook(() => useBenderFeed())

    expect(result.current.loading).toBe(false)
    expect(result.current.firstPageError).toBe(original)
    expect(result.current.posts).toEqual([])
  })

  it('retries once and hydrates pagination after recovery', () => {
    const { result, rerender } = renderHook(() => useBenderFeed())
    cachedData = { items: [post('recovered')], next_cursor: 'next', has_more: true }
    cachedStatus = 'success'

    act(() => { void result.current.retryFirstPage() })
    expect(refresh).toHaveBeenCalledTimes(1)

    rerender()
    expect(result.current.posts.map((item) => item.id)).toEqual(['recovered'])
    expect(result.current.cursor).toBe('next')
    expect(result.current.hasMore).toBe(true)
    expect(result.current.firstPageError).toBeNull()
  })

  it('keeps visible posts when a later refresh fails', () => {
    cachedData = { items: [post('visible')], next_cursor: null, has_more: false }
    cachedStatus = 'success'
    const { result, rerender } = renderHook(() => useBenderFeed())

    cachedStatus = 'error'
    cachedError = new Error('refresh unavailable')
    rerender()

    expect(result.current.posts.map((item) => item.id)).toEqual(['visible'])
    expect(result.current.loading).toBe(false)
    expect(result.current.firstPageError).toBeNull()
  })
})
