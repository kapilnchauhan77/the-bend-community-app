import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import NativeExplorePage from './NativeExplorePage'

vi.mock('@/hooks/useNativeExplore', () => ({ useNativeExplore: () => ({ groups: [], typed: null, refreshAll: vi.fn() }) }))

afterEach(() => cleanup())

describe('NativeExplorePage', () => {
  it('renders the approved type chips without Talent', () => {
    render(<MemoryRouter><NativeExplorePage /></MemoryRouter>)
    for (const label of ['All', 'Listings', 'Businesses', 'Events', 'Volunteer']) expect(screen.getByRole('tab', { name: label })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Talent' })).not.toBeInTheDocument()
  })
})
