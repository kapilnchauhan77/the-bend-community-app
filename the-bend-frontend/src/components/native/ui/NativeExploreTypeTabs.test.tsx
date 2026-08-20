import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NativeExploreTypeTabs } from './NativeExploreTypeTabs'

describe('NativeExploreTypeTabs', () => {
  afterEach(cleanup)

  it('links the selected tab to its panel and keeps only it tabbable', () => {
    render(<NativeExploreTypeTabs value="all" panelId="explore-results" onChange={vi.fn()} />)

    const all = screen.getByRole('tab', { name: 'All' })
    expect(all).toHaveAttribute('id', 'native-explore-tab-all')
    expect(all).toHaveAttribute('aria-controls', 'explore-results')
    expect(all).toHaveAttribute('aria-selected', 'true')
    expect(all).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('tab', { name: 'Listings' })).toHaveAttribute('tabindex', '-1')
  })

  it.each([
    ['ArrowRight', 'listings'],
    ['ArrowLeft', 'volunteer'],
    ['Home', 'all'],
    ['End', 'volunteer'],
  ] as const)('moves selection with %s', (key, expected) => {
    const onChange = vi.fn()
    render(<NativeExploreTypeTabs value="all" panelId="explore-results" onChange={onChange} />)
    const all = screen.getByRole('tab', { name: 'All' })

    fireEvent.keyDown(all, { key })

    expect(onChange).toHaveBeenCalledWith(expected)
    expect(screen.getByRole('tab', { name: expected === 'volunteer' ? 'Volunteer' : expected === 'listings' ? 'Listings' : 'All' })).toHaveFocus()
  })

  it('wraps from the last tab to the first and supports click selection', () => {
    const onChange = vi.fn()
    render(<NativeExploreTypeTabs value="volunteer" panelId="explore-results" onChange={onChange} />)
    const volunteer = screen.getByRole('tab', { name: 'Volunteer' })

    fireEvent.keyDown(volunteer, { key: 'ArrowRight' })
    expect(onChange).toHaveBeenCalledWith('all')
    fireEvent.click(screen.getByRole('tab', { name: 'Businesses' }))
    expect(onChange).toHaveBeenCalledWith('businesses')
  })

  it('scrolls the selected tab into view', () => {
    const scrollIntoView = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView })
    render(<NativeExploreTypeTabs value="businesses" panelId="explore-results" onChange={vi.fn()} />)

    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', inline: 'center' })
  })
})
