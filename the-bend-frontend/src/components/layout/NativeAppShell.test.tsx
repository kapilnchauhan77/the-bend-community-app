import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NativeAppShell } from './NativeAppShell'

vi.mock('@/deep-links/useDeepLinks', () => ({ useDeepLinks: () => undefined }))

describe('NativeAppShell', () => {
  afterEach(() => vi.restoreAllMocks())
  it('owns one native-app root and removes the visual viewport listener', () => {
    const add = vi.fn(); const remove = vi.fn()
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: { height: 700, offsetTop: 0, addEventListener: add, removeEventListener: remove } })
    const view = render(<MemoryRouter><NativeAppShell /></MemoryRouter>)
    expect(document.querySelectorAll('.native-app')).toHaveLength(1)
    view.unmount(); expect(remove).toHaveBeenCalledOnce()
  })
})
