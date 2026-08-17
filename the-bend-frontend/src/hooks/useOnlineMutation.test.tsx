import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useOnlineMutation } from './useOnlineMutation'

let status: 'online' | 'offline' = 'offline'
const network = {
  getStatus: vi.fn(() => Promise.resolve(status)),
  addListener: vi.fn(async () => ({ remove: vi.fn() })),
}
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done }); return { promise, resolve } }
vi.mock('@/platform/createPlatformServices', () => ({ usePlatformServices: () => ({ network }) }))

describe('useOnlineMutation', () => {
  beforeEach(() => { status = 'offline'; vi.clearAllMocks() })

  it('blocks upload, post, interaction, message, report, endorsement, and event mutations with the stable offline error', async () => {
    const { result } = renderHook(() => useOnlineMutation())
    await waitFor(() => expect(result.current.ready).toBe(true))
    const api = vi.fn().mockResolvedValue(undefined)
    for (const category of ['upload', 'post', 'interaction', 'message', 'report', 'endorsement', 'event submit/create-update']) {
      await expect(result.current.run(api)).rejects.toThrow('OFFLINE_ACTION_UNAVAILABLE')
      expect(api, category).not.toHaveBeenCalled()
    }
  })

  it('executes only after the current network state is online', async () => {
    status = 'online'
    const { result } = renderHook(() => useOnlineMutation())
    await waitFor(() => expect(result.current.online).toBe(true))
    const api = vi.fn().mockResolvedValue('created')
    await expect(result.current.run(api)).resolves.toBe('created')
    expect(api).toHaveBeenCalledTimes(1)
  })

  it('falls back to a ready offline gate when initial status rejects', async () => {
    network.getStatus.mockRejectedValueOnce(new Error('native status unavailable'))
    const { result } = renderHook(() => useOnlineMutation())
    await waitFor(() => expect(result.current.ready).toBe(true))
    await expect(result.current.run(vi.fn())).rejects.toThrow('OFFLINE_ACTION_UNAVAILABLE')
  })

  it('still uses status when listener registration rejects', async () => {
    status = 'online'
    network.addListener.mockRejectedValueOnce(new Error('listener unavailable'))
    const { result } = renderHook(() => useOnlineMutation())
    await waitFor(() => expect(result.current.online).toBe(true))
    await expect(result.current.run(() => Promise.resolve('ok'))).resolves.toBe('ok')
  })

  it('removes a listener that resolves after unmount exactly once', async () => {
    const remove = vi.fn().mockResolvedValue(undefined)
    const listener = deferred<{ remove: typeof remove }>()
    network.addListener.mockReturnValueOnce(listener.promise)
    const { unmount } = renderHook(() => useOnlineMutation())
    unmount()
    await act(async () => { listener.resolve({ remove }); await listener.promise })
    await waitFor(() => expect(remove).toHaveBeenCalledTimes(1))
  })
})
