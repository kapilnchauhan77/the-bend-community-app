import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { PostActionSheet } from './PostActionSheet'

vi.mock('@/stores/authStore', () => ({ useAuthStore: (selector: (s: { isAuthenticated: boolean }) => unknown) => selector({ isAuthenticated: false }) }))
const selection = vi.fn(async () => undefined)
vi.mock('@/platform/createPlatformServices', () => ({ usePlatformServices: () => ({ haptics: { selection, impact: vi.fn(async () => undefined), success: vi.fn(async () => undefined) } }) }))

describe('PostActionSheet create semantics', () => {
  it('uses Create wording and allowlisted action labels', () => {
    render(<MemoryRouter><PostActionSheet open onClose={vi.fn()} /></MemoryRouter>)
    expect(screen.getByText('What do you want to create?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Offer something' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Request something' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Share on Bender' })).toBeInTheDocument()
  })
  it('selects an action with haptic feedback before continuation', () => {
    selection.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Offer something' }))
    expect(selection).toHaveBeenCalledOnce()
  })
})
