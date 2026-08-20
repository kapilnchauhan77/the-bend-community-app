import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BenderCaptionLinkCard } from './BenderCaptionLinkCard'

const browserOpen = vi.fn(() => Promise.resolve())
vi.mock('@/platform/createPlatformServices', () => ({
  usePlatformServices: () => ({ browser: { open: browserOpen } }),
}))

describe('BenderCaptionLinkCard', () => {
  afterEach(cleanup)
  it('shows the safe URL hostname and original URL and opens it through browser services', () => {
    render(<BenderCaptionLinkCard caption="Read https://example.com/path?a=1" />)
    const link = screen.getByRole('link', { name: /example\.com/i })
    expect(link).toHaveAttribute('href', 'https://example.com/path?a=1')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
    expect(screen.getByText('example.com')).toBeInTheDocument()
    expect(screen.getByText('https://example.com/path?a=1')).toBeInTheDocument()
    fireEvent.click(link)
    expect(browserOpen).toHaveBeenCalledWith('https://example.com/path?a=1')
  })

  it('rejects unsafe captions without rendering a link', () => {
    render(<BenderCaptionLinkCard caption="Try javascript:alert(1)" />)
    expect(screen.queryByRole('link')).toBeNull()
  })
})
