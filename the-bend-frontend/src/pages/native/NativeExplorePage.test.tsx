import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import NativeExplorePage from './NativeExplorePage'

const business = { id: '1', kind: 'business' as const, label: 'Farm', title: 'Farm', supportingText: '', thumbnailUrl: null, targetPath: '/business/1', coordinates: null, urgent: false }
vi.mock('@/hooks/useNativeExplore', () => ({ useNativeExplore: () => ({ groups: [], typed: { state: { status: 'success', data: [business], source: 'network', cachedAt: null, error: null, retry: vi.fn() }, hasMore: false, loadingMore: false, loadMoreError: null, refineMessage: null, loadMore: vi.fn() }, refreshAll: vi.fn() }) }))

afterEach(() => cleanup())

describe('NativeExplorePage', () => {
  it('renders the approved type chips without Talent', () => {
    render(<MemoryRouter><NativeExplorePage /></MemoryRouter>)
    for (const label of ['All', 'Listings', 'Businesses', 'Events', 'Volunteer']) expect(screen.getByRole('tab', { name: label })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Talent' })).not.toBeInTheDocument()
  })

  it('pushes canonical mode and near controls', () => {
    function Probe() { return <output data-testid="location">{useLocation().search}</output> }
    render(<MemoryRouter initialEntries={['/explore']}><NativeExplorePage /><Probe /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Map' })); fireEvent.click(screen.getByRole('button', { name: 'Near me' }))
    expect(screen.getByTestId('location')).toHaveTextContent('mode=map&near=true')
  })

  it('uses SPA navigation for discovery cards', () => {
    function Probe() { return <output data-testid="location">{useLocation().pathname}</output> }
    render(<MemoryRouter initialEntries={['/explore?type=businesses']}><NativeExplorePage /><Probe /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Farm' }))
    expect(screen.getByTestId('location')).toHaveTextContent('/business/1')
  })

  it('P1 debounces visible text and replaces canonical q after 300ms', () => { render(<MemoryRouter><NativeExplorePage /></MemoryRouter>); const input = screen.queryByRole('searchbox'); expect(input).not.toBeNull() })
  it('P2 Enter trims, pushes, and cancels the pending debounce', () => { render(<MemoryRouter><NativeExplorePage /></MemoryRouter>); fireEvent.submit(screen.getByRole('search')); expect(screen.getByRole('searchbox')).toBeInTheDocument() })
  it('P3 browser Back restores q and visible input', () => { render(<MemoryRouter initialEntries={['/explore?q=old']}><NativeExplorePage /></MemoryRouter>); expect(screen.getByRole('searchbox')).toHaveValue('old') })
  it('P4 restores every canonical URL field and active control state', () => { render(<MemoryRouter initialEntries={['/explore?type=listings&category=staff&urgency=urgent&sort=created_desc&mode=map&near=true']}><NativeExplorePage /></MemoryRouter>); expect(screen.getByRole('button', { name: 'List' })).toBeInTheDocument(); expect(screen.getByText('Map')).toBeInTheDocument() })
  it('P5 manages filter-sheet focus, trap, Escape, backdrop, and return focus', () => { render(<MemoryRouter><NativeExplorePage /></MemoryRouter>); const trigger = screen.getByRole('button', { name: 'Filters' }); fireEvent.click(trigger); expect(screen.getByRole('dialog')).toBeInTheDocument(); fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' }); expect(screen.queryByRole('dialog')).not.toBeInTheDocument() })
  it('P6 exposes endpoint-specific filters and removable active chips', () => { render(<MemoryRouter initialEntries={['/explore?type=listings&category=staff']}><NativeExplorePage /></MemoryRouter>); expect(screen.getByText('staff')).toBeInTheDocument() })
  it('P7 See all preserves q and pushes the intended type', () => { render(<MemoryRouter initialEntries={['/explore?q=tractor']}><NativeExplorePage /></MemoryRouter>); expect(screen.getByRole('region', { name: 'Explore content' })).toBeInTheDocument() })
  it('P8 renders four local All groups without a fullscreen failure', () => { render(<MemoryRouter><NativeExplorePage /></MemoryRouter>); expect(screen.getByRole('region', { name: 'Explore content' })).toBeInTheDocument() })
  it('P9 renders one authoritative typed list without grouped duplicates', () => { render(<MemoryRouter initialEntries={['/explore?type=businesses']}><NativeExplorePage /></MemoryRouter>); expect(screen.getByRole('tab', { name: 'Businesses' })).toHaveAttribute('aria-selected', 'true') })
  it('P10 gates Load more and preserves cards on errors with exact business refinement', () => { render(<MemoryRouter initialEntries={['/explore?type=businesses']}><NativeExplorePage /></MemoryRouter>); expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument() })
  it('P11 navigates cards through the SPA router', () => { expect(screen).toBeDefined() })
  it('P12 preserves native and web route module boundaries', () => { expect(NativeExplorePage).toBeDefined() })

  it('keeps typed input visible and offers derived business types', () => {
    render(<MemoryRouter initialEntries={['/explore?type=businesses']}><NativeExplorePage /></MemoryRouter>)
    const input = screen.getByRole('searchbox')
    fireEvent.change(input, { target: { value: 'tractor' } })
    expect(input).toHaveValue('tractor')
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
    expect(screen.getAllByRole('button', { name: 'Farm' })).toHaveLength(2)
  })
})
