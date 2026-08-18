export interface NativeDiscoveryCardModel { id: string; kind: 'listing' | 'business' | 'event' | 'volunteer'; label: string; title: string; supportingText: string; thumbnailUrl: string | null; targetPath: string; coordinates: { latitude: number; longitude: number } | null; urgent: boolean }

interface NativeUrgentCardProps { item: NativeDiscoveryCardModel; onOpen(path: string): void }

export function NativeUrgentCard({ item, onOpen }: NativeUrgentCardProps) {
  return <button type="button" aria-label={item.label} className="native-urgent-card native-control" onClick={() => onOpen(item.targetPath)}><span className="native-urgent-text">Urgent need</span><strong>{item.title}</strong><span>{item.supportingText}</span></button>
}
