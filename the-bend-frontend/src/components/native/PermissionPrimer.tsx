import type { PropsWithChildren } from 'react'

export function PermissionPrimer({ title, description, onConfirm, confirmLabel = 'Allow when needed', children }: PropsWithChildren<{ title: string; description: string; onConfirm: () => void; confirmLabel?: string }>) {
  return <div className="space-y-3"><div className="rounded-lg border border-[hsl(35,18%,84%)] bg-[hsl(40,20%,98%)] p-3"><p className="text-sm font-semibold">{title}</p><p className="mt-1 text-xs text-gray-500">{description}</p><button type="button" onClick={onConfirm} className="mt-3 rounded bg-[hsl(35,45%,42%)] px-3 py-1.5 text-xs font-semibold text-white">{confirmLabel}</button></div>{children}</div>
}
