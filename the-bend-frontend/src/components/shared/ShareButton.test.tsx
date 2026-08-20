import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ShareButton } from './ShareButton'

const share = vi.fn().mockResolvedValue('shared')
const originalUserAgent = navigator.userAgent
const originalNavigatorShare = navigator.share
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: vi.fn(() => false) } }))
vi.mock('@/platform/createPlatformServices', () => ({ usePlatformServices: () => ({ share: { share } }) }))

import { Capacitor } from '@capacitor/core'

describe('ShareButton URL resolution', () => {
  afterEach(() => {
    cleanup()
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false)
    share.mockClear()
    Object.defineProperty(window, 'location', { configurable: true, value: { origin: 'http://localhost' } })
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: originalUserAgent })
    if (originalNavigatorShare === undefined) delete (navigator as { share?: unknown }).share
    else Object.defineProperty(navigator, 'share', { configurable: true, value: originalNavigatorShare })
  })

  it('uses the fixed public origin for native relative URLs', async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
    Object.defineProperty(window, 'location', { configurable: true, value: { origin: 'capacitor://localhost' } })
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'iPhone' })
    render(<ShareButton url="/listing/1" title="Listing" />)
    fireEvent.click(screen.getByRole('button', { name: 'Share' }))
    await waitFor(() => expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://westmoreland.bend.community/listing/1' })))
  })

  it('keeps web relative URLs on the window origin', async () => {
    Object.defineProperty(window, 'location', { configurable: true, value: { origin: 'https://web.example' } })
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'iPhone' })
    Object.defineProperty(navigator, 'share', { configurable: true, value: vi.fn() })
    render(<ShareButton url="/business/1" title="Business" />)
    fireEvent.click(screen.getByRole('button', { name: 'Share' }))
    await waitFor(() => expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://web.example/business/1' })))
  })

  it.each(['https://other.example/event/1', 'HTTP://other.example/event/1', 'HTTPS://other.example/event/1'])('keeps absolute HTTP and HTTPS URL %s unchanged', async (url) => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'iPhone' })
    render(<ShareButton url={url} title="Event" />)
    fireEvent.click(screen.getByRole('button', { name: 'Share' }))
    await waitFor(() => expect(share).toHaveBeenCalledWith(expect.objectContaining({ url })))
  })

  it('rejects lookalike schemes instead of treating them as absolute URLs', () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
    expect(() => render(<ShareButton url="httpx://evil.example/post" title="Unsafe" />)).toThrow(TypeError)
  })
})
