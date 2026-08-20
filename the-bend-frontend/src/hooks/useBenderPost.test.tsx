import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BenderPost } from '@/types'
import { benderApi } from '@/services/benderApi'
import { useBenderPost } from './useBenderPost'

vi.mock('@/services/benderApi', () => ({ benderApi: { getPost: vi.fn() } }))

const post = (id: string): BenderPost => ({ id, caption: id, media_url: null, media_thumbnail_url: null, media_type: null, like_count: 0, comment_count: 0, viewer_has_liked: false, created_at: '2026-08-18T00:00:00Z', author: { id: `a-${id}`, name: id } })
const deferred = <T,>() => { let resolve!: (value: T) => void; let reject!: (error: unknown) => void; const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej }); return { promise, resolve, reject } }

describe('useBenderPost', () => {
  beforeEach(() => vi.clearAllMocks())
  it('is idle for a null id', () => expect(renderHook(() => useBenderPost(null)).result.current.status).toBe('idle'))

  it('aborts id changes and ignores stale completion', async () => {
    const first = deferred<{ data: BenderPost }>(); const second = deferred<{ data: BenderPost }>()
    vi.mocked(benderApi.getPost).mockReturnValueOnce(first.promise as never).mockReturnValueOnce(second.promise as never)
    const { result, rerender } = renderHook(({ id }) => useBenderPost(id), { initialProps: { id: 'one' } })
    rerender({ id: 'two' })
    expect(vi.mocked(benderApi.getPost).mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal)
    await act(async () => { first.resolve({ data: post('one') }); second.resolve({ data: post('two') }) })
    await waitFor(() => expect(result.current.post?.id).toBe('two'))
  })

  it('issues a new request when retry is called', async () => {
    const first = deferred<{ data: BenderPost }>(); const second = deferred<{ data: BenderPost }>()
    vi.mocked(benderApi.getPost).mockReturnValueOnce(first.promise as never).mockReturnValueOnce(second.promise as never)
    const { result } = renderHook(() => useBenderPost('one'))
    await waitFor(() => expect(benderApi.getPost).toHaveBeenCalledTimes(1))
    act(() => result.current.retry())
    await waitFor(() => expect(benderApi.getPost).toHaveBeenCalledTimes(2))
    await act(async () => { second.resolve({ data: post('one') }) })
    await waitFor(() => expect(result.current.status).toBe('success'))
  })

  it('aborts the active request on unmount', async () => {
    const request = deferred<{ data: BenderPost }>()
    vi.mocked(benderApi.getPost).mockReturnValue(request.promise as never)
    const { unmount } = renderHook(() => useBenderPost('one'))
    await waitFor(() => expect(benderApi.getPost).toHaveBeenCalledTimes(1))
    const signal = vi.mocked(benderApi.getPost).mock.calls[0][1]?.signal
    unmount()
    expect(signal?.aborted).toBe(true)
  })

  it.each([400, 401, 403, 404, 422])('maps %i to unavailable', async (status) => {
    vi.mocked(benderApi.getPost).mockRejectedValue({ response: { status } })
    const { result } = renderHook(() => useBenderPost('one'))
    await waitFor(() => expect(result.current.status).toBe('unavailable'))
    expect(result.current.retry).not.toThrow()
  })

  it.each([500, 503])('maps %i to retryable error', async (status) => {
    vi.mocked(benderApi.getPost).mockRejectedValue({ response: { status } })
    const { result } = renderHook(() => useBenderPost('one'))
    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.error?.message).toBe('Retry loading this post')
  })

  it('patches a successfully loaded post', async () => {
    vi.mocked(benderApi.getPost).mockResolvedValueOnce({ data: post('one') })
    const { result } = renderHook(() => useBenderPost('one'))
    await waitFor(() => expect(result.current.status).toBe('success'))
    act(() => result.current.patch({ caption: 'updated' }))
    expect(result.current.post?.caption).toBe('updated')
  })
})
