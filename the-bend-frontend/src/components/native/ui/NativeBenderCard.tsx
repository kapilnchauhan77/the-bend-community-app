import { useState } from 'react'
import { Heart, MessageCircle, Play, Sparkles } from 'lucide-react'
import { resolveAssetUrl } from '@/lib/constants'
import { timeAgo } from '@/lib/utils'
import { getBenderAccessibleName, getSafeBenderPreview } from '@/native/discovery/benderPresentation'
import type { BenderPost } from '@/types'
import { benderPostPath } from '@/routes/benderRoutes'

interface NativeBenderCardProps { post: BenderPost; onOpen(path: string): void }

const countLabel = (count: number, singular: string) => `${count} ${singular}${count === 1 ? '' : 's'}`

export function NativeBenderCard({ post, onOpen }: NativeBenderCardProps) {
  const [failedMediaUrl, setFailedMediaUrl] = useState<string | null>(null)
  const displayName = post.author.shop_name?.trim() || post.author.name
  const caption = post.caption?.trim() || 'Shared a community update.'
  const { isVideo: video, previewUrl } = getSafeBenderPreview(post)
  const showPreview = previewUrl && previewUrl !== failedMediaUrl

  return <button type="button" className="native-bender-card native-control" aria-label={getBenderAccessibleName(displayName, caption)} onClick={() => onOpen(benderPostPath(post.id))}>
    {showPreview ? <span className="native-bender-media-frame"><img className="native-bender-media" src={resolveAssetUrl(previewUrl)} alt={`${displayName}'s Bender post`} width="88" height="88" loading="lazy" onError={() => setFailedMediaUrl(previewUrl)} />{video ? <span className="native-bender-play" aria-hidden="true"><Play size={16} fill="currentColor" /></span> : null}</span> : <span className="native-bender-media native-thumbnail-fallback" data-fallback-icon="bender" aria-hidden="true"><Sparkles size={26} /></span>}
    <span className="native-bender-copy">
      <span className="native-bender-meta"><strong>{displayName}</strong><time dateTime={post.created_at}>{timeAgo(post.created_at)}</time></span>
      <span className="native-bender-caption">{caption}</span>
      <span className="native-bender-counts"><span><Heart size={14} aria-hidden="true" />{countLabel(post.like_count, 'like')}</span><span><MessageCircle size={14} aria-hidden="true" />{countLabel(post.comment_count, 'comment')}</span></span>
    </span>
  </button>
}
