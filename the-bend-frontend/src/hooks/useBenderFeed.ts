import { useCallback, useEffect, useRef, useState } from 'react'
import { benderApi } from '@/services/benderApi'
import type { BenderPost, PaginatedResponse } from '@/types'
import { useCachedPublicContent } from './useCachedPublicContent'

type CachedFeed = PaginatedResponse<BenderPost> | BenderPost[]

export function useBenderFeed() {
  const cached = useCachedPublicContent<CachedFeed>(
    'bender:feed',
    useCallback(async () => (await benderApi.listPosts()).data, []),
  )
  const [posts, setPosts] = useState<BenderPost[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const generation = useRef(0)

  useEffect(() => {
    if (!cached.data) return
    generation.current += 1
    if (Array.isArray(cached.data)) {
      setPosts(cached.data)
      setCursor(null)
      setHasMore(false)
      return
    }
    setPosts(cached.data.items)
    setCursor(cached.data.next_cursor ?? null)
    setHasMore(cached.data.has_more)
  }, [cached.data])

  const loadNext = useCallback(async () => {
    if (!cursor || !hasMore || loadingMore) return
    const requestGeneration = generation.current
    setLoadingMore(true)
    try {
      const response = await benderApi.listPosts(cursor)
      if (generation.current !== requestGeneration) return
      setPosts((previous) => {
        const seen = new Set(previous.map((post) => post.id))
        return [...previous, ...response.data.items.filter((post) => !seen.has(post.id))]
      })
      setCursor(response.data.next_cursor ?? null)
      setHasMore(response.data.has_more)
    } finally {
      if (generation.current === requestGeneration) setLoadingMore(false)
    }
  }, [cursor, hasMore, loadingMore])

  const prepend = useCallback((post: BenderPost) => setPosts((previous) => [post, ...previous]), [])
  const remove = useCallback((id: string) => setPosts((previous) => previous.filter((post) => post.id !== id)), [])
  const patch = useCallback((id: string, values: Partial<BenderPost>) => {
    setPosts((previous) => previous.map((post) => post.id === id ? { ...post, ...values } : post))
  }, [])

  return {
    posts,
    cursor,
    hasMore,
    loading: cached.data === null,
    loadingMore,
    cachedAt: cached.cachedAt,
    source: cached.source,
    refresh: cached.refresh,
    loadNext,
    prepend,
    remove,
    patch,
  }
}
