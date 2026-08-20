import { useState } from 'react'
import { BriefcaseBusiness, CalendarDays, FileText, HeartHandshake, Sparkles, Store } from 'lucide-react'
import { resolveAssetUrl } from '@/lib/constants'
import { getBenderAccessibleName } from '@/native/discovery/benderPresentation'
import type { NativeDiscoveryCardModel } from '@/native/discovery/types'

interface NativeDiscoveryCardProps { item: NativeDiscoveryCardModel; onOpen(path: string): void }

export function NativeDiscoveryCard({ item, onOpen }: NativeDiscoveryCardProps) {
  const [failedThumbnailUrl, setFailedThumbnailUrl] = useState<string | null>(null)
  const FallbackIcon = item.kind === 'event' ? CalendarDays : item.kind === 'bender' ? Sparkles : item.kind === 'volunteer' ? HeartHandshake : item.kind === 'business' ? Store : item.kind === 'listing' ? BriefcaseBusiness : FileText
  const accessibleName = item.kind === 'bender' ? getBenderAccessibleName(item.supportingText, item.title) : item.label
  const mediaClass = `native-discovery-media native-discovery-media--${item.mediaFit}`
  return <button type="button" aria-label={accessibleName} className={`native-discovery-card native-${item.kind}-discovery-card native-control`} onClick={() => onOpen(item.targetPath)}>{item.thumbnailUrl && failedThumbnailUrl !== item.thumbnailUrl ? <img data-media-fit={item.mediaFit} className={mediaClass} src={resolveAssetUrl(item.thumbnailUrl)} alt={item.kind === 'bender' ? '' : item.title} width="96" height="96" loading="lazy" onError={() => setFailedThumbnailUrl(item.thumbnailUrl)} /> : <div className={`native-thumbnail native-thumbnail-fallback ${mediaClass}`} data-media-fit={item.mediaFit} data-fallback-icon={item.kind} aria-hidden="true"><FallbackIcon size={28} /></div>}<span><small>{item.label}</small><strong>{item.title}</strong><span>{item.supportingText}</span></span></button>
}
