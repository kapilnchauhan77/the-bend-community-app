import { useNavigate, Link } from 'react-router-dom';
import { Briefcase, Package, Wrench, Clock, Heart } from 'lucide-react';
import { resolveAssetUrl } from '@/lib/constants';
import { timeAgo, parseServerDate, formatPrice } from '@/lib/utils';
import type { Listing } from '@/types';

const categoryIcons = {
  staff: Briefcase,
  materials: Package,
  equipment: Wrench,
  volunteer: Heart,
};

const categoryLabels: Record<string, string> = {
  staff: 'Gigs',
  materials: 'Materials',
  equipment: 'Equipment',
  volunteer: 'Volunteer',
};

function expiryLabel(dateStr?: string): string | null {
  if (!dateStr) return null;
  const expiry = parseServerDate(dateStr.replace(' ', 'T'));
  const now = Date.now();
  const diff = expiry.getTime() - now;
  if (diff <= 0) return 'Expired';
  const days = Math.floor(diff / 86400000);
  if (days > 7) return null; // Only show if within 7 days
  if (days > 0) return `${days}d left`;
  const hours = Math.floor(diff / 3600000);
  if (hours > 0) return `${hours}h left`;
  return 'Expiring soon';
}

export function ListingCard({ listing }: { listing: Listing }) {
  const navigate = useNavigate();
  const CategoryIcon = categoryIcons[listing.category] || Package;

  const isOffer = listing.type === 'offer';
  const isGig = listing.category === 'staff';
  const borderColor = isOffer ? 'hsl(160, 25%, 24%)' : 'hsl(220, 50%, 50%)';
  const typeLabel = isGig
    ? (isOffer ? 'Hiring' : 'Available')
    : (isOffer ? 'Offering' : 'Looking for');
  const typeColor = isOffer ? 'text-[hsl(160,25%,28%)]' : 'text-[hsl(220,50%,45%)]';

  const cover = listing.images?.[0];
  const coverUrl = cover?.thumbnail_url || cover?.url;

  return (
    <div
      className="bg-[hsl(40,20%,98%)] border border-[hsl(35,18%,84%)] cursor-pointer shadow-sm hover:shadow-lg hover:-translate-y-0.5 hover:border-[hsl(35,45%,42%,0.4)] active:translate-y-0 active:shadow-sm transition-all duration-150 group overflow-hidden"
      style={{ borderLeftWidth: '3px', borderLeftColor: borderColor }}
      onClick={() => navigate(`/listing/${listing.id}`)}
    >
      {coverUrl && (
        <div className="relative aspect-[16/9] bg-[hsl(35,15%,90%)] overflow-hidden">
          <img
            src={resolveAssetUrl(coverUrl)}
            alt={listing.title}
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
          {listing.images && listing.images.length > 1 && (
            <span className="absolute bottom-2 right-2 bg-black/55 backdrop-blur-sm text-white text-[10px] font-medium px-1.5 py-0.5 rounded">
              +{listing.images.length - 1}
            </span>
          )}
        </div>
      )}
      <div className="px-4 py-3">
        {/* Top row: type + urgency dot + category */}
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-2">
            <span className={`text-[11px] font-semibold uppercase tracking-wider ${typeColor}`}>
              {typeLabel}
            </span>
            {listing.urgency !== 'normal' && (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-600">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                Urgent
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 text-[hsl(30,10%,55%)]">
            <CategoryIcon className="w-3.5 h-3.5" />
            <span className="text-[10px]">{categoryLabels[listing.category]}</span>
          </div>
        </div>

        {/* Title */}
        <h3 className="font-serif font-semibold text-sm text-[hsl(30,15%,18%)] line-clamp-1 group-hover:text-[hsl(35,45%,35%)] transition-colors">
          {listing.title}
        </h3>

        {/* Description */}
        <p className="text-xs text-[hsl(30,10%,50%)] line-clamp-1 mt-0.5">{listing.description}</p>

        {/* Price — its own row so it has room to breathe */}
        {(() => {
          const priceText = formatPrice(listing) || '—';
          const isFree = listing.pricing_type === 'free' || (!listing.pricing_type && listing.is_free);
          return (
            <div
              className={`mt-2 font-serif font-semibold text-base leading-tight ${
                isFree ? 'text-[hsl(160,25%,28%)]' : 'text-[hsl(30,15%,18%)]'
              }`}
              title={priceText}
            >
              {priceText}
            </div>
          );
        })()}

        {/* Footer — shop or community-poster on the left, time/expiry on the right */}
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-[hsl(35,18%,90%)] gap-2">
          {listing.shop ? (
          <Link
            to={`/business/${listing.shop.id}`}
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1.5 group/shop min-w-0 flex-1"
          >
            {listing.shop.avatar_url ? (
              <img
                src={resolveAssetUrl(listing.shop.avatar_url)}
                alt={listing.shop.name}
                className="w-5 h-5 rounded-full object-cover bg-[hsl(35,15%,90%)] flex-shrink-0"
                loading="lazy"
              />
            ) : (
              <div className="w-5 h-5 rounded-full bg-[hsl(35,15%,90%)] flex items-center justify-center text-[9px] font-bold text-[hsl(160,25%,24%)] flex-shrink-0">
                {listing.shop.name.charAt(0)}
              </div>
            )}
            <span className="text-[11px] text-[hsl(30,10%,45%)] truncate group-hover/shop:underline">{listing.shop.name}</span>
          </Link>
          ) : listing.posted_by ? (
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              {listing.posted_by.avatar_url ? (
                <img
                  src={resolveAssetUrl(listing.posted_by.avatar_url)}
                  alt={listing.posted_by.name}
                  className="w-5 h-5 rounded-full object-cover bg-[hsl(35,15%,90%)] flex-shrink-0"
                  loading="lazy"
                />
              ) : (
                <div className="w-5 h-5 rounded-full bg-[hsl(35,15%,90%)] flex items-center justify-center text-[9px] font-bold text-[hsl(160,25%,24%)] flex-shrink-0">
                  {listing.posted_by.name.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="text-[11px] text-[hsl(30,10%,45%)] truncate">
                {listing.posted_by.name}
              </span>
              <span className="text-[9px] font-medium uppercase tracking-wider text-[hsl(35,45%,42%)] flex-shrink-0">
                · Community member
              </span>
            </div>
          ) : (
            <span className="text-[11px] text-[hsl(30,10%,45%)] flex-1">Unknown</span>
          )}
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="flex items-center gap-0.5 text-[10px] text-[hsl(30,10%,60%)] whitespace-nowrap">
              <Clock className="w-3 h-3" />
              {timeAgo(listing.created_at)}
            </span>
            {(() => {
              const expiry = expiryLabel(listing.expiry_date);
              return expiry ? (
                <span className={`text-[10px] font-medium whitespace-nowrap ${expiry === 'Expired' ? 'text-red-500' : 'text-amber-600'}`}>
                  {expiry}
                </span>
              ) : null;
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}
