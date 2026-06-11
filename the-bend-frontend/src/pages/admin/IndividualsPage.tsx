import { useState, useEffect, useCallback } from 'react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { adminApi } from '@/services/adminApi';
import { parseServerDate } from '@/lib/utils';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
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
import { Search, PauseCircle, PlayCircle, Loader2, Users } from 'lucide-react';

interface Individual {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  is_active: boolean;
  listings_count: number;
  created_at: string;
}

type StatusFilter = 'all' | 'active' | 'suspended';

const PRIMARY = 'hsl(160, 25%, 24%)';

const formatDate = (iso: string) =>
  parseServerDate(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });

const initials = (name: string) =>
  name
    .split(' ')
    .map((p) => p.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase();

const statusBadge = (isActive: boolean) =>
  isActive ? (
    <Badge variant="outline" className="text-[hsl(160,25%,24%)] border-[hsl(35,18%,84%)] bg-[hsl(35,15%,94%)]">
      Active
    </Badge>
  ) : (
    <Badge variant="outline" className="text-red-600 border-red-200 bg-red-50">
      Suspended
    </Badge>
  );

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
];

export default function IndividualsPage() {
  const [individuals, setIndividuals] = useState<Individual[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Suspend dialog
  const [suspendTarget, setSuspendTarget] = useState<Individual | null>(null);
  const [suspendReason, setSuspendReason] = useState('');
  const [suspendError, setSuspendError] = useState('');

  const fetchIndividuals = useCallback(async (status: StatusFilter, q?: string) => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (status !== 'all') params.status = status;
      if (q) params.search = q;
      const res = await adminApi.listIndividuals(params);
      setIndividuals(res.data?.items ?? res.data ?? []);
    } catch {
      setIndividuals([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchIndividuals(statusFilter, search.trim() || undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchIndividuals(statusFilter, search.trim() || undefined);
  };

  const openSuspend = (individual: Individual) => {
    setSuspendTarget(individual);
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
      await adminApi.suspendIndividual(suspendTarget.id, suspendReason.trim());
      setSuspendTarget(null);
      fetchIndividuals(statusFilter, search.trim() || undefined);
    } catch {
      setSuspendError('Failed to suspend account. Please try again.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReactivate = async (individual: Individual) => {
    setActionLoading(individual.id);
    try {
      await adminApi.reactivateIndividual(individual.id);
      fetchIndividuals(statusFilter, search.trim() || undefined);
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
          <h1 className="text-2xl font-bold text-gray-900">Individuals</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Browse and manage all individual accounts
          </p>
        </div>

        {/* Status tabs */}
        <div className="flex items-center gap-2">
          {STATUS_TABS.map((tab) => {
            const active = statusFilter === tab.value;
            return (
              <button
                key={tab.value}
                type="button"
                onClick={() => setStatusFilter(tab.value)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? 'bg-[hsl(35,15%,94%)] text-[hsl(160,25%,24%)]'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Search */}
        <form onSubmit={handleSearch} className="flex items-center gap-3 max-w-sm">
          <div className="relative flex-1">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              placeholder="Search by name or email..."
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
        ) : individuals.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Users size={40} className="mx-auto mb-3 opacity-30" />
            No individuals found.
          </div>
        ) : (
          <div className="rounded-xl border bg-white overflow-hidden shadow-sm">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50/60">
                  <TableHead className="pl-4">Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Listings</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right pr-4">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {individuals.map((individual) => (
                  <TableRow key={individual.id}>
                    <TableCell className="pl-4">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          {individual.avatar_url && (
                            <AvatarImage src={individual.avatar_url} alt={individual.name} />
                          )}
                          <AvatarFallback className="text-xs">
                            {initials(individual.name)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium">{individual.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {individual.email}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {individual.phone || '—'}
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">
                      {individual.listings_count}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(individual.created_at)}
                    </TableCell>
                    <TableCell>{statusBadge(individual.is_active)}</TableCell>
                    <TableCell className="text-right pr-4">
                      <div className="flex items-center justify-end gap-2">
                        {individual.is_active ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50"
                            onClick={() => openSuspend(individual)}
                            disabled={actionLoading === individual.id}
                          >
                            {actionLoading === individual.id ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <PauseCircle size={14} />
                            )}
                            Suspend
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            className="gap-1.5 text-white"
                            style={{ backgroundColor: PRIMARY }}
                            onClick={() => handleReactivate(individual)}
                            disabled={actionLoading === individual.id}
                          >
                            {actionLoading === individual.id ? (
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

      {/* Suspend Dialog */}
      <Dialog open={!!suspendTarget} onOpenChange={() => setSuspendTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Suspend Account</DialogTitle>
            <DialogDescription>
              Provide a reason for suspending{' '}
              <span className="font-semibold text-foreground">{suspendTarget?.name}</span>. They
              will no longer be able to sign in.
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
