import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useBenderDraft } from './useBenderDraft'

const store = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn(), remove: vi.fn() }))
vi.mock('@/drafts/DraftStore', () => ({ draftStore: store }))
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done }); return { promise, resolve } }

describe('useBenderDraft', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    store.load.mockResolvedValue(null)
    store.save.mockResolvedValue(undefined)
    store.remove.mockResolvedValue(undefined)
  })

  it('resets and hydrates from storage on every composer open without pre-hydration autosave', async () => {
    store.load.mockResolvedValueOnce({ fields: { caption: 'First draft' }, localMediaUris: [] })
    const { result, rerender } = renderHook(({ open }) => useBenderDraft(open), { initialProps: { open: true } })
    await waitFor(() => expect(result.current.caption).toBe('First draft'))
    expect(store.save).toHaveBeenCalledWith('create-bender-post', { fields: { caption: 'First draft' }, localMediaUris: [] })

    rerender({ open: false })
    store.load.mockResolvedValueOnce({ fields: { caption: 'Second draft' }, localMediaUris: ['file://second.jpg'] })
    rerender({ open: true })
    expect(result.current.caption).toBe('')
    expect(result.current.pending).toBeNull()
    await waitFor(() => expect(result.current.caption).toBe('Second draft'))
    expect(result.current.pending?.url).toBe('file://second.jpg')
    expect(store.load).toHaveBeenCalledTimes(2)
  })

  it('ignores a late storage load after the composer closes', async () => {
    const load = deferred<{ fields: { caption: string }; localMediaUris: string[] } | null>()
    store.load.mockReturnValueOnce(load.promise)
    const { result, rerender } = renderHook(({ open }) => useBenderDraft(open), { initialProps: { open: true } })
    rerender({ open: false })
    await act(async () => { load.resolve({ fields: { caption: 'Late draft' }, localMediaUris: [] }); await load.promise })
    expect(result.current.caption).toBe('')
    expect(store.save).not.toHaveBeenCalled()
  })

  it('does not overwrite the stored draft before hydration completes', async () => {
    const load = deferred<{ fields: { caption: string }; localMediaUris: string[] } | null>()
    store.load.mockReturnValueOnce(load.promise)
    const { result } = renderHook(() => useBenderDraft(true))
    act(() => result.current.setCaption('Typed while loading'))
    expect(store.save).not.toHaveBeenCalled()
    await act(async () => { load.resolve({ fields: { caption: 'Stored' }, localMediaUris: [] }); await load.promise })
    await waitFor(() => expect(result.current.caption).toBe('Typed while loading'))
    await waitFor(() => expect(store.save).toHaveBeenCalledWith('create-bender-post', { fields: { caption: 'Typed while loading' }, localMediaUris: [] }))
  })

  it('serializes discard after autosave so removal wins and clears local state', async () => {
    store.load.mockResolvedValueOnce({ fields: { caption: 'Stored' }, localMediaUris: [] })
    const save = deferred<void>()
    store.save.mockReturnValueOnce(save.promise)
    const { result } = renderHook(() => useBenderDraft(true))
    await waitFor(() => expect(result.current.caption).toBe('Stored'))
    act(() => result.current.setCaption('Edited'))
    await waitFor(() => expect(store.save).toHaveBeenCalled())
    let discard!: Promise<void>
    act(() => { discard = result.current.discard() })
    expect(store.remove).not.toHaveBeenCalled()
    await act(async () => { save.resolve(undefined); await discard })
    expect(store.remove).toHaveBeenCalledWith('create-bender-post')
    expect(result.current.caption).toBe('')
    expect(result.current.pending).toBeNull()
  })
})
