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

  it('keeps typed input visible and offers derived business types', () => {
    render(<MemoryRouter initialEntries={['/explore?type=businesses']}><NativeExplorePage /></MemoryRouter>)
    const input = screen.getByRole('searchbox')
    fireEvent.change(input, { target: { value: 'tractor' } })
    expect(input).toHaveValue('tractor')
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
    expect(screen.getAllByRole('button', { name: 'Farm' })).toHaveLength(2)
  })
})
