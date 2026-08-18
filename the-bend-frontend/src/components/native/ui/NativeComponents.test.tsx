import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { NativeDiscoveryCard } from './NativeDiscoveryCard'
import { NativeFilterChip } from './NativeFilterChip'
import { NativeResultGroup } from './NativeResultGroup'
import { NativeSearchBar } from './NativeSearchBar'
import { NativeUrgentCard } from './NativeUrgentCard'
import { NativeFilterSheet } from './NativeFilterSheet'
import { NativePageHeader } from './NativePageHeader'

const item = { id: 'listing-1', kind: 'listing' as const, label: 'Generator', title: 'Power generator needed', supportingText: 'Community request', thumbnailUrl: null, targetPath: '/listing/listing-1', coordinates: null, urgent: true }
const nativeCss = readFileSync('src/styles/native.css', 'utf8')

describe('native UI primitives', () => {
  afterEach(cleanup)
  it('controls search submit and clear through presentation callbacks', () => {
    const onChange = vi.fn(); const onSubmit = vi.fn(); const onClear = vi.fn()
    render(<NativeSearchBar value="books" label="Search" placeholder="Search listings" onChange={onChange} onSubmit={onSubmit} onClear={onClear} />)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'book' } }); fireEvent.submit(screen.getByRole('searchbox').closest('form')!)
    fireEvent.click(screen.getByRole('button', { name: /clear/i }))
    expect(onChange).toHaveBeenCalledWith('book'); expect(onSubmit).toHaveBeenCalledOnce(); expect(onClear).toHaveBeenCalledOnce()
  })
  it('announces urgency and preserves a direct destination', () => {
    const onOpen = vi.fn(); render(<NativeUrgentCard item={item} onOpen={onOpen} />)
    expect(screen.getByText(/urgent need/i)).toBeInTheDocument(); fireEvent.click(screen.getByRole('button', { name: /generator/i })); expect(onOpen).toHaveBeenCalledWith('/listing/listing-1')
  })
  it('labels an active removable filter', () => {
    const onRemove = vi.fn(); render(<NativeFilterChip label="Urgent" selected removable onRemove={onRemove} />)
    fireEvent.click(screen.getByRole('button', { name: /remove urgent filter/i })); expect(onRemove).toHaveBeenCalledOnce()
  })
  it('renders result status, one h2, and retry action', () => {
    const onRetry = vi.fn(); render(<NativeResultGroup heading="Listings" status="error" onRetry={onRetry}>children</NativeResultGroup>)
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(1); fireEvent.click(screen.getByRole('button', { name: /retry/i })); expect(onRetry).toHaveBeenCalledOnce()
  })
  it('sets fixed image dimensions on discovery cards', () => {
    render(<NativeDiscoveryCard item={{ ...item, urgent: false, thumbnailUrl: 'https://example.com/a.jpg' }} onOpen={vi.fn()} />)
    expect(screen.getByRole('img')).toHaveAttribute('width', '96'); expect(screen.getByRole('img')).toHaveAttribute('height', '96')
  })
  it('keeps interactive targets at least 44 points and includes the full wordmark', () => {
    const onRemove = vi.fn()
    render(<><NativeFilterChip label="Urgent" removable onRemove={onRemove} /><NativePageHeader title="Home" /></>)
    expect(screen.getAllByRole('button', { name: /remove urgent filter/i }).at(-1)).toHaveClass('native-control')
    expect(screen.getByLabelText('The Bend Community')).toHaveTextContent('THE BEND')
  })
  it('renders loading and empty result states', () => {
    const { rerender } = render(<NativeResultGroup heading="Listings" status="loading" onRetry={vi.fn()}>items</NativeResultGroup>)
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
    rerender(<NativeResultGroup heading="Listings" status="empty" onRetry={vi.fn()}>items</NativeResultGroup>)
    expect(screen.getByText(/no results/i)).toBeInTheDocument()
  })

  it('uses a skeleton for section-local loading feedback', () => {
    render(<NativeResultGroup heading="Loading" status="loading" onRetry={vi.fn()}>{null}</NativeResultGroup>)
    expect(document.querySelector('.native-skeleton')).toHaveClass('native-skeleton')
  })
  it('exposes one concise loading announcement and keeps the skeleton decorative', () => {
    render(<NativeResultGroup heading="Loading" status="loading" onRetry={vi.fn()}>{null}</NativeResultGroup>)
    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(screen.getByRole('status')).toHaveTextContent('Loading…')
    expect(document.querySelector('.native-skeleton')).toHaveAttribute('aria-hidden', 'true')
  })

  it('marks discovery images as lazy', () => {
    render(<NativeDiscoveryCard item={{ ...item, thumbnailUrl: '/image.jpg' }} onOpen={vi.fn()} />)
    expect(screen.getByRole('img')).toHaveAttribute('loading', 'lazy')
  })
  it('defines responsive contracts for long native content and 44-point controls', () => {
    expect(nativeCss).toMatch(/\.native-app \.native-filter-chip[\s\S]*display:\s*inline-flex/)
    expect(nativeCss).toMatch(/\.native-app \.native-filter-chip[\s\S]*max-width:\s*100%/)
    expect(nativeCss).toMatch(/\.native-app \.native-filter-chip[\s\S]*overflow-wrap:\s*anywhere/)
    expect(nativeCss).toMatch(/\.native-app \.native-filter-chip > button[\s\S]*width:\s*44px[\s\S]*height:\s*44px/)
    expect(nativeCss).toMatch(/\.native-app \.native-discovery-card[\s\S]*min-width:\s*0/)
    expect(nativeCss).toMatch(/\.native-app \.native-urgent-card[\s\S]*min-width:\s*0/)
    expect(nativeCss).toMatch(/\.native-app \.native-discovery-card img[\s\S]*object-fit:\s*cover/)
    expect(nativeCss).toMatch(/\.native-app \.native-thumbnail[\s\S]*width:\s*96px[\s\S]*height:\s*96px/)
    expect(nativeCss).toMatch(/\.native-app \.native-search-bar[\s\S]*min-width:\s*0/)
    expect(nativeCss).toMatch(/\.native-app \.native-search-bar input[\s\S]*min-width:\s*0/)
    expect(nativeCss).toMatch(/\.native-app \.native-search-bar button[\s\S]*width:\s*44px[\s\S]*height:\s*44px/)
    expect(nativeCss).toMatch(/\.native-app \.native-(page-header|section-header|quick-action|map-marker-list)[\s\S]*overflow-wrap:\s*anywhere/)
  })
  it('keeps extreme untrusted labels and reserved image placeholders in the DOM', () => {
    const longText = 'A'.repeat(320)
    const onOpen = vi.fn()
    render(<><NativeFilterChip label={longText} removable onRemove={vi.fn()} /><NativeDiscoveryCard item={{ ...item, title: longText, supportingText: longText, thumbnailUrl: null }} onOpen={onOpen} /><NativeUrgentCard item={{ ...item, title: longText, supportingText: longText }} onOpen={onOpen} /><NativeSearchBar value={longText} label="Search" placeholder="Search" onChange={vi.fn()} onSubmit={vi.fn()} onClear={vi.fn()} /><NativePageHeader title={longText} /></>)
    expect(screen.getByText(longText, { selector: '.native-filter-chip' })).toBeInTheDocument()
    expect(screen.getAllByText(longText).length).toBeGreaterThanOrEqual(4)
    expect(document.querySelector('.native-thumbnail')).toBeInTheDocument()
    expect(screen.getByRole('searchbox')).toHaveValue(longText)
    expect(screen.getByRole('button', { name: /clear search/i })).toHaveClass('native-control')
  })
  it('uses the same reserved 96-point contract for discovery image and placeholder variants', () => {
    const { rerender } = render(<NativeDiscoveryCard item={{ ...item, thumbnailUrl: '/image.jpg' }} onOpen={vi.fn()} />)
    const image = screen.getByRole('img')
    expect(image).toHaveAttribute('width', '96')
    expect(image).toHaveAttribute('height', '96')
    expect(image).toHaveAttribute('loading', 'lazy')
    rerender(<NativeDiscoveryCard item={{ ...item, thumbnailUrl: null }} onOpen={vi.fn()} />)
    expect(document.querySelector('.native-thumbnail')).toHaveAttribute('aria-hidden', 'true')
  })
  it('focuses, traps, and closes the filter sheet while returning focus', () => {
    const trigger = document.createElement('button'); trigger.textContent = 'Open'; document.body.append(trigger); const onClose = vi.fn()
    const { rerender } = render(<NativeFilterSheet open title="Filters" onClose={onClose} returnFocusRef={{ current: trigger }}><button className="native-control">Apply</button></NativeFilterSheet>)
    const close = screen.getByRole('button', { name: /close filters/i }); const apply = screen.getByRole('button', { name: 'Apply' })
    expect(close).toHaveFocus(); apply.focus(); fireEvent.keyDown(document, { key: 'Tab' }); expect(close).toHaveFocus(); close.focus(); fireEvent.keyDown(document, { key: 'Tab', shiftKey: true }); expect(apply).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Escape' }); expect(onClose).toHaveBeenCalledOnce()
    fireEvent.mouseDown(screen.getByRole('presentation')); expect(onClose).toHaveBeenCalledTimes(2)
    rerender(<NativeFilterSheet open={false} title="Filters" onClose={onClose} returnFocusRef={{ current: trigger }}><button>Apply</button></NativeFilterSheet>); expect(trigger).toHaveFocus(); trigger.remove()
  })
})
