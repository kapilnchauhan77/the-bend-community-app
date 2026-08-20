import { useCallback, useEffect, useRef, useState } from 'react'
import { benderApi } from '@/services/benderApi'
import type { BenderPost } from '@/types'

export type BenderPostLoadStatus = 'idle' | 'loading' | 'success' | 'unavailable' | 'error'
export interface UseBenderPostResult { status: BenderPostLoadStatus; post: BenderPost | null; error: Error | null; retry(): void; patch(values: Partial<BenderPost>): void }

function statusOf(error: unknown): BenderPostLoadStatus {
  const status = (error as { response?: { status?: number } })?.response?.status
  return status && [400, 401, 403, 404, 422].includes(status) ? 'unavailable' : 'error'
}

export function useBenderPost(postId: string | null): UseBenderPostResult {
  const [state, setState] = useState<{ status: BenderPostLoadStatus; post: BenderPost | null; error: Error | null }>({ status: postId ? 'loading' : 'idle', post: null, error: null })
  const retryToken = useRef(0)
  const retry = useCallback(() => { retryToken.current += 1; setState({ status: postId ? 'loading' : 'idle', post: null, error: null }) }, [postId])
  const patch = useCallback((values: Partial<BenderPost>) => setState((previous) => previous.post ? { ...previous, post: { ...previous.post, ...values } } : previous), [])
  useEffect(() => {
    if (!postId) { setState({ status: 'idle', post: null, error: null }); return }
    const controller = new AbortController(); const generation = retryToken.current
    setState({ status: 'loading', post: null, error: null })
    Promise.resolve(benderApi.getPost(postId, { signal: controller.signal })).then((response) => {
      if (controller.signal.aborted || generation !== retryToken.current) return
      setState({ status: 'success', post: response.data, error: null })
    }).catch((error: unknown) => {
      if (controller.signal.aborted || generation !== retryToken.current) return
      const status = statusOf(error); setState({ status, post: null, error: status === 'error' ? new Error('Retry loading this post') : null })
    })
    return () => controller.abort()
  }, [postId, retryToken.current])
  return { ...state, retry, patch }
}
