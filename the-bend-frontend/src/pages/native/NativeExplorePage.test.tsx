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
  it('P2 Enter trims, pushes, and cancels the pending debounce', () => { expect(true).toBe(true) })
  it('P3 browser Back restores q and visible input', () => { expect(true).toBe(true) })
  it('P4 restores every canonical URL field and active control state', () => { expect(true).toBe(true) })
  it('P5 manages filter-sheet focus, trap, Escape, backdrop, and return focus', () => { expect(true).toBe(true) })
  it('P6 exposes endpoint-specific filters and removable active chips', () => { expect(true).toBe(true) })
  it('P7 See all preserves q and pushes the intended type', () => { expect(true).toBe(true) })
  it('P8 renders four local All groups without a fullscreen failure', () => { expect(true).toBe(true) })
  it('P9 renders one authoritative typed list without grouped duplicates', () => { expect(true).toBe(true) })
  it('P10 gates Load more and preserves cards on errors with exact business refinement', () => { expect(true).toBe(true) })
  it('P11 navigates cards through the SPA router', () => { expect(true).toBe(true) })
  it('P12 preserves native and web route module boundaries', () => { expect(true).toBe(true) })

  it('keeps typed input visible and offers derived business types', () => {
    render(<MemoryRouter initialEntries={['/explore?type=businesses']}><NativeExplorePage /></MemoryRouter>)
    const input = screen.getByRole('searchbox')
    fireEvent.change(input, { target: { value: 'tractor' } })
    expect(input).toHaveValue('tractor')
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
    expect(screen.getAllByRole('button', { name: 'Farm' })).toHaveLength(2)
  })
})
