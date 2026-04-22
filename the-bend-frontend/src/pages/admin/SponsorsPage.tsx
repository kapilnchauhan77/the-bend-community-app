import { useState, useEffect, useCallback } from 'react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { sponsorApi } from '@/services/sponsorApi';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Megaphone,
  Pencil,
  Trash2,
  Loader2,
  CheckCircle2,
  ExternalLink,
  CreditCard,
  CalendarDays,
  User,
  Mail,
  Globe,
} from 'lucide-react';

const PRIMARY = 'hsl(160, 25%, 24%)';
const BRONZE = 'hsl(35, 45%, 42%)';

type Placement = 'homepage' | 'browse' | 'events' | 'footer';

interface Sponsor {
  id: string;
  name: string;
  description?: string;
  website_url?: string;
  placement: Placement;
  contact_name?: string;
  contact_email?: string;
  paid: boolean;
  approved: boolean;
  is_active: boolean;
  starts_at?: string;
  expires_at?: string;
  stripe_session_id?: string;
  created_at?: string;
}

const PLACEMENT_COLORS: Record<Placement, string> = {
  homepage: 'bg-blue-50 text-blue-700 border-blue-200',
  browse: 'bg-purple-50 text-purple-700 border-purple-200',
  events: 'bg-orange-50 text-orange-700 border-orange-200',
  footer: 'bg-gray-100 text-gray-600 border-gray-200',
};

const PLACEMENTS: Placement[] = ['homepage', 'browse', 'events', 'footer'];

function formatDate(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function isExpired(expires_at?: string): boolean {
  if (!expires_at) return false;
  return new Date(expires_at) < new Date();
}

type TabKey = 'all' | 'pending' | 'active' | 'inactive' | 'expired';

interface EditFormData {
  name: string;
  description: string;
  website_url: string;
  placement: Placement;
  is_active: boolean;
}

const EMPTY_EDIT_FORM: EditFormData = {
  name: '',
  description: '',
  website_url: '',
  placement: 'homepage',
  is_active: true,
};

export default function SponsorsPage() {
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>('all');

  // Per-sponsor approve loading
  const [approvingId, setApprovingId] = useState<string | null>(null);

  // Edit dialog
  const [editTarget, setEditTarget] = useState<Sponsor | null>(null);
  const [editForm, setEditForm] = useState<EditFormData>(EMPTY_EDIT_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = useState<Sponsor | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchSponsors = useCallback(async () => {
    setLoading(true);
    try {
      const res = await sponsorApi.adminList();
      const data = res.data;
      setSponsors(Array.isArray(data) ? data : (data?.items ?? data?.sponsors ?? []));
    } catch {
      setSponsors([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSponsors();
  }, [fetchSponsors]);

  const handleApprove = async (sponsor: Sponsor) => {
    setApprovingId(sponsor.id);
    try {
      await sponsorApi.approve(sponsor.id);
      fetchSponsors();
    } catch {
      // silent
    } finally {
      setApprovingId(null);
    }
  };

  const openEdit = (sponsor: Sponsor) => {
    setEditTarget(sponsor);
    setEditForm({
      name: sponsor.name,
      description: sponsor.description ?? '',
      website_url: sponsor.website_url ?? '',
      placement: sponsor.placement,
      is_active: sponsor.is_active,
    });
    setFormError('');
  };

  const handleSave = async () => {
    if (!editTarget) return;
    if (!editForm.name.trim()) { setFormError('Name is required.'); return; }
    setSaving(true);
    setFormError('');
    try {
      await sponsorApi.adminUpdate(editTarget.id, {
        name: editForm.name.trim(),
        description: editForm.description.trim() || undefined,
        website_url: editForm.website_url.trim() || undefined,
        placement: editForm.placement,
        is_active: editForm.is_active,
      });
      setEditTarget(null);
      fetchSponsors();
    } catch {
      setFormError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await sponsorApi.adminDelete(deleteTarget.id);
      setDeleteTarget(null);
      fetchSponsors();
    } catch {
      // silent
    } finally {
      setDeleting(false);
    }
  };

  const filtered = sponsors.filter((s) => {
    if (activeTab === 'pending') return s.paid && !s.approved;
    if (activeTab === 'active') return s.approved && s.is_active && !isExpired(s.expires_at);
    if (activeTab === 'inactive') return !s.is_active && !isExpired(s.expires_at);
    if (activeTab === 'expired') return isExpired(s.expires_at);
    return true;
  });

  const pendingCount = sponsors.filter((s) => s.paid && !s.approved).length;
  const activeCount = sponsors.filter((s) => s.approved && s.is_active && !isExpired(s.expires_at)).length;
  const inactiveCount = sponsors.filter((s) => !s.is_active && !isExpired(s.expires_at)).length;
  const expiredCount = sponsors.filter((s) => isExpired(s.expires_at)).length;

  const tabs: { key: TabKey; label: string; count?: number }[] = [
    { key: 'all', label: 'All', count: sponsors.length },
    { key: 'pending', label: 'Pending Approval', count: pendingCount },
    { key: 'active', label: 'Active', count: activeCount },
    { key: 'inactive', label: 'Inactive', count: inactiveCount },
    { key: 'expired', label: 'Expired', count: expiredCount },
  ];

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1
              className="text-2xl font-bold"
              style={{ fontFamily: 'Georgia, serif', color: PRIMARY }}
            >
              Sponsors &amp; Ads
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Review payments, approve sponsors, and manage active placements
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchSponsors}
            disabled={loading}
            className="gap-1.5"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : null}
            Refresh
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-[hsl(35,18%,87%)]">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 text-sm font-medium transition-colors relative ${
                activeTab === tab.key
                  ? 'text-[hsl(160,25%,24%)] border-b-2 border-[hsl(35,45%,42%)] -mb-px'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
              {tab.count != null && tab.count > 0 && (
                <span
                  className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full font-medium ${
                    tab.key === 'pending'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[...Array(4)].map((_, i) => (
              <Card key={i} className="border-[hsl(35,18%,87%)]">
                <CardContent className="p-5 space-y-3">
                  <Skeleton className="h-5 w-2/3" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <div className="flex gap-2 pt-3">
                    <Skeleton className="h-8 w-24" />
                    <Skeleton className="h-8 w-16" />
                    <Skeleton className="h-8 w-16" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
            <Megaphone size={40} className="opacity-20" />
            <p className="text-sm">
              {activeTab === 'pending'
                ? 'No sponsors awaiting approval.'
                : activeTab === 'active'
                ? 'No active sponsors.'
                : activeTab === 'inactive'
                ? 'No inactive sponsors.'
                : activeTab === 'expired'
                ? 'No expired sponsorships.'
                : 'No sponsors yet.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((sponsor) => {
              const isPending = sponsor.paid && !sponsor.approved;
              const expired = isExpired(sponsor.expires_at);
              const isApproving = approvingId === sponsor.id;

              return (
                <Card
                  key={sponsor.id}
                  className={`flex flex-col border transition-shadow hover:shadow-md ${
                    isPending
                      ? 'border-amber-300 bg-amber-50/30'
                      : 'border-[hsl(35,18%,87%)]'
                  }`}
                >
                  <CardContent className="p-5 flex flex-col gap-3 flex-1">
                    {/* Name + placement */}
                    <div className="flex items-start justify-between gap-2">
                      <h3
                        className="font-bold text-[hsl(160,25%,24%)] leading-tight"
                        style={{ fontFamily: 'Georgia, serif' }}
                      >
                        {sponsor.name}
                      </h3>
                      <Badge
                        variant="outline"
                        className={`capitalize text-xs flex-shrink-0 ${
                          PLACEMENT_COLORS[sponsor.placement] ?? 'bg-gray-100 text-gray-600 border-gray-200'
                        }`}
                      >
                        {sponsor.placement}
                      </Badge>
                    </div>

                    {/* Description */}
                    {sponsor.description && (
                      <p className="text-sm text-gray-600 line-clamp-2">{sponsor.description}</p>
                    )}

                    {/* Contact */}
                    {(sponsor.contact_name || sponsor.contact_email) && (
                      <div className="text-xs text-muted-foreground space-y-0.5">
                        {sponsor.contact_name && (
                          <div className="flex items-center gap-1.5">
                            <User size={11} />
                            <span>{sponsor.contact_name}</span>
                          </div>
                        )}
                        {sponsor.contact_email && (
                          <div className="flex items-center gap-1.5">
                            <Mail size={11} />
                            <a
                              href={`mailto:${sponsor.contact_email}`}
                              className="hover:underline text-[hsl(160,25%,32%)]"
                            >
                              {sponsor.contact_email}
                            </a>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Website */}
                    {sponsor.website_url && (
                      <div className="flex items-center gap-1.5 text-xs">
                        <Globe size={11} className="text-muted-foreground flex-shrink-0" />
                        <a
                          href={sponsor.website_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[hsl(35,45%,38%)] hover:underline flex items-center gap-0.5 truncate"
                        >
                          {sponsor.website_url.replace(/^https?:\/\//, '')}
                          <ExternalLink size={9} className="flex-shrink-0" />
                        </a>
                      </div>
                    )}

                    {/* Status badges */}
                    <div className="flex flex-wrap gap-1.5">
                      <Badge
                        variant="outline"
                        className={`text-xs ${
                          sponsor.paid
                            ? 'bg-green-50 text-green-700 border-green-200'
                            : 'bg-red-50 text-red-600 border-red-200'
                        }`}
                      >
                        {sponsor.paid ? 'Paid' : 'Unpaid'}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={`text-xs ${
                          sponsor.approved
                            ? 'bg-green-50 text-green-700 border-green-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}
                      >
                        {sponsor.approved ? 'Approved' : 'Pending'}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={`text-xs ${
                          expired
                            ? 'bg-gray-100 text-gray-500 border-gray-200'
                            : sponsor.is_active
                            ? 'bg-green-50 text-green-700 border-green-200'
                            : 'bg-gray-100 text-gray-500 border-gray-200'
                        }`}
                      >
                        {expired ? 'Expired' : sponsor.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>

                    {/* Dates */}
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      {sponsor.starts_at && (
                        <div className="flex items-center gap-1.5">
                          <CalendarDays size={11} />
                          <span>Starts {formatDate(sponsor.starts_at)}</span>
                        </div>
                      )}
                      {sponsor.expires_at && (
                        <div className={`flex items-center gap-1.5 ${expired ? 'text-red-500' : ''}`}>
                          <CalendarDays size={11} />
                          <span>Expires {formatDate(sponsor.expires_at)}</span>
                        </div>
                      )}
                    </div>

                    {/* Stripe session ID */}
                    {sponsor.stripe_session_id && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <CreditCard size={11} />
                        <span className="font-mono truncate">
                          {sponsor.stripe_session_id.slice(0, 24)}…
                        </span>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex flex-wrap gap-2 pt-1 mt-auto">
                      {/* Approve button — most prominent when pending */}
                      {isPending && (
                        <Button
                          size="sm"
                          className="gap-1.5 text-white font-semibold flex-1"
                          style={{ backgroundColor: BRONZE }}
                          onClick={() => handleApprove(sponsor)}
                          disabled={isApproving}
                        >
                          {isApproving ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : (
                            <CheckCircle2 size={13} />
                          )}
                          {isApproving ? 'Approving…' : 'Approve'}
                        </Button>
                      )}

                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-xs"
                        onClick={() => openEdit(sponsor)}
                      >
                        <Pencil size={12} />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-xs text-red-600 border-red-200 hover:bg-red-50"
                        onClick={() => setDeleteTarget(sponsor)}
                      >
                        <Trash2 size={12} />
                        Delete
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editTarget} onOpenChange={(open) => { if (!open) setEditTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Sponsor</DialogTitle>
            <DialogDescription>
              Update sponsor details and placement settings.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="sp-name">Name *</Label>
              <Input
                id="sp-name"
                value={editForm.name}
                onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Sponsor name"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sp-desc">Description</Label>
              <Input
                id="sp-desc"
                value={editForm.description}
                onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Short description"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sp-url">Website URL</Label>
              <Input
                id="sp-url"
                value={editForm.website_url}
                onChange={(e) => setEditForm((f) => ({ ...f, website_url: e.target.value }))}
                placeholder="https://..."
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sp-placement">Placement</Label>
              <Select
                value={editForm.placement}
                onValueChange={(v) => setEditForm((f) => ({ ...f, placement: v as Placement }))}
              >
                <SelectTrigger id="sp-placement">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLACEMENTS.map((p) => (
                    <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="sp-active"
                checked={editForm.is_active}
                onCheckedChange={(checked) =>
                  setEditForm((f) => ({ ...f, is_active: checked === true }))
                }
              />
              <Label htmlFor="sp-active" className="cursor-pointer">Active</Label>
            </div>

            {formError && <p className="text-xs text-red-500">{formError}</p>}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditTarget(null)}>
              Cancel
            </Button>
            <Button
              className="text-white"
              style={{ backgroundColor: PRIMARY }}
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? (
                <span className="flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin" />
                  Saving…
                </span>
              ) : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Sponsor</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{' '}
              <span className="font-semibold text-foreground">{deleteTarget?.name}</span>?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? (
                <span className="flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin" />
                  Deleting…
                </span>
              ) : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
