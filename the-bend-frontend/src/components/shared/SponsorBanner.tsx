import { useState, useEffect } from 'react';
import { sponsorApi } from '@/services/sponsorApi';
import { resolveAssetUrl } from '@/lib/constants';
import { useTenant } from '@/context/TenantContext';
import type { Sponsor } from '@/types';

// Logos that are mostly dark/monochrome — need a white pill in dark mode
// to stay visible. Colored brand logos (Provoke, ProLine) render transparent.
const DARK_LOGOS = [
  'westmoreland-museum-logo',
  'inn-at-montross',
];

function logoClass(url: string | undefined, sizeClasses: string): string {
  if (!url) return sizeClasses;
  const isDark = DARK_LOGOS.some((m) => url.toLowerCase().includes(m));
  return isDark
    ? `${sizeClasses} object-contain dark:bg-white/95 dark:rounded dark:px-2 dark:py-1`
    : `${sizeClasses} object-contain`;
}

interface SponsorBannerProps {
  placement: string;
  variant?: 'inline' | 'strip' | 'card';
}

export function SponsorBanner({ placement, variant = 'inline' }: SponsorBannerProps) {
  const tenant = useTenant();
  const stripLabel = tenant.sponsor_strip_label || 'Proud Community Partners';
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);

  useEffect(() => {
    sponsorApi.list(placement)
      .then(res => setSponsors(res.data.items ?? []))
      .catch(() => {});
  }, [placement]);

  if (sponsors.length === 0) return null;

  // "strip" — horizontal row of sponsor logos
  if (variant === 'strip') {
    return (
      <div className="border-y border-[hsl(35,18%,84%)] bg-[hsl(40,20%,98%)] py-6">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <p className="text-[10px] tracking-[0.2em] uppercase text-[hsl(30,10%,60%)] text-center mb-4 font-medium">
            {stripLabel}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-6 md:gap-10">
            {sponsors.map(s => (
              <a
                key={s.id}
                href={s.website_url || '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="group text-center max-w-[160px] cursor-pointer"
              >
                {s.logo_url ? (
                  <div className="h-10 w-44 mx-auto flex items-center justify-center opacity-70 group-hover:opacity-100 transition-opacity">
                    <img src={resolveAssetUrl(s.logo_url)} alt={s.name} className={logoClass(s.logo_url, 'h-10 w-auto max-w-full object-contain')} />
                  </div>
                ) : (
                  <div className="h-10 w-36 mx-auto flex items-center justify-center">
                    <span className="text-sm font-serif font-semibold text-[hsl(30,10%,45%)] group-hover:text-[hsl(35,45%,42%)] transition-colors">
                      {s.name}
                    </span>
                  </div>
                )}
              </a>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // "card" — single rotating sponsor card for sidebar
  if (variant === 'card') {
    return <SponsorCardCarousel sponsors={sponsors} />;
  }

  // "inline" — carousel of sponsor cards, 3 visible at a time
  return <SponsorInlineCarousel sponsors={sponsors} />;
}

// ─── Inline Marquee (infinite scroll) ───────────────────────────────────────

function SponsorInlineCarousel({ sponsors }: { sponsors: Sponsor[] }) {
  // Double the sponsors for seamless infinite loop
  const doubled = [...sponsors, ...sponsors];

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-8 my-8">
      <p className="text-[10px] tracking-[0.2em] uppercase text-[hsl(30,10%,55%)] font-medium mb-3">
        Community Partners{' '}
        <a href="/advertise" target="_blank" rel="noopener noreferrer" className="normal-case tracking-normal hover:underline" style={{ color: 'hsl(35, 45%, 42%)' }}>(Partner with us)</a>
      </p>
      <div className="overflow-hidden relative">
        {/* Fade edges — uses CSS var for dark mode compat */}
        <div className="absolute left-0 top-0 bottom-0 w-8 z-10 pointer-events-none" style={{ background: 'linear-gradient(to right, var(--fade-bg, hsl(40,25%,96%)), transparent)' }} />
        <div className="absolute right-0 top-0 bottom-0 w-8 z-10 pointer-events-none" style={{ background: 'linear-gradient(to left, var(--fade-bg, hsl(40,25%,96%)), transparent)' }} />

        <div
          className="flex gap-4 animate-marquee hover:[animation-play-state:paused]"
          style={{
            animation: `marquee ${sponsors.length * 6}s linear infinite`,
          }}
        >
          {doubled.map((s, i) => (
            <a
              key={`${s.id}-${i}`}
              href={s.website_url || '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-shrink-0 w-[280px] border border-[hsl(35,18%,84%)] bg-[hsl(40,20%,98%)] px-4 py-4 transition-all hover:border-[hsl(35,45%,42%)] hover:shadow-md cursor-pointer group block"
            >
              {s.logo_url && (
                <div className="mb-2.5 h-10 w-full flex items-center justify-start">
                  <img src={resolveAssetUrl(s.logo_url)} alt={s.name} className={logoClass(s.logo_url, 'h-10 w-auto max-w-full object-contain')} />
                </div>
              )}
              <p className="font-serif font-semibold text-sm text-[hsl(30,15%,25%)] group-hover:text-[hsl(35,45%,35%)] transition-colors">
                {s.name}
              </p>
              {s.description && (
                <p className="text-xs text-[hsl(30,10%,50%)] mt-1 line-clamp-2 leading-relaxed">{s.description}</p>
              )}
              <p className="text-[9px] tracking-[0.15em] uppercase text-[hsl(30,10%,65%)] mt-2 font-medium">Community Partner</p>
            </a>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}

// ─── Card Carousel (single card, auto-rotates) ─────────────────────────────

function SponsorCardCarousel({ sponsors }: { sponsors: Sponsor[] }) {
  const [index, setIndex] = useState(0);

  // Auto-rotate every 4 seconds
  useEffect(() => {
    if (sponsors.length <= 1) return;
    const timer = setInterval(() => {
      setIndex(i => (i + 1) % sponsors.length);
    }, 4000);
    return () => clearInterval(timer);
  }, [sponsors.length]);

  const sponsor = sponsors[index];
  if (!sponsor) return null;

  return (
    <div>
      <a
        href={sponsor.website_url || '#'}
        target="_blank"
        rel="noopener noreferrer"
        className="block border border-[hsl(35,18%,84%)] bg-[hsl(40,20%,98%)] p-4 transition-all hover:border-[hsl(35,45%,42%,0.4)] hover:shadow-sm cursor-pointer group"
      >
        <p className="text-[9px] tracking-[0.2em] uppercase text-[hsl(30,10%,60%)] mb-2 font-medium">
          Community Partner
        </p>
        {sponsor.logo_url && (
          <div className="mb-2 h-8 w-full flex items-center justify-start">
            <img src={resolveAssetUrl(sponsor.logo_url)} alt={sponsor.name} className={logoClass(sponsor.logo_url, 'h-8 w-auto max-w-full object-contain')} />
          </div>
        )}
        <p className="font-serif font-semibold text-sm text-[hsl(30,15%,25%)] group-hover:text-[hsl(35,45%,35%)] transition-colors mb-1">
          {sponsor.name}
        </p>
        {sponsor.description && (
          <p className="text-xs text-[hsl(30,10%,50%)] leading-relaxed line-clamp-2">
            {sponsor.description}
          </p>
        )}
      </a>
      {sponsors.length > 1 && (
        <div className="flex justify-center gap-1 mt-2">
          {sponsors.map((_, i) => (
            <button
              key={i}
              onClick={() => setIndex(i)}
              className={`w-1.5 h-1.5 rounded-full transition-colors cursor-pointer ${
                i === index ? 'bg-[hsl(35,45%,42%)]' : 'bg-[hsl(35,18%,84%)]'
              }`}
              aria-label={`Sponsor ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
