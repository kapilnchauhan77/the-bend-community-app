import { isVideoUrl } from '@/lib/utils'
import type { BenderPost } from '@/types'

type BenderMedia = Pick<BenderPost, 'media_type' | 'media_url' | 'media_thumbnail_url'>

const bounded = (value: string, limit: number) => value.length > limit
  ? `${value.slice(0, limit - 1)}…`
  : value

export function getBenderAccessibleName(author: string, caption: string) {
  const displayAuthor = bounded(author.trim() || 'Community member', 60)
  const summary = bounded(caption.trim() || 'Shared a community update.', 95)
  return `Open Bender post by ${displayAuthor}: ${summary}`
}

export function getSafeBenderPreview(post: BenderMedia) {
  const mediaUrlIsVideo = isVideoUrl(post.media_url)
  const isVideo = post.media_type === 'video' || mediaUrlIsVideo
  const thumbnail = post.media_thumbnail_url && !isVideoUrl(post.media_thumbnail_url)
    ? post.media_thumbnail_url
    : null
  const fullImage = !isVideo && post.media_url && !mediaUrlIsVideo
    ? post.media_url
    : null

  return { isVideo, previewUrl: thumbnail ?? fullImage }
}
