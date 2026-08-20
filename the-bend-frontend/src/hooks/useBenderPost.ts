import { useCallback, useEffect, useState } from 'react'
import { benderApi } from '@/services/benderApi'
import type { BenderPost } from '@/types'

export type BenderPostLoadStatus = 'idle' | 'loading' | 'success' | 'unavailable' | 'error'
export interface UseBenderPostResult { status: BenderPostLoadStatus; post: BenderPost | null; error: Error | null; retry(): void; patch(values: Partial<BenderPost>): void }

function statusOf(error: unknown): BenderPostLoadStatus {
  const status = (error as { response?: { status?: number } })?.response?.status
  return status && [400, 401, 403, 404, 422].includes(status) ? 'unavailable' : 'error'
}

export function useBenderPost(postId: string | null): UseBenderPostResult {
  const [state, setState] = useState<{ requestId: string | null; status: BenderPostLoadStatus; post: BenderPost | null; error: Error | null }>({ requestId: postId, status: postId ? 'loading' : 'idle', post: null, error: null })
  const [requestGeneration, setRequestGeneration] = useState(0)
  const retry = useCallback(() => { setRequestGeneration((previous) => previous + 1); setState({ requestId: postId, status: postId ? 'loading' : 'idle', post: null, error: null }) }, [postId])
  const patch = useCallback((values: Partial<BenderPost>) => setState((previous) => previous.post ? { ...previous, post: { ...previous.post, ...values } } : previous), [])
  useEffect(() => {
    if (!postId) return
    const controller = new AbortController(); let active = true
    Promise.resolve(benderApi.getPost(postId, { signal: controller.signal })).then((response) => {
      if (!active || controller.signal.aborted) return
      setState({ requestId: postId, status: 'success', post: response.data, error: null })
    }).catch((error: unknown) => {
      if (!active || controller.signal.aborted) return
      const status = statusOf(error); setState({ requestId: postId, status, post: null, error: status === 'error' ? new Error('Retry loading this post') : null })
    })
    return () => { active = false; controller.abort() }
  }, [postId, requestGeneration])
  const visibleState = state.requestId === postId ? state : { requestId: postId, status: postId ? 'loading' as const : 'idle' as const, post: null, error: null }
  return { status: visibleState.status, post: visibleState.post, error: visibleState.error, retry, patch }
}
