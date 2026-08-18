import type { NativeDiscoveryCardModel } from './NativeUrgentCard'

interface NativeDiscoveryCardProps { item: NativeDiscoveryCardModel; onOpen(path: string): void }

export function NativeDiscoveryCard({ item, onOpen }: NativeDiscoveryCardProps) {
  return <button type="button" aria-label={item.label} className="native-discovery-card native-control" onClick={() => onOpen(item.targetPath)}>{item.thumbnailUrl ? <img src={item.thumbnailUrl} alt={item.title} width="96" height="96" loading="lazy" /> : <div className="native-thumbnail" aria-hidden="true" />}<span><small>{item.label}</small><strong>{item.title}</strong><span>{item.supportingText}</span></span></button>
}
