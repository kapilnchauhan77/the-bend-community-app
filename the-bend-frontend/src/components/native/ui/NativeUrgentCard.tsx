import { useState } from 'react'
import { BriefcaseBusiness, CalendarDays, FileText, HeartHandshake, Sparkles, Store } from 'lucide-react'
import { resolveAssetUrl } from '@/lib/constants'
import type { NativeDiscoveryCardModel } from '@/native/discovery/types'

export type { NativeDiscoveryCardModel } from '@/native/discovery/types'

interface NativeUrgentCardProps { item: NativeDiscoveryCardModel; onOpen(path: string): void }

export function NativeUrgentCard({ item, onOpen }: NativeUrgentCardProps) {
  const [failedThumbnailUrl, setFailedThumbnailUrl] = useState<string | null>(null)
  const FallbackIcon = item.kind === 'event' ? CalendarDays : item.kind === 'bender' ? Sparkles : item.kind === 'volunteer' ? HeartHandshake : item.kind === 'business' ? Store : item.kind === 'listing' ? BriefcaseBusiness : FileText
  return <button type="button" aria-label={item.label} className="native-urgent-card native-control" onClick={() => onOpen(item.targetPath)}><span className="native-urgent-text">Urgent need</span><div className="native-urgent-row">{item.thumbnailUrl && failedThumbnailUrl !== item.thumbnailUrl ? <img src={resolveAssetUrl(item.thumbnailUrl)} alt="" width="64" height="58" loading="lazy" onError={() => setFailedThumbnailUrl(item.thumbnailUrl)} /> : <span className="native-urgent-thumbnail" aria-hidden="true"><FallbackIcon size={24} /></span>}<span className="native-urgent-copy"><strong>{item.title}</strong><span>{item.supportingText}</span></span></div></button>
}
