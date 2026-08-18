import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import NativeExplorePage from './NativeExplorePage'

vi.mock('@/hooks/useNativeExplore', () => ({ useNativeExplore: () => ({ groups: [{ kind: 'business', heading: 'Businesses', state: { status: 'success', data: [{ id: '1', kind: 'business', label: 'Farm', title: 'Farm', supportingText: '', thumbnailUrl: null, targetPath: '/business/1', coordinates: null, urgent: false }], source: 'network', cachedAt: null, error: null, retry: vi.fn() } }], typed: null, refreshAll: vi.fn() }) }))

afterEach(() => cleanup())

describe('NativeExplorePage', () => {
  it('renders the approved type chips without Talent', () => {
    render(<MemoryRouter><NativeExplorePage /></MemoryRouter>)
    for (const label of ['All', 'Listings', 'Businesses', 'Events', 'Volunteer']) expect(screen.getByRole('tab', { name: label })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Talent' })).not.toBeInTheDocument()
  })

  it('keeps typed input visible and offers derived business types', () => {
    render(<MemoryRouter initialEntries={['/explore?type=businesses']}><NativeExplorePage /></MemoryRouter>)
    const input = screen.getByRole('searchbox')
    fireEvent.change(input, { target: { value: 'tractor' } })
    expect(input).toHaveValue('tractor')
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
    expect(screen.getByRole('button', { name: 'Farm' })).toBeInTheDocument()
  })
})
