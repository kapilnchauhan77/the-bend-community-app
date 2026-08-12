import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { resolveAssetUrl } from '@/lib/constants';
import { messageApi } from '@/services/messageApi';
import type { ReferenceCard } from '@/types';

const TYPE_LABEL: Record<string, string> = {
  listing: 'Listing',
  shop: 'Business',
  bender: 'Bender post',
  user: 'Person',
};

// Filter chips shown at the top of the modal. `value` of `undefined` means
// "All" — no `type` param is sent to the search endpoint.
const TYPE_FILTERS: Array<{ label: string; value?: string }> = [
  { label: 'All', value: undefined },
  { label: 'Listing', value: 'listing' },
  { label: 'Business', value: 'shop' },
  { label: 'Bender', value: 'bender' },
  { label: 'Person', value: 'user' },
];

const DEBOUNCE_MS = 250;

interface ReferencePickerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (card: ReferenceCard) => void;
}

// Compact, non-navigating row for a search result — visually similar to
// MessageReferenceCard, but tapping it selects the card instead of routing.
function ReferenceResultRow({
  card,
  onClick,
}: {
  card: ReferenceCard;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-lg border border-gray-200 bg-white p-2 text-left transition-colors hover:bg-gray-50"
    >
      {card.image_url ? (
        <img
          src={resolveAssetUrl(card.image_url)}
          alt=""
          className="h-10 w-10 flex-shrink-0 rounded object-cover"
        />
      ) : (
        <div className="h-10 w-10 flex-shrink-0 rounded bg-gray-100" />
      )}
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-wide text-gray-400">
          {TYPE_LABEL[card.type] ?? card.type}
        </div>
        <div className="truncate text-sm font-medium text-gray-900">{card.title}</div>
        {card.subtitle && (
          <div className="truncate text-xs text-gray-500">{card.subtitle}</div>
        )}
      </div>
    </button>
  );
}

export function ReferencePickerModal({
  open,
  onOpenChange,
  onSelect,
}: ReferencePickerModalProps) {
  const [query, setQuery] = useState('');
  const [activeType, setActiveType] = useState<string | undefined>(undefined);
  const [results, setResults] = useState<ReferenceCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Monotonic counter guarding against out-of-order responses: a slow
  // response for an older query must not overwrite a newer query's results.
  const requestIdRef = useRef(0);

  // Reset composer-local state whenever the modal is (re)opened.
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveType(undefined);
      setResults([]);
      setError(null);
    }
  }, [open]);

  // Debounced search — fires ~250ms after the user stops typing, or
  // immediately when the type filter changes. Guarded against out-of-order
  // responses: each search gets a sequence id, and a response is only
  // applied if it's still the most recent request in flight (a slow
  // response for a stale query must not clobber newer results). The
  // debounce timer itself is also cleared on unmount/query-change so no
  // stray search fires after the component is gone or inputs changed again.
  useEffect(() => {
    if (!open) return;

    const q = query.trim();
    if (!q) {
      requestIdRef.current += 1;
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    const requestId = ++requestIdRef.current;
    const timer = setTimeout(async () => {
      try {
        const { data } = await messageApi.referenceSearch(q, activeType);
        if (requestIdRef.current !== requestId) return; // stale response — a newer search superseded it
        setResults(data.items ?? []);
      } catch (err) {
        if (requestIdRef.current !== requestId) return;
        console.error('Reference search failed:', err);
        setError('Search failed. Try again.');
      } finally {
        if (requestIdRef.current === requestId) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query, activeType, open]);

  // Defensive filter: the search endpoint should only ever return live
  // rows, but skip rendering any `unavailable` card should one slip through
  // rather than offering it as a selectable result.
  const visibleResults = results.filter((card) => !card.unavailable);

  function handleSelect(card: ReferenceCard) {
    if (card.unavailable) return;
    onSelect(card);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Attach a reference</DialogTitle>
          <DialogDescription>
            Search for a listing, business, bender post, or person to share.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search..."
            className="pl-9"
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {TYPE_FILTERS.map((filter) => (
            <Badge
              key={filter.label}
              variant={activeType === filter.value ? 'default' : 'outline'}
              className="cursor-pointer select-none"
              role="button"
              tabIndex={0}
              aria-pressed={activeType === filter.value}
              onClick={() => setActiveType(filter.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setActiveType(filter.value);
                }
              }}
            >
              {filter.label}
            </Badge>
          ))}
        </div>

        <div className="flex max-h-80 flex-col gap-1.5 overflow-y-auto">
          {loading ? (
            <p className="py-6 text-center text-sm text-gray-400">Searching...</p>
          ) : error ? (
            <p className="py-6 text-center text-sm text-red-500">{error}</p>
          ) : query.trim().length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">
              Start typing to search.
            </p>
          ) : visibleResults.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">No results found.</p>
          ) : (
            visibleResults.map((card) => (
              <ReferenceResultRow
                key={`${card.type}-${card.id}`}
                card={card}
                onClick={() => handleSelect(card)}
              />
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
