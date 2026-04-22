import { useState, useEffect, useCallback } from 'react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { adminApi } from '@/services/adminApi';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Trash2, Loader2, FileText, Filter } from 'lucide-react';

type ListingStatus = 'active' | 'expired' | 'removed' | 'draft';
type ListingUrgency = 'urgent' | 'normal';

interface Listing {
  id: string;
  title: string;
  shop_name: string;
  category: string;
  urgency: ListingUrgency;
  status: ListingStatus;
  created_at: string;
}


const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });

const urgencyBadge = (urgency: ListingUrgency) => {
  switch (urgency) {
    case 'urgent':
      return (
        <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50">
          Urgent
        </Badge>
      );
    case 'normal':
      return (
        <Badge variant="outline" className="text-gray-600 border-gray-200 bg-gray-50">
          Normal
        </Badge>
      );
  }
};

const statusBadge = (status: ListingStatus) => {
  switch (status) {
    case 'active':
      return (
        <Badge variant="outline" className="text-[hsl(160,25%,24%)] border-[hsl(35,18%,84%)] bg-[hsl(35,15%,94%)]">
          Active
        </Badge>
      );
    case 'expired':
      return (
        <Badge variant="outline" className="text-gray-500 border-gray-200 bg-gray-50">
          Expired
        </Badge>
      );
    case 'removed':
      return (
        <Badge variant="outline" className="text-red-600 border-red-200 bg-red-50">
          Removed
        </Badge>
      );
    case 'draft':
      return (
        <Badge variant="outline" className="text-blue-600 border-blue-200 bg-blue-50">
          Draft
        </Badge>
      );
  }
};

const CATEGORIES = ['All', 'produce', 'handmade', 'services', 'equipment', 'other'];
const STATUSES: Array<{ value: string; label: string }> = [
  { value: '', label: 'All Status' },
  { value: 'active', label: 'Active' },
  { value: 'expired', label: 'Expired' },
  { value: 'removed', label: 'Removed' },
  { value: 'draft', label: 'Draft' },
];
const URGENCIES: Array<{ value: string; label: string }> = [
  { value: '', label: 'All Urgency' },
  { value: 'urgent', label: 'Urgent' },
  { value: 'normal', label: 'Normal' },
];

export default function ListingsPage() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterUrgency, setFilterUrgency] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Remove dialog
  const [removeTarget, setRemoveTarget] = useState<Listing | null>(null);
  const [removeReason, setRemoveReason] = useState('');
  const [removeError, setRemoveError] = useState('');

  const fetchListings = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (filterStatus) params.status = filterStatus;
      if (filterCategory && filterCategory !== 'All') params.category = filterCategory;
      if (filterUrgency) params.urgency = filterUrgency;
      const res = await adminApi.getListings(params);
      setListings(res.data?.items ?? res.data?.listings ?? res.data ?? []);
    } catch {
      setListings([]);
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterCategory, filterUrgency]);

  useEffect(() => {
    fetchListings();
  }, [fetchListings]);

  const openRemove = (listing: Listing) => {
    setRemoveTarget(listing);
    setRemoveReason('');
    setRemoveError('');
  };

  const handleRemove = async () => {
    if (!removeTarget) return;
    if (!removeReason.trim()) {
      setRemoveError('Please provide a reason for removal.');
      return;
    }
    setActionLoading(removeTarget.id);
    try {
      await adminApi.removeListing(removeTarget.id, removeReason.trim());
      setRemoveTarget(null);
      fetchListings();
    } catch {
      setRemoveError('Failed to remove listing. Please try again.');
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Listings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Review and moderate all community listings
          </p>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <Filter size={16} className="text-muted-foreground" />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="text-sm border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[hsl(35,18%,84%)]"
          >
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="text-sm border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[hsl(35,18%,84%)] capitalize"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c === 'All' ? '' : c} className="capitalize">
                {c === 'All' ? 'All Categories' : c}
              </option>
            ))}
          </select>
          <select
            value={filterUrgency}
            onChange={(e) => setFilterUrgency(e.target.value)}
            className="text-sm border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[hsl(35,18%,84%)]"
          >
            {URGENCIES.map((u) => (
              <option key={u.value} value={u.value}>
                {u.label}
              </option>
            ))}
          </select>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
            <Loader2 size={18} className="animate-spin" />
            Loading...
          </div>
        ) : listings.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <FileText size={40} className="mx-auto mb-3 opacity-30" />
            No listings found matching your filters.
          </div>
        ) : (
          <div className="rounded-xl border bg-white overflow-hidden shadow-sm">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50/60">
                  <TableHead className="pl-4">Title</TableHead>
                  <TableHead>Business</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Urgency</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Posted</TableHead>
                  <TableHead className="text-right pr-4">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listings.map((listing) => (
                  <TableRow key={listing.id}>
                    <TableCell className="pl-4 font-medium max-w-[200px] truncate">
                      {listing.title}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {listing.shop_name}
                    </TableCell>
                    <TableCell className="text-sm capitalize text-muted-foreground">
                      {listing.category}
                    </TableCell>
                    <TableCell>{urgencyBadge(listing.urgency)}</TableCell>
                    <TableCell>{statusBadge(listing.status)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(listing.created_at)}
                    </TableCell>
                    <TableCell className="text-right pr-4">
                      {listing.status !== 'removed' && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50"
                          onClick={() => openRemove(listing)}
                          disabled={actionLoading === listing.id}
                        >
                          {actionLoading === listing.id ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Trash2 size={14} />
                          )}
                          Remove
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Remove Dialog */}
      <Dialog open={!!removeTarget} onOpenChange={() => setRemoveTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Remove Listing</DialogTitle>
            <DialogDescription>
              Provide a reason for removing{' '}
              <span className="font-semibold text-foreground">"{removeTarget?.title}"</span>. The
              business owner will be notified.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="remove-reason">Reason</Label>
            <Textarea
              id="remove-reason"
              placeholder="e.g. Violates community guidelines, inappropriate content..."
              value={removeReason}
              onChange={(e) => {
                setRemoveReason(e.target.value);
                setRemoveError('');
              }}
              rows={4}
            />
            {removeError && <p className="text-xs text-red-500">{removeError}</p>}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRemoveTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRemove}
              disabled={!!actionLoading}
            >
              {actionLoading ? (
                <span className="flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin" />
                  Removing...
                </span>
              ) : (
                'Confirm Removal'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
