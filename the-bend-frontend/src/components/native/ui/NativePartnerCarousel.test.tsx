import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Sponsor } from '@/types'
import { NativePartnerCarousel } from './NativePartnerCarousel'

const partner = (id: string, name: string, overrides: Partial<Sponsor> = {}): Sponsor => ({
  id,
  name,
  placement: 'homepage',
  ...overrides,
})

const partners = [
  partner('colonial-beach', 'Colonial Beach Brewing', {
    description: 'Locally brewed beer and community gatherings.',
    logo_url: '/uploads/colonial-beach.png',
    website_url: 'https://colonialbeachbrewing.com',
  }),
  partner('ericas-place', "Erica's Place", {
    description: 'Food and friendship in the heart of Westmoreland.',
  }),
  partner('housecall-pro', 'Housecall Pro', {
    description: 'All-in-one business solution for home service professionals.',
    logo_url: 'https://cdn.example.com/housecall-pro.png',
    website_url: 'https://housecallpro.com',
  }),
]

describe('NativePartnerCarousel', () => {
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('keeps API order and exposes exactly one active, full-card partner at a time', () => {
    const { container } = render(<NativePartnerCarousel partners={partners} />)
    const carousel = screen.getByRole('region', { name: 'Community partners carousel' })
    const slides = [...container.querySelectorAll<HTMLElement>('[data-partner-slide]')]

    expect(slides).toHaveLength(3)
    expect(slides.map((slide) => slide.textContent)).toEqual([
      expect.stringContaining('Colonial Beach Brewing'),
      expect.stringContaining("Erica's Place"),
      expect.stringContaining('Housecall Pro'),
    ])
    expect(slides.filter((slide) => slide.dataset.active === 'true')).toEqual([slides[0]])
    expect(slides[0]).toHaveAttribute('aria-label', 'Partner 1 of 3')
    expect(slides[1]).toHaveAttribute('aria-label', 'Partner 2 of 3')
    expect(slides[2]).toHaveAttribute('aria-label', 'Partner 3 of 3')
    expect(within(carousel).getByRole('status')).toHaveTextContent('Partner 1 of 3: Colonial Beach Brewing')
  })

  it('shows the approved eyebrow, resolved logo, name, and description', () => {
    render(<NativePartnerCarousel partners={[partners[0]!]} />)

    expect(screen.getByText('Community Partner')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'Colonial Beach Brewing' })).toBeInTheDocument()
    expect(screen.getByText('Locally brewed beer and community gatherings.')).toBeInTheDocument()
    expect(document.querySelector('.native-partner-logo img')).toHaveAttribute(
      'src',
      'http://localhost:8000/uploads/colonial-beach.png',
    )
    expect(document.querySelector('.native-partner-logo img')).toHaveAttribute('alt', '')
    expect(document.querySelector('.native-partner-logo img')).toHaveAttribute('width', '120')
    expect(document.querySelector('.native-partner-logo img')).toHaveAttribute('height', '64')
    expect(document.querySelector('.native-partner-logo img')).toHaveAttribute('loading', 'lazy')
  })

  it('uses an accessible initials fallback for missing and failed logos', () => {
    const { rerender } = render(<NativePartnerCarousel partners={[partners[1]!]} />)
    const missingFallback = document.querySelector('[data-partner-logo-fallback]')!
    expect(missingFallback).toHaveClass('native-partner-logo-fallback')
    expect(missingFallback).toHaveAttribute('aria-hidden', 'true')
    expect(missingFallback).toHaveTextContent('EP')

    rerender(<NativePartnerCarousel partners={[partners[2]!]} />)
    const image = document.querySelector('.native-partner-logo img')!
    expect(image.tagName).toBe('IMG')
    fireEvent.error(image)

    const failedFallback = document.querySelector('[data-partner-logo-fallback]')!
    expect(failedFallback.tagName).not.toBe('IMG')
    expect(failedFallback).toHaveClass('native-partner-logo-fallback')
    expect(failedFallback).toHaveTextContent('HP')
  })

  it('links the whole card only when the partner has a website', () => {
    const { rerender } = render(<NativePartnerCarousel partners={[partners[0]!]} />)
    const linkedCard = screen.getByRole('heading', { name: 'Colonial Beach Brewing' }).closest('a')

    expect(linkedCard).toHaveAttribute('href', 'https://colonialbeachbrewing.com/')
    expect(linkedCard).toHaveAttribute('target', '_blank')
    expect(linkedCard).toHaveAttribute('rel', 'noopener noreferrer')

    rerender(<NativePartnerCarousel partners={[partners[1]!]} />)
    expect(screen.getByRole('heading', { name: "Erica's Place" }).closest('a')).toBeNull()
    expect(screen.queryByRole('link', { name: /Erica's Place/i })).toBeNull()

    rerender(<NativePartnerCarousel partners={[partner('unsafe', 'Unsafe Partner', { website_url: ' javascript:alert(1) ' })]} />)
    expect(screen.queryByRole('link', { name: /Unsafe Partner/i })).toBeNull()

    rerender(<NativePartnerCarousel partners={[partner('www', 'WWW Partner', { website_url: ' www.example.com/path ' })]} />)
    expect(screen.getByRole('heading', { name: 'WWW Partner' }).closest('a')).toHaveAttribute('href', 'https://www.example.com/path')

    rerender(<NativePartnerCarousel partners={[partner('bare', 'Bare Host Partner', { website_url: 'example.com/path' })]} />)
    expect(screen.getByRole('heading', { name: 'Bare Host Partner' }).closest('a')).toHaveAttribute('href', 'https://example.com/path')

    rerender(<NativePartnerCarousel partners={[partner('credentials', 'Credentials Partner', { website_url: 'https://user:password@example.com/path' })]} />)
    expect(screen.queryByRole('link', { name: /Credentials Partner/i })).toBeNull()
  })

  it.each([
    'javascript://alert.example/path',
    'ftp://files.example/path',
    'data://payload.example/path',
    'javascript:123/path',
    'ftp:21/files',
    'data:443/payload',
  ])('keeps a scheme-like non-http website noninteractive: %s', (websiteUrl) => {
    render(<NativePartnerCarousel partners={[partner('unsafe-scheme', 'Unsafe Scheme Partner', { website_url: websiteUrl })]} />)

    expect(screen.queryByRole('link', { name: /Unsafe Scheme Partner/i })).toBeNull()
  })

  it.each([
    'http:80',
    'https:443/path',
    'http:/example.com',
    'https:\\\\example.com',
  ])('keeps http(s) input without an authority delimiter noninteractive: %s', (websiteUrl) => {
    render(<NativePartnerCarousel partners={[partner('malformed-http', 'Malformed HTTP Partner', { website_url: websiteUrl })]} />)

    expect(screen.queryByRole('link', { name: /Malformed HTTP Partner/i })).toBeNull()
  })

  it.each([
    '/example.com/path',
    '\\\\example.com/path',
    './example.com',
    '../example.com',
    '?next=example.com',
    '#example.com',
  ])('keeps a relative website prefix noninteractive: %s', (websiteUrl) => {
    render(<NativePartnerCarousel partners={[partner('relative', 'Relative Partner', { website_url: websiteUrl })]} />)

    expect(screen.queryByRole('link', { name: /Relative Partner/i })).toBeNull()
  })

  it('normalizes a bare host with a numeric port', () => {
    render(<NativePartnerCarousel partners={[partner('port', 'Port Partner', { website_url: 'example.com:8443/path' })]} />)

    expect(screen.getByRole('heading', { name: 'Port Partner' }).closest('a')).toHaveAttribute('href', 'https://example.com:8443/path')
  })

  it.each([
    ['192.0.2.10:8443/path', 'https://192.0.2.10:8443/path'],
    ['[2001:db8::1]:8443/path', 'https://[2001:db8::1]:8443/path'],
  ])('normalizes an unambiguous IP host with a numeric port: %s', (websiteUrl, expectedUrl) => {
    render(<NativePartnerCarousel partners={[partner('ip-port', 'IP Port Partner', { website_url: websiteUrl })]} />)

    expect(screen.getByRole('heading', { name: 'IP Port Partner' }).closest('a')).toHaveAttribute('href', expectedUrl)
  })

  it('updates the active slide and visual position dots from a manual horizontal swipe', async () => {
    const { container } = render(<NativePartnerCarousel partners={partners} />)
    const track = screen.getByRole('list', { name: 'Community partners' })
    const slides = [...container.querySelectorAll<HTMLElement>('[data-partner-slide]')]
    const dots = [...container.querySelectorAll<HTMLElement>('.native-partner-dot')]

    expect(dots).toHaveLength(3)
    expect(dots[0]).toHaveAttribute('data-active', 'true')
    expect(within(screen.getByRole('region', { name: 'Community partners carousel' })).getByRole('button', { name: 'Previous partner' })).toBeDisabled()
    expect(within(screen.getByRole('region', { name: 'Community partners carousel' })).getByRole('button', { name: 'Next partner' })).toBeEnabled()

    Object.defineProperty(track, 'clientWidth', { configurable: true, value: 320 })
    Object.defineProperty(track, 'scrollLeft', { configurable: true, value: 320, writable: true })
    fireEvent.scroll(track)

    await waitFor(() => expect(slides[1]).toHaveAttribute('data-active', 'true'))
    expect(dots[0]).toHaveAttribute('data-active', 'false')
    expect(dots[1]).toHaveAttribute('data-active', 'true')
    expect(screen.getByRole('status')).toHaveTextContent("Partner 2 of 3: Erica's Place")
    expect(screen.getByRole('button', { name: 'Previous partner' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Next partner' })).toBeEnabled()
  })

  it('renders controls only when there are at least two partners', () => {
    const { rerender } = render(<NativePartnerCarousel partners={[]} />)
    expect(screen.queryByRole('button', { name: 'Previous partner' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Next partner' })).toBeNull()

    rerender(<NativePartnerCarousel partners={[partners[0]!]} />)
    expect(screen.queryByRole('button', { name: 'Previous partner' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Next partner' })).toBeNull()

    rerender(<NativePartnerCarousel partners={partners} />)
    expect(screen.getByRole('button', { name: 'Previous partner' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next partner' })).toBeEnabled()
  })

  it('moves the physical track and announcement with Next and Previous', () => {
    const { container } = render(<NativePartnerCarousel partners={partners} />)
    const track = screen.getByRole('list', { name: 'Community partners' })
    const slides = [...container.querySelectorAll<HTMLElement>('[data-partner-slide]')]
    Object.defineProperty(slides[1], 'offsetLeft', { configurable: true, value: 320 })
    Object.defineProperty(slides[0], 'offsetLeft', { configurable: true, value: 0 })
    const scrollTo = vi.fn()
    Object.defineProperty(track, 'scrollTo', { configurable: true, value: scrollTo })

    fireEvent.click(screen.getByRole('button', { name: 'Next partner' }))
    expect(scrollTo).toHaveBeenCalledWith({ left: 320, behavior: 'smooth' })
    expect(screen.getByRole('status')).toHaveTextContent("Partner 2 of 3: Erica's Place")
    expect(screen.getByRole('button', { name: 'Previous partner' })).toBeEnabled()

    fireEvent.click(screen.getByRole('button', { name: 'Previous partner' }))
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 0, behavior: 'smooth' })
    expect(screen.getByRole('status')).toHaveTextContent('Partner 1 of 3: Colonial Beach Brewing')
  })

  it('disables Next at the final partner', () => {
    const { container } = render(<NativePartnerCarousel partners={partners} />)
    const track = screen.getByRole('list', { name: 'Community partners' })
    const slides = [...container.querySelectorAll<HTMLElement>('[data-partner-slide]')]
    Object.defineProperty(slides[1], 'offsetLeft', { configurable: true, value: 320 })
    Object.defineProperty(slides[2], 'offsetLeft', { configurable: true, value: 640 })
    Object.defineProperty(track, 'scrollTo', { configurable: true, value: vi.fn() })

    fireEvent.click(screen.getByRole('button', { name: 'Next partner' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next partner' }))
    expect(screen.getByRole('button', { name: 'Next partner' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Previous partner' })).toBeEnabled()
    expect(screen.getByRole('status')).toHaveTextContent('Partner 3 of 3: Housecall Pro')
  })

  it('uses auto scrolling when reduced motion is preferred', () => {
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: vi.fn(() => ({ matches: true })) })
    const { container } = render(<NativePartnerCarousel partners={partners} />)
    const track = screen.getByRole('list', { name: 'Community partners' })
    const slides = [...container.querySelectorAll<HTMLElement>('[data-partner-slide]')]
    Object.defineProperty(slides[1], 'offsetLeft', { configurable: true, value: 320 })
    const scrollTo = vi.fn()
    Object.defineProperty(track, 'scrollTo', { configurable: true, value: scrollTo })

    fireEvent.click(screen.getByRole('button', { name: 'Next partner' }))
    expect(scrollTo).toHaveBeenCalledWith({ left: 320, behavior: 'auto' })
  })

  it('does not create an autoplay timer', () => {
    vi.useFakeTimers()
    const intervalSpy = vi.spyOn(globalThis, 'setInterval')
    const { container } = render(<NativePartnerCarousel partners={partners} />)

    act(() => vi.advanceTimersByTime(60_001))

    expect(intervalSpy).not.toHaveBeenCalled()
    expect(container.querySelector('[data-partner-slide][data-active="true"]')).toHaveTextContent(
      'Colonial Beach Brewing',
    )
  })

  it('returns the visible track and announcement to the first partner when API order changes', async () => {
    const { container, rerender } = render(<NativePartnerCarousel partners={partners} />)
    const track = screen.getByRole('list', { name: 'Community partners' })
    Object.defineProperty(track, 'clientWidth', { configurable: true, value: 320 })
    Object.defineProperty(track, 'scrollLeft', { configurable: true, value: 320, writable: true })
    fireEvent.scroll(track)
    await waitFor(() => expect(container.querySelector('[data-partner-slide][data-active="true"]')).toHaveTextContent("Erica's Place"))

    rerender(<NativePartnerCarousel partners={[partners[2]!, partners[0]!]} />)

    await waitFor(() => expect(track.scrollLeft).toBe(0))
    expect(container.querySelector('[data-partner-slide][data-active="true"]')).toHaveTextContent('Housecall Pro')
    expect(screen.getByRole('status')).toHaveTextContent('Partner 1 of 2: Housecall Pro')
    expect(screen.getByRole('button', { name: 'Previous partner' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next partner' })).toBeEnabled()
  })

  it('omits pagination for one partner and the complete carousel for zero partners', () => {
    const { container, rerender } = render(<NativePartnerCarousel partners={[partners[0]!]} />)
    expect(container.querySelectorAll('[data-partner-slide]')).toHaveLength(1)
    expect(container.querySelector('.native-partner-pagination')).toBeNull()

    rerender(<NativePartnerCarousel partners={[]} />)
    expect(screen.queryByRole('region', { name: 'Community partners carousel' })).toBeNull()
    expect(container.querySelector('[data-partner-slide]')).toBeNull()
  })
})
