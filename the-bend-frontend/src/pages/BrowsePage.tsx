import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { listingApi } from '@/services/listingApi';
import type { Listing } from '@/types';
import { PageLayout } from '@/components/layout/PageLayout';
import { ListingCard } from '@/components/shared/ListingCard';
import { ListingGridSkeleton } from '@/components/shared/LoadingSkeletons';
import { EmptyState } from '@/components/shared/EmptyState';

const categories = [
  { value: '', label: 'All' },
  { value: 'staff', label: 'Staff' },
  { value: 'materials', label: 'Materials' },
  { value: 'equipment', label: 'Equipment' },
];

export default function BrowsePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const search = searchParams.get('search') || '';
  const category = searchParams.get('category') || '';
  const urgency = searchParams.get('urgency') || '';
  const sort = searchParams.get('sort') || 'urgency_desc';

  useEffect(() => {
    fetchListings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, category, urgency, sort]);

  async function fetchListings(cursor?: string) {
    setLoading(!cursor);
    try {
      const params: Record<string, string> = { sort };
      if (search) params.search = search;
      if (category) params.category = category;
      if (urgency) params.urgency = urgency;
      if (cursor) params.cursor = cursor;
      const { data } = await listingApi.browse(params);
      setListings(cursor ? ((prev: Listing[]) => [...prev, ...data.items]) as unknown as Listing[] : data.items);
      setNextCursor(data.next_cursor || null);
      setHasMore(data.has_more);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams);
    if (value) params.set(key, value);
    else params.delete(key);
    setSearchParams(params);
  }

  return (
    <PageLayout>
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-6">
        <h1 className="text-2xl font-bold mb-4">Browse Listings</h1>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <Input
            className="pl-10"
            placeholder="Search staff, materials, equipment..."
            value={search}
            onChange={(e) => updateFilter('search', e.target.value)}
          />
        </div>

        {/* Category tabs */}
        <div className="flex gap-2 mb-4 flex-wrap">
          {categories.map((cat) => (
            <Button
              key={cat.value}
              variant={category === cat.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => updateFilter('category', cat.value)}
              style={category === cat.value ? { backgroundColor: 'hsl(142, 76%, 36%)' } : {}}
            >
              {cat.label}
            </Button>
          ))}
        </div>

        {/* Sort + filters row */}
        <div className="flex items-center justify-between mb-6">
          <span className="text-sm text-muted-foreground">{listings.length} results</span>
          <Select value={sort} onValueChange={(v) => updateFilter('sort', v)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="urgency_desc">Urgency</SelectItem>
              <SelectItem value="created_desc">Newest</SelectItem>
              <SelectItem value="expiry_asc">Expiring Soon</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Results */}
        {loading ? (
          <ListingGridSkeleton count={6} />
        ) : listings.length === 0 ? (
          <EmptyState
            title="No listings found"
            description="Try adjusting your filters or search terms."
            action={{ label: 'Clear Filters', onClick: () => setSearchParams({}) }}
          />
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {listings.map((listing) => (
                <ListingCard key={listing.id} listing={listing} />
              ))}
            </div>
            {hasMore && (
              <div className="flex justify-center mt-6">
                <Button variant="outline" onClick={() => fetchListings(nextCursor!)}>
                  Load More
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </PageLayout>
  );
}
