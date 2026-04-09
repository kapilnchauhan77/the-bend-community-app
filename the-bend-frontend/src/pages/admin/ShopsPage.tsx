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
import { Input } from '@/components/ui/input';
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
import { Search, Eye, PauseCircle, PlayCircle, Loader2, Store } from 'lucide-react';

type ShopStatus = 'active' | 'suspended' | 'pending';

interface Shop {
  id: string;
  name: string;
  business_type: string;
  admin_name: string;
  admin_email: string;
  status: ShopStatus;
  listing_count: number;
  created_at: string;
  address?: string;
  description?: string;
}

const PRIMARY = 'hsl(160, 25%, 24%)';

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });

const statusBadge = (status: ShopStatus) => {
  switch (status) {
    case 'active':
      return (
        <Badge variant="outline" className="text-[hsl(160,25%,24%)] border-[hsl(35,18%,84%)] bg-[hsl(35,15%,94%)]">
          Active
        </Badge>
      );
    case 'suspended':
      return (
        <Badge variant="outline" className="text-red-600 border-red-200 bg-red-50">
          Suspended
        </Badge>
      );
    case 'pending':
      return (
        <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50">
          Pending
        </Badge>
      );
  }
};

export default function ShopsPage() {
  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // View dialog
  const [viewShop, setViewShop] = useState<Shop | null>(null);

  // Suspend dialog
  const [suspendTarget, setSuspendTarget] = useState<Shop | null>(null);
  const [suspendReason, setSuspendReason] = useState('');
  const [suspendError, setSuspendError] = useState('');

  const fetchShops = useCallback(async (q?: string) => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (q) params.search = q;
      const res = await adminApi.getShops(params);
      setShops(res.data?.items ?? res.data?.shops ?? res.data ?? []);
    } catch {
      setShops([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchShops();
  }, [fetchShops]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchShops(search.trim() || undefined);
  };

  const openSuspend = (shop: Shop) => {
    setSuspendTarget(shop);
    setSuspendReason('');
    setSuspendError('');
  };

  const handleSuspend = async () => {
    if (!suspendTarget) return;
    if (!suspendReason.trim()) {
      setSuspendError('Please provide a reason for suspension.');
      return;
    }
    setActionLoading(suspendTarget.id);
    try {
      await adminApi.suspendShop(suspendTarget.id, suspendReason.trim());
      setSuspendTarget(null);
      fetchShops(search.trim() || undefined);
    } catch {
      setSuspendError('Failed to suspend shop. Please try again.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReactivate = async (shop: Shop) => {
    setActionLoading(shop.id);
    try {
      await adminApi.reactivateShop(shop.id);
      fetchShops(search.trim() || undefined);
    } catch {
      // silent
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Businesses</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Browse and manage all registered businesses
          </p>
        </div>

        {/* Search */}
        <form onSubmit={handleSearch} className="flex items-center gap-3 max-w-sm">
          <div className="relative flex-1">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              placeholder="Search businesses..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button type="submit" style={{ backgroundColor: PRIMARY }} className="text-white">
            Search
          </Button>
        </form>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
            <Loader2 size={18} className="animate-spin" />
            Loading...
          </div>
        ) : shops.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Store size={40} className="mx-auto mb-3 opacity-30" />
            No businesses found.
          </div>
        ) : (
          <div className="rounded-xl border bg-white overflow-hidden shadow-sm">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50/60">
                  <TableHead className="pl-4">Business Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Admin</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Listings</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="text-right pr-4">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shops.map((shop) => (
                  <TableRow key={shop.id}>
                    <TableCell className="pl-4 font-medium">{shop.name}</TableCell>
                    <TableCell className="capitalize text-sm text-muted-foreground">
                      {shop.business_type}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {shop.admin_name}
                    </TableCell>
                    <TableCell>{statusBadge(shop.status)}</TableCell>
                    <TableCell className="text-sm tabular-nums">{shop.listing_count}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(shop.created_at)}
                    </TableCell>
                    <TableCell className="text-right pr-4">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setViewShop(shop)}
                          className="gap-1.5"
                        >
                          <Eye size={14} />
                          View
                        </Button>
                        {shop.status === 'active' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50"
                            onClick={() => openSuspend(shop)}
                            disabled={actionLoading === shop.id}
                          >
                            {actionLoading === shop.id ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <PauseCircle size={14} />
                            )}
                            Suspend
                          </Button>
                        )}
                        {shop.status === 'suspended' && (
                          <Button
                            size="sm"
                            className="gap-1.5 text-white"
                            style={{ backgroundColor: PRIMARY }}
                            onClick={() => handleReactivate(shop)}
                            disabled={actionLoading === shop.id}
                          >
                            {actionLoading === shop.id ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <PlayCircle size={14} />
                            )}
                            Reactivate
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* View Dialog */}
      <Dialog open={!!viewShop} onOpenChange={() => setViewShop(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{viewShop?.name}</DialogTitle>
            <DialogDescription>Business details</DialogDescription>
          </DialogHeader>
          {viewShop && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">
                    Business Type
                  </p>
                  <p className="font-medium capitalize">{viewShop.business_type}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">
                    Status
                  </p>
                  {statusBadge(viewShop.status)}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">
                    Admin
                  </p>
                  <p className="font-medium">{viewShop.admin_name}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">
                    Email
                  </p>
                  <p className="font-medium">{viewShop.admin_email}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">
                    Listings
                  </p>
                  <p className="font-medium">{viewShop.listing_count}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">
                    Joined
                  </p>
                  <p className="font-medium">{formatDate(viewShop.created_at)}</p>
                </div>
              </div>
              {viewShop.address && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">
                    Address
                  </p>
                  <p className="font-medium">{viewShop.address}</p>
                </div>
              )}
              {viewShop.description && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">
                    Description
                  </p>
                  <p className="text-muted-foreground leading-relaxed">{viewShop.description}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewShop(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Suspend Dialog */}
      <Dialog open={!!suspendTarget} onOpenChange={() => setSuspendTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Suspend Business</DialogTitle>
            <DialogDescription>
              Provide a reason for suspending{' '}
              <span className="font-semibold text-foreground">{suspendTarget?.name}</span>. The business
              admin will be notified.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="suspend-reason">Reason</Label>
            <Textarea
              id="suspend-reason"
              placeholder="e.g. Violation of community guidelines..."
              value={suspendReason}
              onChange={(e) => {
                setSuspendReason(e.target.value);
                setSuspendError('');
              }}
              rows={4}
            />
            {suspendError && <p className="text-xs text-red-500">{suspendError}</p>}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setSuspendTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleSuspend}
              disabled={!!actionLoading}
            >
              {actionLoading ? (
                <span className="flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin" />
                  Suspending...
                </span>
              ) : (
                'Confirm Suspension'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
