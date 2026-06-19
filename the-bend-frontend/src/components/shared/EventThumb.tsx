import { useState } from 'react';
import {
  Users, Music, Palette, UtensilsCrossed, ShoppingBag,
  Landmark, Trees, GraduationCap, Calendar,
} from 'lucide-react';
import type { CommunityEvent } from '@/types';
import { resolveAssetUrl } from '@/lib/constants';

// Category → glyph for the generated cover. Falls back to a calendar.
const CATEGORY_ICON: Record<string, typeof Calendar> = {
  community: Users,
  music: Music,
  art: Palette,
  food: UtensilsCrossed,
  market: ShoppingBag,
  historic: Landmark,
  outdoor: Trees,
  education: GraduationCap,
};

// Stable hue (0..359) from a string, so each event gets its own consistent
// tile color across renders — no server data, no network. Keeps a long list
// of imageless events looking varied instead of like one repeated logo.
function hueFromString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

interface EventThumbProps {
  event: CommunityEvent;
  className?: string;
}

/**
 * Thumbnail for an event. Uses the uploaded image when present (and falls back
 * to the generated cover if that image 404s). Otherwise renders an on-brand
 * generated cover: a soft tile tinted by the event title, the category icon,
 * and a small "the bend" mark.
 */
export function EventThumb({ event, className = '' }: EventThumbProps) {
  const [broken, setBroken] = useState(false);
  const src = resolveAssetUrl(event.image_url);

  if (src && !broken) {
    return (
      <div className={`relative w-full overflow-hidden bg-[hsl(35,15%,92%)] ${className}`}>
        <img
          src={src}
          alt={event.title}
          onError={() => setBroken(true)}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />
      </div>
    );
  }

  const hue = hueFromString(event.title || event.id || 'event');
  const Icon = CATEGORY_ICON[event.category] ?? Calendar;
  return (
    <div
      className={`relative w-full overflow-hidden flex items-center justify-center ${className}`}
      style={{ background: `linear-gradient(135deg, hsl(${hue} 30% 90%), hsl(${hue} 26% 80%))` }}
      aria-hidden="true"
    >
      <Icon size={36} strokeWidth={1.5} style={{ color: `hsl(${hue} 30% 40%)` }} />
      <span
        className="absolute bottom-1.5 right-2.5 font-serif lowercase tracking-wide"
        style={{ color: `hsl(${hue} 26% 44%)`, fontSize: 10, opacity: 0.9 }}
      >
        the bend
      </span>
    </div>
  );
}
