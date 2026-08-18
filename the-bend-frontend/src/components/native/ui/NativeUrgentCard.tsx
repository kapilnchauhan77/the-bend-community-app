import { useState } from 'react'
import { BriefcaseBusiness, CalendarDays, FileText, HeartHandshake, Store } from 'lucide-react'

export interface NativeDiscoveryCardModel { id: string; kind: 'listing' | 'business' | 'event' | 'volunteer'; label: string; title: string; supportingText: string; thumbnailUrl: string | null; targetPath: string; coordinates: { latitude: number; longitude: number } | null; urgent: boolean }

interface NativeUrgentCardProps { item: NativeDiscoveryCardModel; onOpen(path: string): void }

export function NativeUrgentCard({ item, onOpen }: NativeUrgentCardProps) {
  const [failedThumbnailUrl, setFailedThumbnailUrl] = useState<string | null>(null)
  const FallbackIcon = item.kind === 'event' ? CalendarDays : item.kind === 'volunteer' ? HeartHandshake : item.kind === 'business' ? Store : item.kind === 'listing' ? BriefcaseBusiness : FileText
  return <button type="button" aria-label={item.label} className="native-urgent-card native-control" onClick={() => onOpen(item.targetPath)}><span className="native-urgent-text">Urgent need</span><div className="native-urgent-row">{item.thumbnailUrl && failedThumbnailUrl !== item.thumbnailUrl ? <img src={item.thumbnailUrl} alt="" width="64" height="58" loading="lazy" onError={() => setFailedThumbnailUrl(item.thumbnailUrl)} /> : <span className="native-urgent-thumbnail" aria-hidden="true"><FallbackIcon size={24} /></span>}<span className="native-urgent-copy"><strong>{item.title}</strong><span>{item.supportingText}</span></span></div></button>
}
