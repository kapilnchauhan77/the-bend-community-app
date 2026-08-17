import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useOnlineMutation } from './useOnlineMutation'

let status: 'online' | 'offline' = 'offline'
const network = {
  getStatus: vi.fn(() => Promise.resolve(status)),
  addListener: vi.fn(async () => ({ remove: vi.fn() })),
}
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
})
