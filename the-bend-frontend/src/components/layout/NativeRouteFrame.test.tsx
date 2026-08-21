import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NativeRouteFrame } from './NativeRouteFrame'
import { readFileSync } from 'node:fs'

const nativeCss = readFileSync('src/styles/native.css', 'utf8')

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

  it('insets focused headers below the native status scrim exactly once', () => {
    expect(nativeCss).toMatch(/\.native-app \.native-route-frame\s*\{[^}]*--native-route-safe-top:\s*var\(--native-safe-top\)/)
    expect(nativeCss).toMatch(/\.native-app \.native-route-header\s*\{[^}]*padding:\s*var\(--native-route-safe-top\) 16px 0/)
    expect(nativeCss).toMatch(/\.native-app \.native-route-header\s*\{[^}]*min-height:\s*calc\(56px \+ var\(--native-route-safe-top\)\)/)
  })
})
