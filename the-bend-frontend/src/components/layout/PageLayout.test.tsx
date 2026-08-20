import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { PageLayout } from './PageLayout'
import { NativePresentationProvider } from './NativePresentationContext'

afterEach(() => {
  cleanup()
  window.localStorage?.clear?.()
})

describe('PageLayout', () => {
  it('omits website chrome in explicit native presentation context', () => {
    render(<MemoryRouter><NativePresentationProvider><PageLayout><p>content</p></PageLayout></NativePresentationProvider></MemoryRouter>)
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
    expect(screen.queryByText(/install/i)).not.toBeInTheDocument()
    expect(screen.getByText('content')).toBeInTheDocument()
  })

  it('keeps web chrome when no native context is provided', () => {
    Object.defineProperty(window, 'localStorage', { configurable: true, value: { getItem: () => null, setItem: () => undefined, clear: () => undefined } })
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: false }) })
    render(<MemoryRouter><PageLayout><p>content</p></PageLayout></MemoryRouter>)
    expect(screen.getByText('content')).toBeInTheDocument()
    expect(document.querySelector('.min-h-screen')).toBeInTheDocument()
  })
})
