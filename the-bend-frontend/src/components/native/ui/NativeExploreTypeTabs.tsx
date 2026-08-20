import { useLayoutEffect, useRef, type KeyboardEvent } from 'react'
import type { NativeExploreType } from '@/native/discovery/types'

// eslint-disable-next-line react-refresh/only-export-components
export const NATIVE_EXPLORE_TYPES = [
  ['All', 'all'],
  ['Listings', 'listings'],
  ['Businesses', 'businesses'],
  ['Events', 'events'],
  ['Bender', 'bender'],
  ['Volunteer', 'volunteer'],
] as const

export interface NativeExploreTypeTabsProps {
  value: NativeExploreType
  panelId: string
  onChange(value: NativeExploreType): void
}

export function NativeExploreTypeTabs({ value, panelId, onChange }: NativeExploreTypeTabsProps) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const selectedIndex = NATIVE_EXPLORE_TYPES.findIndex(([, type]) => type === value)

  useLayoutEffect(() => {
    tabRefs.current[selectedIndex]?.scrollIntoView?.({ block: 'nearest', inline: 'center' })
  }, [selectedIndex])

  const select = (index: number) => {
    const next = NATIVE_EXPLORE_TYPES[index][1]
    tabRefs.current[index]?.focus()
    onChange(next)
  }

  const onKeyDown = (index: number, event: KeyboardEvent<HTMLButtonElement>) => {
    let nextIndex: number | null = null
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % NATIVE_EXPLORE_TYPES.length
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + NATIVE_EXPLORE_TYPES.length) % NATIVE_EXPLORE_TYPES.length
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = NATIVE_EXPLORE_TYPES.length - 1
    if (nextIndex === null) return
    event.preventDefault()
    select(nextIndex)
  }

  return (
    <div role="tablist" aria-label="Explore types">
      {NATIVE_EXPLORE_TYPES.map(([label, type], index) => (
        <button
          key={type}
          ref={(element) => { tabRefs.current[index] = element }}
          type="button"
          role="tab"
          id={`native-explore-tab-${type}`}
          aria-controls={panelId}
          aria-selected={value === type}
          tabIndex={value === type ? 0 : -1}
          onClick={() => onChange(type)}
          onKeyDown={(event) => onKeyDown(index, event)}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

export default NativeExploreTypeTabs
