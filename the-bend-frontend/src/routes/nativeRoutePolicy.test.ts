import { describe, expect, it } from 'vitest'
import { NATIVE_ROOT_DESTINATIONS, showsNativeBottomNavigation } from './nativeRoutePolicy'

describe('native route policy', () => {
  it('shows navigation only for normalized root destinations', () => {
    expect(NATIVE_ROOT_DESTINATIONS).toEqual(new Set(['/', '/explore', '/bender', '/you']))
    expect(showsNativeBottomNavigation('/')).toBe(true)
    expect(showsNativeBottomNavigation('/explore/')).toBe(true)
    expect(showsNativeBottomNavigation('/bender')).toBe(true)
    expect(showsNativeBottomNavigation('/bender/00000000-0000-0000-0000-000000000001')).toBe(false)
    expect(showsNativeBottomNavigation('/you/settings')).toBe(false)
    expect(showsNativeBottomNavigation('/unknown')).toBe(false)
  })
})
