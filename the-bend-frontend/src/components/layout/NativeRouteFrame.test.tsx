import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NativeRouteFrame } from './NativeRouteFrame'

const navigateMock = vi.hoisted(() => vi.fn())
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => navigateMock }
})

afterEach(cleanup)

describe('NativeRouteFrame', () => {
  it('renders a non-heading title and an accessible back target', () => {
    render(<MemoryRouter initialEntries={['/focused']}><NativeRouteFrame title="Focused" fallbackPath="/bender"><h1>Post</h1></NativeRouteFrame></MemoryRouter>)
    expect(screen.getByTestId('native-route-title').tagName).toBe('SPAN')
    expect(screen.getByRole('heading', { name: 'Post' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /back/i })).toHaveStyle({ minWidth: '44px', minHeight: '44px' })
  })

  it('uses history when the router has a prior entry', () => {
    window.history.replaceState({ idx: 1 }, '', '/focused')
    render(<MemoryRouter><NativeRouteFrame title="Focused" fallbackPath="/bender"><div /></NativeRouteFrame></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: /back/i }))
    expect(navigateMock).toHaveBeenCalledWith(-1)
  })

  it('replaces a direct entry with the fallback path', () => {
    window.history.replaceState({ idx: 0 }, '', '/focused')
    render(<MemoryRouter><NativeRouteFrame title="Focused" fallbackPath="/bender"><div /></NativeRouteFrame></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: /back/i }))
    expect(navigateMock).toHaveBeenCalledWith('/bender', { replace: true })
  })
})
