import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ShareButton } from './ShareButton'

const share = vi.fn().mockResolvedValue('shared')
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: vi.fn(() => false) } }))
vi.mock('@/platform/createPlatformServices', () => ({ usePlatformServices: () => ({ share: { share } }) }))

import { Capacitor } from '@capacitor/core'

describe('ShareButton URL resolution', () => {
  afterEach(() => {
    cleanup()
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false)
    share.mockClear()
    Object.defineProperty(window, 'location', { configurable: true, value: { origin: 'http://localhost' } })
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

  it('keeps absolute HTTP and HTTPS URLs unchanged', async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'iPhone' })
    render(<ShareButton url="https://other.example/event/1" title="Event" />)
    fireEvent.click(screen.getByRole('button', { name: 'Share' }))
    await waitFor(() => expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://other.example/event/1' })))
  })
})
