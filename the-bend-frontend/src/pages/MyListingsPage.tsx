import { useState, useEffect } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { Plus, Package, Edit, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { PageLayout } from '@/components/layout/PageLayout';
import { ListingCard } from '@/components/shared/ListingCard';
import { listingApi } from '@/services/listingApi';
import type { Listing } from '@/types';

const apiError = (error: unknown, fallback: string) =>
  axios.isAxiosError(error) && typeof error.response?.data?.detail === 'string'
    ? error.response.data.detail
    : fallback;

export default function MyListingsPage() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listingApi.getMyListings()
      .then((res) => setListings((res.data?.items ?? []).filter((listing: Listing) => listing.status !== 'deleted')))
      .catch(() => { setListings([]); setError('Could not load your listings.'); })
      .finally(() => setLoading(false));
  }, []);

  async function handleDelete(listing: Listing) {
    setActionLoading(listing.id);
    setError(null);
    try {
      await listingApi.delete(listing.id);
      setListings((current) => current.filter((item) => item.id !== listing.id));
    } catch (err: unknown) {
      setError(apiError(err, 'Failed to delete listing. Please try again.'));
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <PageLayout>
      <div className="max-w-5xl mx-auto px-4 md:px-8 py-8">
        <div className="flex items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="font-serif text-2xl md:text-3xl font-bold text-[hsl(30,15%,18%)]">
              My Listings
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Everything you've posted — gigs, materials, equipment, and volunteer opportunities.
            </p>
          </div>
          <Button asChild size="sm" style={{ backgroundColor: 'hsl(160, 25%, 24%)' }}>
            <Link to="/create" className="flex items-center gap-1.5 text-white">
              <Plus className="w-4 h-4" />
              Post Listing
            </Link>
          </Button>
        </div>

        {error && <p role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <div key={n} className="h-32 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : listings.length === 0 ? (
          <div className="text-center py-20 border-2 border-dashed border-[hsl(35,18%,84%)] rounded-xl">
            <div className="w-14 h-14 rounded-full bg-[hsl(35,15%,90%)] flex items-center justify-center mx-auto mb-4">
              <Package className="w-7 h-7 text-[hsl(35,45%,42%)]" />
            </div>
            <p className="font-semibold text-[hsl(30,15%,25%)] mb-1">No listings yet</p>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-4">
              Post a gig, share spare materials, lend equipment, or organize a volunteer opportunity.
            </p>
            <Button asChild size="sm" style={{ backgroundColor: 'hsl(160, 25%, 24%)' }}>
              <Link to="/create" className="flex items-center gap-1.5 text-white">
                <Plus className="w-4 h-4" />
                Post Your First Listing
              </Link>
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {listings.map((listing) => (
              <div key={listing.id} className="space-y-2">
                <ListingCard listing={listing} />
                <div className="flex gap-2">
                  <Button asChild size="sm" variant="outline" className="flex-1 gap-1.5" disabled={actionLoading === listing.id}>
                    <Link to={`/listing/${listing.id}/edit`}><Edit size={14} /> Edit</Link>
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="outline" className="flex-1 gap-1.5 text-red-600 border-red-200 hover:bg-red-50" disabled={actionLoading === listing.id}>
                        {actionLoading === listing.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Delete
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader><AlertDialogTitle>Delete "{listing.title}"?</AlertDialogTitle><AlertDialogDescription>This action cannot be undone.</AlertDialogDescription></AlertDialogHeader>
                      <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-red-600 hover:bg-red-700" disabled={actionLoading === listing.id} onClick={() => handleDelete(listing)}>Yes, Delete</AlertDialogAction></AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </PageLayout>
  );
}
