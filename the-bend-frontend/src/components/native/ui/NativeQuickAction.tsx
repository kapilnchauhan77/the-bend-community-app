import type { ReactNode } from 'react'
export function NativeQuickAction({ label, icon, onClick }: { label: string; icon?: ReactNode; onClick(): void }) { return <button type="button" className="native-control native-quick-action" onClick={onClick}>{icon}{label}</button> }
