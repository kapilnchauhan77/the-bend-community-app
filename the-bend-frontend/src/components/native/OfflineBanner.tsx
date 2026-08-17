import type { ReactNode } from 'react'
export function OfflineBanner({ children = 'You are offline. Changes cannot be submitted until you reconnect.' }: { children?: ReactNode }) { return <div role="status" className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-sm text-amber-900">{children}</div> }
