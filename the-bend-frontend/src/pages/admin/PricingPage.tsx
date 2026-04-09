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
import { DollarSign, Pencil, Trash2, Plus, Loader2 } from 'lucide-react';

const PRIMARY = 'hsl(160, 25%, 24%)';
const BRONZE = 'hsl(35, 45%, 42%)';

type Placement = 'homepage' | 'browse' | 'events' | 'footer';
const PLACEMENTS: Placement[] = ['homepage', 'browse', 'events', 'footer'];

const PLACEMENT_COLORS: Record<Placement, string> = {
  homepage: 'bg-blue-50 text-blue-700 border-blue-200',
  browse: 'bg-purple-50 text-purple-700 border-purple-200',
  events: 'bg-orange-50 text-orange-700 border-orange-200',
  footer: 'bg-gray-100 text-gray-600 border-gray-200',
};

interface PricingPlan {
  id: string;
  name: string;
  description?: string;
  placement: Placement;
  duration_days: number;
  price_cents: number;
  is_active: boolean;
  sort_order: number;
  created_at?: string;
}

interface FormData {
  name: string;
  description: string;
  placement: Placement;
  duration_days: string;
  price_dollars: string;
  is_active: boolean;
  sort_order: string;
}

const EMPTY_FORM: FormData = {
  name: '',
  description: '',
  placement: 'homepage',
  duration_days: '30',
  price_dollars: '',
  is_active: true,
  sort_order: '0',
};

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function PricingPage() {
  const [plans, setPlans] = useState<PricingPlan[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<PricingPlan | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = useState<PricingPlan | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchPlans = useCallback(async () => {
    setLoading(true);
    try {
      const res = await sponsorApi.adminListPricing();
      const data = res.data;
      setPlans(Array.isArray(data) ? data : (data?.items ?? []));
    } catch {
      setPlans([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  const openCreate = () => {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setDialogOpen(true);
  };

  const openEdit = (plan: PricingPlan) => {
    setEditTarget(plan);
    setForm({
      name: plan.name,
      description: plan.description ?? '',
      placement: plan.placement,
      duration_days: String(plan.duration_days),
      price_dollars: (plan.price_cents / 100).toFixed(2),
      is_active: plan.is_active,
      sort_order: String(plan.sort_order),
    });
    setFormError('');
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setFormError('Name is required.'); return; }
    const priceVal = parseFloat(form.price_dollars);
    if (isNaN(priceVal) || priceVal < 0) { setFormError('Enter a valid price.'); return; }
    const durationVal = parseInt(form.duration_days, 10);
    if (isNaN(durationVal) || durationVal < 1) { setFormError('Duration must be at least 1 day.'); return; }

    setSaving(true);
    setFormError('');
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      placement: form.placement,
      duration_days: durationVal,
      price_cents: Math.round(priceVal * 100),
      is_active: form.is_active,
      sort_order: parseInt(form.sort_order, 10) || 0,
    };

    try {
      if (editTarget) {
        await sponsorApi.adminUpdatePricing(editTarget.id, payload);
      } else {
        await sponsorApi.adminCreatePricing(payload);
      }
      setDialogOpen(false);
      fetchPlans();
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
      await sponsorApi.adminDeletePricing(deleteTarget.id);
      setDeleteTarget(null);
      fetchPlans();
    } catch {
      // silent
    } finally {
      setDeleting(false);
    }
  };

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
              Ad Pricing
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage advertising plans and pricing tiers
            </p>
          </div>
          <Button
            size="sm"
            className="gap-1.5 text-white"
            style={{ backgroundColor: BRONZE }}
            onClick={openCreate}
          >
            <Plus size={15} />
            New Plan
          </Button>
        </div>

        {/* Content */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[...Array(4)].map((_, i) => (
              <Card key={i} className="border-[hsl(35,18%,87%)]">
                <CardContent className="p-5 space-y-3">
                  <Skeleton className="h-5 w-2/3" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-1/2" />
                  <div className="flex gap-2 pt-3">
                    <Skeleton className="h-8 w-16" />
                    <Skeleton className="h-8 w-16" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : plans.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
            <DollarSign size={40} className="opacity-20" />
            <p className="text-sm">No pricing plans yet. Create one to get started.</p>
            <Button
              size="sm"
              className="gap-1.5 text-white mt-2"
              style={{ backgroundColor: BRONZE }}
              onClick={openCreate}
            >
              <Plus size={15} />
              New Plan
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {plans.map((plan) => (
              <Card
                key={plan.id}
                className="flex flex-col border border-[hsl(35,18%,87%)] transition-shadow hover:shadow-md"
              >
                <CardContent className="p-5 flex flex-col gap-3 flex-1">
                  {/* Name + placement */}
                  <div className="flex items-start justify-between gap-2">
                    <h3
                      className="font-bold text-[hsl(160,25%,24%)] leading-tight"
                      style={{ fontFamily: 'Georgia, serif' }}
                    >
                      {plan.name}
                    </h3>
                    <Badge
                      variant="outline"
                      className={`capitalize text-xs flex-shrink-0 ${
                        PLACEMENT_COLORS[plan.placement] ?? 'bg-gray-100 text-gray-600 border-gray-200'
                      }`}
                    >
                      {plan.placement}
                    </Badge>
                  </div>

                  {/* Description */}
                  {plan.description && (
                    <p className="text-sm text-gray-600 line-clamp-2">{plan.description}</p>
                  )}

                  {/* Price + duration */}
                  <div className="flex items-baseline gap-2">
                    <span
                      className="text-2xl font-bold"
                      style={{ color: BRONZE }}
                    >
                      {formatPrice(plan.price_cents)}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      / {plan.duration_days} day{plan.duration_days !== 1 ? 's' : ''}
                    </span>
                  </div>

                  {/* Status + sort order */}
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={`text-xs ${
                        plan.is_active
                          ? 'bg-green-50 text-green-700 border-green-200'
                          : 'bg-gray-100 text-gray-500 border-gray-200'
                      }`}
                    >
                      {plan.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      Order: {plan.sort_order}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-1 mt-auto">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs"
                      onClick={() => openEdit(plan)}
                    >
                      <Pencil size={12} />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs text-red-600 border-red-200 hover:bg-red-50"
                      onClick={() => setDeleteTarget(plan)}
                    >
                      <Trash2 size={12} />
                      Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) setDialogOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editTarget ? 'Edit Pricing Plan' : 'New Pricing Plan'}</DialogTitle>
            <DialogDescription>
              {editTarget
                ? 'Update the details for this pricing plan.'
                : 'Create a new ad pricing plan for advertisers.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="pr-name">Name *</Label>
              <Input
                id="pr-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Homepage Banner — 30 Days"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pr-desc">Description</Label>
              <Input
                id="pr-desc"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Short description of this plan"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pr-placement">Placement</Label>
              <Select
                value={form.placement}
                onValueChange={(v) => setForm((f) => ({ ...f, placement: v as Placement }))}
              >
                <SelectTrigger id="pr-placement">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLACEMENTS.map((p) => (
                    <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="pr-price">Price (USD) *</Label>
                <Input
                  id="pr-price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.price_dollars}
                  onChange={(e) => setForm((f) => ({ ...f, price_dollars: e.target.value }))}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pr-duration">Duration (days) *</Label>
                <Input
                  id="pr-duration"
                  type="number"
                  min="1"
                  value={form.duration_days}
                  onChange={(e) => setForm((f) => ({ ...f, duration_days: e.target.value }))}
                  placeholder="30"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pr-sort">Sort Order</Label>
              <Input
                id="pr-sort"
                type="number"
                value={form.sort_order}
                onChange={(e) => setForm((f) => ({ ...f, sort_order: e.target.value }))}
                placeholder="0"
              />
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="pr-active"
                checked={form.is_active}
                onCheckedChange={(checked) =>
                  setForm((f) => ({ ...f, is_active: checked === true }))
                }
              />
              <Label htmlFor="pr-active" className="cursor-pointer">Active (visible to advertisers)</Label>
            </div>

            {formError && <p className="text-xs text-red-500">{formError}</p>}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
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
              ) : editTarget ? 'Save Changes' : 'Create Plan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Pricing Plan</DialogTitle>
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
