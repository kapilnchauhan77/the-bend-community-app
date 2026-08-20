import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { NativeRouteFrame } from './NativeRouteFrame'

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
    expect(() => fireEvent.click(screen.getByRole('button', { name: /back/i }))).not.toThrow()
  })
})
