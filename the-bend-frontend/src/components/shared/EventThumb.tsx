import { useState } from 'react';
import type { CommunityEvent } from '@/types';
import { resolveAssetUrl } from '@/lib/constants';

const EVENT_FALLBACK_IMAGE = '/images/the-bend-community-logo-black.png';

interface EventThumbProps {
  event: CommunityEvent;
  className?: string;
  imageClassName?: string;
}

/**
 * Thumbnail for an event. Uses the uploaded image when present and falls back
 * to the approved Bend Community logo when the source is missing or fails.
 */
export function EventThumb({ event, className = '', imageClassName = 'object-cover' }: EventThumbProps) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const src = resolveAssetUrl(event.image_url);
  const showSource = Boolean(src) && failedSource !== src;

  if (showSource) {
    return (
      <div className={`relative w-full overflow-hidden bg-[hsl(35,15%,92%)] ${className}`}>
        <img
          src={src}
          alt={event.title}
          onError={() => setFailedSource(src)}
          className={`w-full h-full ${imageClassName} group-hover:scale-105 transition-transform duration-300`}
        />
      </div>
    );
  }

  return (
    <div className={`relative w-full overflow-hidden flex items-center justify-center bg-white ${className}`}>
      <img
        src={EVENT_FALLBACK_IMAGE}
        alt={event.title}
        className="w-full h-full object-contain p-4"
      />
    </div>
  );
}
