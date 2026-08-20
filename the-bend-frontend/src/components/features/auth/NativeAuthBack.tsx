import type * as React from 'react'
import { useNativePresentation } from '@/components/layout/NativePresentationContext'
import { NativeBackButton } from '@/components/layout/NativeRouteFrame'

export interface NativeAuthBackProps { fallbackPath: string; label?: string }

export function NativeAuthBack({ fallbackPath, label = 'Go back' }: NativeAuthBackProps): React.ReactElement | null {
  const native = useNativePresentation()
  if (!native) return null
  return <NativeBackButton fallbackPath={fallbackPath} label={label} />
}
