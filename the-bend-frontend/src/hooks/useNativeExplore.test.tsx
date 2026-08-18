import { describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useNativeExplore } from './useNativeExplore'

vi.mock('./useCachedPublicContent', () => ({ useCachedPublicContent: () => ({ status: 'empty', data: [], source: null, cachedAt: null, error: null, refresh: vi.fn() }) }))

describe('useNativeExplore', () => {
  it('exposes grouped All results and a typed result model', () => {
    const { result } = renderHook(() => useNativeExplore({ q: '', type: 'all', category: null, urgency: null, sort: null, mode: 'list', near: false }))
    expect(result.current.groups).toHaveLength(4)
    expect(result.current.typed).toBeNull()
    expect(result.current.refreshAll).toBeTypeOf('function')
  })

})
