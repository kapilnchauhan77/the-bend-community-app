import type { ReactNode } from 'react'

interface NativeQuickActionProps { label: string; icon?: ReactNode; onClick(): void }

export function NativeQuickAction({ label, icon, onClick }: NativeQuickActionProps) {
  return <button type="button" className="native-control native-quick-action" onClick={onClick}>{icon}{label}</button>
}
