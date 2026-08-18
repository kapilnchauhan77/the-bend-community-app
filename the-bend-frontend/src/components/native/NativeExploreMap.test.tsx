import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { NativeExploreMap } from './NativeExploreMap'

const business = { id: 'b1', kind: 'business' as const, label: 'Farm', title: 'Westmoreland Farm', supportingText: 'Main Street', thumbnailUrl: null, targetPath: '/business/b1', coordinates: { latitude: 40, longitude: -79 }, urgent: false, distanceMiles: 2.4 }

describe('NativeExploreMap', () => {
  it('shows a business marker preview before opening details', () => {
    const onOpen = vi.fn()
    render(<NativeExploreMap businesses={[business]} userCoordinates={null} selectedId={null} onSelect={vi.fn()} onOpen={onOpen} />)
    fireEvent.click(screen.getByRole('button', { name: /Westmoreland Farm/i }))
    expect(screen.getByRole('dialog')).toHaveTextContent('Farm')
    expect(onOpen).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /Open details/i }))
    expect(onOpen).toHaveBeenCalledWith('/business/b1')
  })
})
