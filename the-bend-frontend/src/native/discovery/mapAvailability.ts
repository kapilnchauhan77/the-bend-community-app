import type { NativeExploreType, NativeSectionStatus } from './types'

export type NativeMapAvailability =
  | { status: 'unsupported' }
  | { status: 'pending' }
  | { status: 'empty' }
  | { status: 'available' }

export function getNativeMapAvailability(input: { type: NativeExploreType; resultStatus: NativeSectionStatus; coordinateCount: number }): NativeMapAvailability {
  if (input.type !== 'all' && input.type !== 'businesses') return { status: 'unsupported' }
  if (input.resultStatus === 'loading') return { status: 'pending' }
  if (input.resultStatus === 'error') return { status: 'empty' }
  return input.coordinateCount > 0 ? { status: 'available' } : { status: 'empty' }
}
