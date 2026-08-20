import { describe, expect, it } from 'vitest'
import { getNativeMapAvailability } from './mapAvailability'

describe('native map availability', () => {
  it.each([
    [{ type: 'events', resultStatus: 'success', coordinateCount: 2 }, 'unsupported'],
    [{ type: 'businesses', resultStatus: 'loading', coordinateCount: 0 }, 'pending'],
    [{ type: 'businesses', resultStatus: 'success', coordinateCount: 0 }, 'empty'],
    [{ type: 'businesses', resultStatus: 'error', coordinateCount: 0 }, 'empty'],
    [{ type: 'businesses', resultStatus: 'error', coordinateCount: 2 }, 'empty'],
    [{ type: 'all', resultStatus: 'success', coordinateCount: 1 }, 'available'],
  ])('resolves %o as %s', (input, expected) => {
    expect(getNativeMapAvailability(input as never).status).toBe(expected)
  })
})
