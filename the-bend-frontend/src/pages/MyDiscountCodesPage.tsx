import { useEffect, useState } from 'react';
import { Plus, Tag, Edit, Trash2, Percent, DollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { PageLayout } from '@/components/layout/PageLayout';
import { discountCodeApi } from '@/services/discountCodeApi';
import { parseServerDate } from '@/lib/utils';
import type { DiscountCode } from '@/types';

const PRIMARY = 'hsl(160, 25%, 24%)';
const BRONZE = 'hsl(35, 45%, 42%)';

type DiscountType = 'percentage' | 'flat';

interface FormState {
  code: string;
  name: string;
  description: string;
  discount_type: DiscountType;
  // Stored as STRING in the form so the user's input survives type toggles.
  // Interpreted as: % when 'percentage', dollars when 'flat'.
  percentage_input: string;
  flat_dollars_input: string;
  expiry_date: string; // YYYY-MM-DD (date picker format) or ''
  max_uses: string;    // empty = unlimited
  is_active: boolean;
}

const EMPTY_FORM: FormState = {
  code: '',
  name: '',
  description: '',
  discount_type: 'percentage',
  percentage_input: '',
  flat_dollars_input: '',
  expiry_date: '',
  max_uses: '',
  is_active: true,
};

// "2026-12-31T23:59:59" — match backend's naive-UTC ISO format (no tz suffix).
function dateToEndOfDayIso(yyyyMmDd: string): string {
  return `${yyyyMmDd}T23:59:59`;
}

// Server gives "2026-12-31T23:59:59" (any tz) — extract YYYY-MM-DD for the date input.
function isoToDateInput(iso: string): string {
  return parseServerDate(iso).toISOString().slice(0, 10);
}

function formatExpiry(iso: string): string {
  return parseServerDate(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatValue(c: DiscountCode): string {
  return c.discount_type === 'percentage'
    ? `${c.discount_value}%`
    : `$${(c.discount_value / 100).toFixed(2)}`;
}

function isExpired(c: DiscountCode): boolean {
  if (!c.expiry_date) return false;
  return parseServerDate(c.expiry_date).getTime() < Date.now();
}

function statusLabel(c: DiscountCode): { label: string; cls: string } {
  if (isExpired(c)) return { label: 'Expired', cls: 'bg-[hsl(0,30%,94%)] text-[hsl(0,55%,40%)]' };
  if (!c.is_active) return { label: 'Inactive', cls: 'bg-[hsl(35,15%,90%)] text-[hsl(30,15%,40%)]' };
  return { label: 'Active', cls: 'bg-[hsl(160,25%,92%)] text-[hsl(160,25%,28%)]' };
}

export default function MyDiscountCodesPage() {
  const [codes, setCodes] = useState<DiscountCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<DiscountCode | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<DiscountCode | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    refresh();
  }, []);

  function refresh() {
    setLoading(true);
    discountCodeApi
      .listMine()
      .then((res) => setCodes(Array.isArray(res.data) ? res.data : []))
      .catch(() => setCodes([]))
      .finally(() => setLoading(false));
  }

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setModalOpen(true);
  }

  function openEdit(c: DiscountCode) {
    setEditing(c);
    setFormError(null);
    setForm({
      code: c.code,
      name: c.name,
      description: c.description || '',
      discount_type: c.discount_type,
      percentage_input: c.discount_type === 'percentage' ? String(c.discount_value) : '',
      flat_dollars_input:
        c.discount_type === 'flat' ? (c.discount_value / 100).toFixed(2) : '',
      expiry_date: c.expiry_date ? isoToDateInput(c.expiry_date) : '',
      max_uses: c.max_uses != null ? String(c.max_uses) : '',
      is_active: c.is_active,
    });
    setModalOpen(true);
  }

  function validate(): string | null {
    const code = form.code.trim();
    if (code.length < 3 || code.length > 40) return 'Code must be 3-40 characters.';
    if (!/^[A-Z0-9_-]+$/.test(code)) return 'Code can only contain A-Z, 0-9, _ and -.';
    const name = form.name.trim();
    if (name.length < 2 || name.length > 120) return 'Name must be 2-120 characters.';
    if (form.description.length > 280) return 'Description must be 280 characters or fewer.';
    if (form.discount_type === 'percentage') {
      const n = Number(form.percentage_input);
      if (!Number.isFinite(n) || n < 1 || n > 100) return 'Percentage must be between 1 and 100.';
    } else {
      const n = Number(form.flat_dollars_input);
      if (!Number.isFinite(n) || n <= 0) return 'Flat amount must be greater than $0.';
    }
    if (form.max_uses !== '') {
      const n = Number(form.max_uses);
      if (!Number.isInteger(n) || n < 1) return 'Max uses must be a positive whole number.';
    }
    return null;
  }

  async function handleSave() {
    const err = validate();
    if (err) {
      setFormError(err);
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const discount_value =
        form.discount_type === 'percentage'
          ? Math.round(Number(form.percentage_input))
          : Math.round(Number(form.flat_dollars_input) * 100);
      const payload = {
        code: form.code.trim(),
        name: form.name.trim(),
        description: form.description.trim() ? form.description.trim() : null,
        discount_type: form.discount_type,
        discount_value,
        expiry_date: form.expiry_date ? dateToEndOfDayIso(form.expiry_date) : null,
        max_uses: form.max_uses !== '' ? Math.round(Number(form.max_uses)) : null,
      };
      if (editing) {
        await discountCodeApi.update(editing.id, { ...payload, is_active: form.is_active });
      } else {
        await discountCodeApi.create(payload);
      }
      setModalOpen(false);
      refresh();
    } catch (e: unknown) {
      const maybeMsg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setFormError(typeof maybeMsg === 'string' ? maybeMsg : 'Could not save this code.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await discountCodeApi.remove(confirmDelete.id);
      setConfirmDelete(null);
      refresh();
    } catch {
      // silent
    } finally {
      setDeleting(false);
    }
  }

  // Sort: active first, then inactive, then expired — within each, newest first.
  const sortedCodes = [...codes].sort((a, b) => {
    const aExp = isExpired(a);
    const bExp = isExpired(b);
    if (aExp !== bExp) return aExp ? 1 : -1;
    if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
    return parseServerDate(b.created_at).getTime() - parseServerDate(a.created_at).getTime();
  });

  return (
    <PageLayout>
      <div className="max-w-5xl mx-auto px-4 md:px-8 py-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-[2px]" style={{ backgroundColor: BRONZE }} />
              <p className="text-xs tracking-[0.3em] uppercase text-[hsl(35,45%,42%)] font-medium">
                Manage
              </p>
            </div>
            <h1 className="font-serif text-2xl md:text-3xl font-bold text-[hsl(30,15%,18%)]">
              Discount Codes
            </h1>
            <p className="text-sm text-[hsl(30,10%,48%)] mt-1">
              Create codes shoppers can apply on your listings or business profile.
            </p>
          </div>
          <Button
            onClick={openCreate}
            size="sm"
            className="text-xs tracking-wider uppercase text-white cursor-pointer flex-shrink-0"
            style={{ backgroundColor: PRIMARY }}
          >
            <Plus className="w-4 h-4 mr-1.5" />
            New Code
          </Button>
        </div>

        {/* List */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-20 bg-[hsl(35,15%,92%)] rounded animate-pulse" />
            ))}
          </div>
        ) : sortedCodes.length === 0 ? (
          <div className="text-center py-16 border-2 border-dashed border-[hsl(35,18%,84%)] rounded-xl bg-[hsl(40,20%,98%)]">
            <div className="w-14 h-14 rounded-full bg-[hsl(35,15%,90%)] flex items-center justify-center mx-auto mb-4">
              <Tag className="w-7 h-7 text-[hsl(35,45%,42%)]" />
            </div>
            <p className="font-serif font-semibold text-[hsl(30,15%,25%)] mb-1">
              No discount codes yet
            </p>
            <p className="text-sm text-[hsl(30,10%,48%)] max-w-sm mx-auto mb-4">
              Your first code goes here.
            </p>
            <Button
              onClick={openCreate}
              size="sm"
              className="text-xs tracking-wider uppercase text-white cursor-pointer"
              style={{ backgroundColor: PRIMARY }}
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Create Code
            </Button>
          </div>
        ) : (
          <div className="border border-[hsl(35,18%,84%)] bg-[hsl(40,20%,98%)] rounded overflow-hidden">
            {/* Header row (desktop only) */}
            <div className="hidden md:grid grid-cols-[1.2fr_2fr_0.8fr_1fr_0.8fr_0.8fr_auto] gap-3 px-4 py-3 text-[10px] tracking-[0.2em] uppercase font-semibold text-[hsl(30,10%,50%)] border-b border-[hsl(35,18%,88%)] bg-[hsl(35,15%,94%)]">
              <div>Code</div>
              <div>Name</div>
              <div>Value</div>
              <div>Expiry</div>
              <div>Uses</div>
              <div>Status</div>
              <div className="text-right">Actions</div>
            </div>
            {sortedCodes.map((c) => {
              const s = statusLabel(c);
              return (
                <div
                  key={c.id}
                  className="grid grid-cols-1 md:grid-cols-[1.2fr_2fr_0.8fr_1fr_0.8fr_0.8fr_auto] gap-3 px-4 py-4 border-b border-[hsl(35,18%,88%)] last:border-b-0 items-center"
                >
                  {/* Code chip */}
                  <div>
                    <span
                      className="font-mono font-bold text-xs px-2.5 py-1.5 rounded text-white tracking-wider inline-block"
                      style={{ backgroundColor: BRONZE }}
                    >
                      {c.code}
                    </span>
                  </div>
                  {/* Name */}
                  <div className="min-w-0">
                    <p className="font-serif font-semibold text-sm text-[hsl(30,15%,18%)] truncate">
                      {c.name}
                    </p>
                    {c.description && (
                      <p className="text-xs text-[hsl(30,10%,55%)] truncate">{c.description}</p>
                    )}
                  </div>
                  {/* Value */}
                  <div className="text-sm font-semibold text-[hsl(30,15%,25%)]">
                    {formatValue(c)}
                    <span className="text-xs font-normal text-[hsl(30,10%,55%)] ml-0.5">
                      {c.discount_type === 'percentage' ? '' : ''}
                    </span>
                  </div>
                  {/* Expiry */}
                  <div className="text-xs text-[hsl(30,10%,48%)]">
                    {c.expiry_date ? formatExpiry(c.expiry_date) : <span className="italic">No expiry</span>}
                  </div>
                  {/* Uses */}
                  <div className="text-xs text-[hsl(30,10%,48%)] font-mono">
                    {c.max_uses != null ? `${c.usage_count} / ${c.max_uses}` : c.usage_count}
                  </div>
                  {/* Status */}
                  <div>
                    <span
                      className={`inline-block text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-sm ${s.cls}`}
                    >
                      {s.label}
                    </span>
                  </div>
                  {/* Actions */}
                  <div className="flex gap-1.5 md:justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openEdit(c)}
                      className="text-xs h-8 cursor-pointer border-[hsl(35,18%,84%)] text-[hsl(30,15%,30%)] hover:border-[hsl(35,45%,42%)]"
                    >
                      <Edit className="w-3.5 h-3.5 mr-1" />
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setConfirmDelete(c)}
                      className="text-xs h-8 cursor-pointer border-[hsl(0,30%,82%)] text-[hsl(0,50%,45%)] hover:bg-[hsl(0,50%,97%)]"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create / Edit modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif">
              {editing ? 'Edit Discount Code' : 'New Discount Code'}
            </DialogTitle>
            <DialogDescription>
              {editing ? 'Update the details below.' : 'Create a new code shoppers can apply.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1">
            {/* Code */}
            <div className="space-y-1.5">
              <Label htmlFor="dc-code" className="text-xs uppercase tracking-wider">
                Code
              </Label>
              <Input
                id="dc-code"
                value={form.code}
                onChange={(e) => {
                  // Auto-uppercase + strip disallowed chars as the user types.
                  const cleaned = e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '');
                  setForm({ ...form, code: cleaned.slice(0, 40) });
                }}
                placeholder="SPRING20"
                className="font-mono tracking-wider"
                maxLength={40}
              />
              <p className="text-[11px] text-[hsl(30,10%,55%)]">A-Z, 0-9, _ and -. 3-40 chars.</p>
            </div>

            {/* Name */}
            <div className="space-y-1.5">
              <Label htmlFor="dc-name" className="text-xs uppercase tracking-wider">
                Name
              </Label>
              <Input
                id="dc-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value.slice(0, 120) })}
                placeholder="Spring Sale"
                maxLength={120}
              />
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label htmlFor="dc-desc" className="text-xs uppercase tracking-wider">
                Description <span className="text-[hsl(30,10%,55%)] normal-case">(optional)</span>
              </Label>
              <Textarea
                id="dc-desc"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value.slice(0, 280) })}
                placeholder="Spring savings on our seasonal offerings."
                rows={2}
                maxLength={280}
              />
              <p className="text-[11px] text-[hsl(30,10%,55%)] text-right">
                {form.description.length}/280
              </p>
            </div>

            {/* Discount type — segmented */}
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider">Discount type</Label>
              <div className="grid grid-cols-2 gap-1 p-1 border border-[hsl(35,18%,84%)] rounded bg-[hsl(35,15%,94%)]">
                {(
                  [
                    { v: 'percentage', label: 'Percentage', Icon: Percent },
                    { v: 'flat', label: 'Flat dollar amount', Icon: DollarSign },
                  ] as { v: DiscountType; label: string; Icon: typeof Percent }[]
                ).map(({ v, label, Icon }) => {
                  const active = form.discount_type === v;
                  return (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setForm({ ...form, discount_type: v })}
                      className={`flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium uppercase tracking-wider rounded transition-colors cursor-pointer ${
                        active
                          ? 'text-white'
                          : 'text-[hsl(30,10%,45%)] hover:text-[hsl(30,15%,25%)]'
                      }`}
                      style={active ? { backgroundColor: PRIMARY } : {}}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Discount value (kept in separate state per type, so toggling preserves input) */}
            <div className="space-y-1.5">
              <Label htmlFor="dc-value" className="text-xs uppercase tracking-wider">
                Discount value
              </Label>
              {form.discount_type === 'percentage' ? (
                <div className="relative">
                  <Input
                    id="dc-value"
                    type="number"
                    min={1}
                    max={100}
                    step={1}
                    value={form.percentage_input}
                    onChange={(e) => setForm({ ...form, percentage_input: e.target.value })}
                    placeholder="20"
                    className="pr-8"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[hsl(30,10%,55%)] pointer-events-none">
                    %
                  </span>
                </div>
              ) : (
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[hsl(30,10%,55%)] pointer-events-none">
                    $
                  </span>
                  <Input
                    id="dc-value"
                    type="number"
                    min={0.01}
                    step={0.01}
                    value={form.flat_dollars_input}
                    onChange={(e) => setForm({ ...form, flat_dollars_input: e.target.value })}
                    placeholder="5.00"
                    className="pl-7"
                  />
                </div>
              )}
            </div>

            {/* Expiry + Max uses */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="dc-expiry" className="text-xs uppercase tracking-wider">
                  Expiry <span className="text-[hsl(30,10%,55%)] normal-case">(optional)</span>
                </Label>
                <Input
                  id="dc-expiry"
                  type="date"
                  value={form.expiry_date}
                  onChange={(e) => setForm({ ...form, expiry_date: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dc-uses" className="text-xs uppercase tracking-wider">
                  Max uses <span className="text-[hsl(30,10%,55%)] normal-case">(optional)</span>
                </Label>
                <Input
                  id="dc-uses"
                  type="number"
                  min={1}
                  step={1}
                  value={form.max_uses}
                  onChange={(e) => setForm({ ...form, max_uses: e.target.value })}
                  placeholder="Unlimited"
                />
              </div>
            </div>

            {/* Active toggle (edit only) */}
            {editing && (
              <div className="flex items-center justify-between pt-1 border-t border-[hsl(35,18%,88%)]">
                <div>
                  <Label htmlFor="dc-active" className="text-sm font-medium">
                    Active
                  </Label>
                  <p className="text-[11px] text-[hsl(30,10%,55%)] mt-0.5">
                    Inactive codes are hidden from customers.
                  </p>
                </div>
                <Switch
                  id="dc-active"
                  checked={form.is_active}
                  onCheckedChange={(v) => setForm({ ...form, is_active: v })}
                />
              </div>
            )}

            {formError && (
              <div className="text-xs text-[hsl(0,55%,40%)] bg-[hsl(0,30%,96%)] border border-[hsl(0,30%,88%)] rounded p-2.5">
                {formError}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setModalOpen(false)}
              disabled={saving}
              className="cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="text-white cursor-pointer"
              style={{ backgroundColor: PRIMARY }}
            >
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Create code'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!confirmDelete} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this discount code?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete && (
                <>
                  <span className="font-mono font-semibold">{confirmDelete.code}</span> will be permanently removed.
                  This action cannot be undone.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageLayout>
  );
}
