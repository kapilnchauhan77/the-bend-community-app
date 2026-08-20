import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BenderPost, PaginatedResponse } from '@/types'
import { useBenderFeed } from './useBenderFeed'

let cachedData: PaginatedResponse<BenderPost> | BenderPost[] | null = null
let cachedSource: 'network' | 'cache' | null = null
let firstPageFetcher: (() => Promise<PaginatedResponse<BenderPost>>) | undefined
let cacheOptions: { cachePolicy?: string } | undefined
const refresh = vi.fn()
const listPosts = vi.fn()

vi.mock('./useCachedPublicContent', () => ({
  useCachedPublicContent: (_key: string, fetcher: () => Promise<PaginatedResponse<BenderPost>>, options?: { cachePolicy?: string }) => {
    firstPageFetcher = fetcher
    cacheOptions = options
    return { data: cachedData, source: cachedSource, cachedAt: cachedSource === 'cache' ? '2026-08-18T00:00:00Z' : null, refresh }
  },
}))
vi.mock('@/services/benderApi', () => ({ benderApi: { listPosts: (...args: unknown[]) => listPosts(...args) } }))

const post = (id: string): BenderPost => ({
  id, caption: id, media_url: null, media_thumbnail_url: null, media_type: null, like_count: 0, comment_count: 0,
  viewer_has_liked: false, created_at: '2026-08-18T00:00:00Z', author: { id: `author-${id}`, name: `Author ${id}` },
})

describe('useBenderFeed', () => {
  beforeEach(() => {
    cachedData = null
    cachedSource = null
    firstPageFetcher = undefined
    cacheOptions = undefined
    vi.clearAllMocks()
  })

  it('keeps viewer-specific likes and block projections out of the public cache', () => {
    renderHook(() => useBenderFeed())
    expect(cacheOptions).toEqual({ cachePolicy: 'none' })
  })

  it('uses one cache-aware fetcher as the authoritative initial-page request', async () => {
    const first = { items: [post('1')], next_cursor: 'cursor-2', has_more: true }
    listPosts.mockResolvedValueOnce({ data: first })
    renderHook(() => useBenderFeed())
    await expect(firstPageFetcher?.()).resolves.toEqual(first)
    expect(listPosts).toHaveBeenCalledTimes(1)
    expect(listPosts).toHaveBeenCalledWith()
  })

  it('hydrates cached first-page pagination metadata', () => {
    cachedData = { items: [post('cached')], next_cursor: 'cached-next', has_more: true }
    cachedSource = 'cache'
    const { result } = renderHook(() => useBenderFeed())
    expect(result.current.posts.map((item) => item.id)).toEqual(['cached'])
    expect(result.current.cursor).toBe('cached-next')
    expect(result.current.hasMore).toBe(true)
  })

  it('loads and deduplicates the next cursor page', async () => {
    cachedData = { items: [post('1')], next_cursor: 'cursor-2', has_more: true }
    const { result } = renderHook(() => useBenderFeed())
    listPosts.mockResolvedValueOnce({ data: { items: [post('1'), post('2')], next_cursor: null, has_more: false } })
    await act(async () => { await result.current.loadNext() })
    expect(listPosts).toHaveBeenCalledWith('cursor-2')
    expect(result.current.posts.map((item) => item.id)).toEqual(['1', '2'])
    expect(result.current.hasMore).toBe(false)
  })

  it('contains a failed next-page request without corrupting the current feed', async () => {
    cachedData = { items: [post('1')], next_cursor: 'cursor-2', has_more: true }
    const { result } = renderHook(() => useBenderFeed())
    listPosts.mockRejectedValueOnce(new Error('network unavailable'))

    await act(async () => { await expect(result.current.loadNext()).resolves.toBeUndefined() })

    expect(result.current.posts.map((item) => item.id)).toEqual(['1'])
    expect(result.current.cursor).toBe('cursor-2')
    expect(result.current.hasMore).toBe(true)
    expect(result.current.loadingMore).toBe(false)
    expect(result.current.loadMoreError).toBe('Unable to load more posts. Try again.')
  })

  it('clears a pagination error when refreshed first-page data arrives', async () => {
    cachedData = { items: [post('1')], next_cursor: 'cursor-2', has_more: true }
    const { result, rerender } = renderHook(() => useBenderFeed())
    listPosts.mockRejectedValueOnce(new Error('network unavailable'))
    await act(async () => { await result.current.loadNext() })
    expect(result.current.loadMoreError).not.toBeNull()

    cachedData = { items: [post('fresh')], next_cursor: 'cursor-3', has_more: true }
    rerender()

    await waitFor(() => expect(result.current.posts.map((item) => item.id)).toEqual(['fresh']))
    expect(result.current.loadMoreError).toBeNull()
  })

  it('restores next-page capability when a reconnect refresh supplies a new cursor', async () => {
    cachedData = { items: [post('cached')], has_more: false }
    cachedSource = 'cache'
    const { result, rerender } = renderHook(() => useBenderFeed())
    expect(result.current.hasMore).toBe(false)

    cachedData = { items: [post('fresh')], next_cursor: 'fresh-next', has_more: true }
    cachedSource = 'network'
    rerender()
    await waitFor(() => expect(result.current.posts.map((item) => item.id)).toEqual(['fresh']))
    expect(result.current.cursor).toBe('fresh-next')
    expect(result.current.hasMore).toBe(true)

    listPosts.mockResolvedValueOnce({ data: { items: [post('next')], next_cursor: null, has_more: false } })
    await act(async () => { await result.current.loadNext() })
    expect(listPosts).toHaveBeenCalledWith('fresh-next')
    expect(result.current.posts.map((item) => item.id)).toEqual(['fresh', 'next'])
  })
})
