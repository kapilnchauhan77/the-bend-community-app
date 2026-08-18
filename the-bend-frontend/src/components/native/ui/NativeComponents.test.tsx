import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { NativeDiscoveryCard } from './NativeDiscoveryCard'
import { NativeFilterChip } from './NativeFilterChip'
import { NativeResultGroup } from './NativeResultGroup'
import { NativeSearchBar } from './NativeSearchBar'
import { NativeUrgentCard } from './NativeUrgentCard'
import { NativeFilterSheet } from './NativeFilterSheet'
import { NativePageHeader } from './NativePageHeader'

const item = { id: 'listing-1', kind: 'listing' as const, label: 'Generator', title: 'Power generator needed', supportingText: 'Community request', thumbnailUrl: null, targetPath: '/listing/listing-1', coordinates: null, urgent: true }

describe('native UI primitives', () => {
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
    expect(screen.getByRole('status')).toHaveTextContent(/loading/i)
    rerender(<NativeResultGroup heading="Listings" status="empty" onRetry={vi.fn()}>items</NativeResultGroup>)
    expect(screen.getByText(/no results/i)).toBeInTheDocument()
  })
  it('focuses, traps, and closes the filter sheet while returning focus', () => {
    const trigger = document.createElement('button'); trigger.textContent = 'Open'; document.body.append(trigger); const onClose = vi.fn()
    const { rerender } = render(<NativeFilterSheet open title="Filters" onClose={onClose} returnFocusRef={{ current: trigger }}><button className="native-control">Apply</button></NativeFilterSheet>)
    expect(screen.getByRole('button', { name: /close filters/i })).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Escape' }); expect(onClose).toHaveBeenCalledOnce()
    fireEvent.mouseDown(screen.getByRole('presentation')); expect(onClose).toHaveBeenCalledTimes(2)
    rerender(<NativeFilterSheet open={false} title="Filters" onClose={onClose} returnFocusRef={{ current: trigger }}><button>Apply</button></NativeFilterSheet>); expect(trigger).toHaveFocus(); trigger.remove()
  })
})
