interface NativeSectionHeaderProps { heading: string; actionLabel?: string; onAction?(): void }

export function NativeSectionHeader({ heading, actionLabel, onAction }: NativeSectionHeaderProps) {
  return <div className="native-section-header"><h2>{heading}</h2>{actionLabel && <button type="button" className="native-control" onClick={onAction}>{actionLabel}</button>}</div>
}
