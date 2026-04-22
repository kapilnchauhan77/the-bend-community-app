import { useState, useEffect } from 'react';
import { Bookmark } from 'lucide-react';
import { PageLayout } from '@/components/layout/PageLayout';
import { ListingCard } from '@/components/shared/ListingCard';
import { listingApi } from '@/services/listingApi';
import type { Listing } from '@/types';

export default function SavedListingsPage() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listingApi.getSavedListings()
      .then((res) => setListings(res.data))
      .catch(() => setListings([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <PageLayout>
      <div className="max-w-5xl mx-auto px-4 md:px-8 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="font-serif text-2xl md:text-3xl font-bold text-[hsl(30,15%,18%)]">
            Saved Listings
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Listings you've bookmarked for later
          </p>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <div key={n} className="h-32 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : listings.length === 0 ? (
          <div className="text-center py-20 border-2 border-dashed border-[hsl(35,18%,84%)] rounded-xl">
            <div className="w-14 h-14 rounded-full bg-[hsl(35,15%,90%)] flex items-center justify-center mx-auto mb-4">
              <Bookmark className="w-7 h-7 text-[hsl(35,45%,42%)]" />
            </div>
            <p className="font-semibold text-[hsl(30,15%,25%)] mb-1">No saved listings yet</p>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              Browse listings and tap the bookmark icon to save them for later.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {listings.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        )}
      </div>
    </PageLayout>
  );
}
