import { useNavigate } from 'react-router-dom';
import { resolveAssetUrl } from '@/lib/constants';
import type { ReferenceCard } from '@/types';

const TYPE_LABEL: Record<string, string> = {
  listing: 'Listing',
  shop: 'Business',
  bender: 'Bender post',
  user: 'Person',
};

export function MessageReferenceCard({ card }: { card: ReferenceCard }) {
  const navigate = useNavigate();

  if (card.unavailable) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-2 text-sm text-gray-400">
        This {TYPE_LABEL[card.type] ?? 'item'} is no longer available.
      </div>
    );
  }

  const clickable = !!card.url;

  return (
    <div
      role={clickable ? 'button' : undefined}
      onClick={clickable ? () => navigate(card.url!) : undefined}
      className={`flex items-center gap-2 rounded-lg border border-gray-200 bg-white p-2 ${
        clickable ? 'cursor-pointer hover:bg-gray-50' : ''
      }`}
    >
      {card.image_url ? (
        <img
          src={resolveAssetUrl(card.image_url)}
          alt=""
          className="h-10 w-10 rounded object-cover"
        />
      ) : (
        <div className="h-10 w-10 rounded bg-gray-100" />
      )}
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wide text-gray-400">
          {TYPE_LABEL[card.type]}
        </div>
        <div className="truncate text-sm font-medium">{card.title}</div>
        {card.subtitle && <div className="truncate text-xs text-gray-500">{card.subtitle}</div>}
      </div>
    </div>
  );
}
