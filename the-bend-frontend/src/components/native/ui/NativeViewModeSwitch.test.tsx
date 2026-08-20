import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { NativeViewModeSwitch } from './NativeViewModeSwitch'

describe('NativeViewModeSwitch', () => {
  it('marks the selected mode and reports mode changes', () => {
    const onChange = vi.fn()
    render(<NativeViewModeSwitch value="list" onChange={onChange} />)
    expect(screen.getByRole('group', { name: 'Explore view' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'List' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Map' })).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(screen.getByRole('button', { name: 'Map' }))
    expect(onChange).toHaveBeenCalledWith('map')
  })
})
