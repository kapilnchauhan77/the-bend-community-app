import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Search, Plus, Heart } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { listingApi } from '@/services/listingApi';
import type { Listing } from '@/types';
import { PageLayout } from '@/components/layout/PageLayout';
import { ListingCard } from '@/components/shared/ListingCard';
import { ListingGridSkeleton } from '@/components/shared/LoadingSkeletons';
import { EmptyState } from '@/components/shared/EmptyState';
import { SponsorBanner } from '@/components/shared/SponsorBanner';

export default function OpportunitiesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const search = searchParams.get('search') || '';
  const urgency = searchParams.get('urgency') || '';
  const sort = searchParams.get('sort') || 'urgency_desc';

  useEffect(() => {
    fetchListings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, urgency, sort]);

  async function fetchListings(cursor?: string) {
    setLoading(!cursor);
    try {
      const params: Record<string, string> = { sort };
      if (search) params.search = search;
      if (urgency) params.urgency = urgency;
      if (cursor) params.cursor = cursor;
      const { data } = await listingApi.getOpportunities(params);
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
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Heart className="w-6 h-6 text-[hsl(35,45%,42%)]" />
            <h1 className="text-2xl font-bold font-serif text-[hsl(30,15%,18%)]">Volunteer Opportunities</h1>
          </div>
          <Button asChild size="sm" style={{ backgroundColor: 'hsl(160, 25%, 24%)' }}>
            <Link to="/create?category=volunteer" className="flex items-center gap-1.5">
              <Plus className="w-4 h-4" />
              Post Listing
            </Link>
          </Button>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <Input
            className="pl-10"
            placeholder="Find a way to help..."
            value={search}
            onChange={(e) => updateFilter('search', e.target.value)}
          />
        </div>

        {/* Sort + filters row */}
        <div className="flex items-center justify-between mb-6">
          <span className="text-sm text-muted-foreground">{listings.length} results</span>
          <div className="flex items-center gap-2">
            <Select value={urgency || 'all'} onValueChange={(v) => updateFilter('urgency', v === 'all' ? '' : v)}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="All urgency" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All urgency</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
              </SelectContent>
            </Select>
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
        </div>

        {/* Results */}
        {loading ? (
          <ListingGridSkeleton count={6} />
        ) : listings.length === 0 ? (
          <EmptyState
            title="No volunteer opportunities yet — be the first to post one."
            description="Share a project, event, or recurring need where the community can lend a hand."
            action={{ label: 'Post Opportunity', onClick: () => { window.location.href = '/create?category=volunteer'; } }}
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
      <SponsorBanner placement="volunteer-opportunities" />
    </PageLayout>
  );
}
