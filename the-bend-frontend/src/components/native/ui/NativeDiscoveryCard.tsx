import { useState } from 'react'
import { BriefcaseBusiness, CalendarDays, FileText, HeartHandshake, Store } from 'lucide-react'
import { resolveAssetUrl } from '@/lib/constants'
import type { NativeDiscoveryCardModel } from './NativeUrgentCard'

interface NativeDiscoveryCardProps { item: NativeDiscoveryCardModel; onOpen(path: string): void }

export function NativeDiscoveryCard({ item, onOpen }: NativeDiscoveryCardProps) {
  const [failedThumbnailUrl, setFailedThumbnailUrl] = useState<string | null>(null)
  const FallbackIcon = item.kind === 'event' ? CalendarDays : item.kind === 'volunteer' ? HeartHandshake : item.kind === 'business' ? Store : item.kind === 'listing' ? BriefcaseBusiness : FileText
  return <button type="button" aria-label={item.label} className="native-discovery-card native-control" onClick={() => onOpen(item.targetPath)}>{item.thumbnailUrl && failedThumbnailUrl !== item.thumbnailUrl ? <img src={resolveAssetUrl(item.thumbnailUrl)} alt={item.title} width="96" height="96" loading="lazy" onError={() => setFailedThumbnailUrl(item.thumbnailUrl)} /> : <div className="native-thumbnail native-thumbnail-fallback" data-fallback-icon={item.kind} aria-hidden="true"><FallbackIcon size={28} /></div>}<span><small>{item.label}</small><strong>{item.title}</strong><span>{item.supportingText}</span></span></button>
}
