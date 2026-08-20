import { describe, expect, it, vi } from 'vitest'
import api from './api'
import { benderApi } from './benderApi'

vi.mock('./api', () => ({ default: { get: vi.fn() } }))

describe('benderApi.getPost', () => {
  it('requests the encoded focused post endpoint and forwards AbortSignal', () => {
    const signal = new AbortController().signal
    benderApi.getPost('a/b c', { signal })
    expect(api.get).toHaveBeenCalledWith('/bender/posts/a%2Fb%20c', { signal })
  })
})
