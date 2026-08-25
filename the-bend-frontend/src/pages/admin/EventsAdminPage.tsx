import { useState, useEffect, useCallback } from 'react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { eventApi } from '@/services/eventApi';
import { uploadApi } from '@/services/uploadApi';
import { resolveAssetUrl } from '@/lib/constants';
import type { CommunityEvent, EventCategory } from '@/types';
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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Plus, Pencil, Trash2, Loader2, CalendarDays, Upload } from 'lucide-react';

const PRIMARY = 'hsl(160, 25%, 24%)';

const ALL_CATEGORIES: EventCategory[] = [
  'community', 'music', 'art', 'food', 'market', 'historic', 'outdoor', 'education',
];

const CATEGORY_COLORS: Record<EventCategory, string> = {
  community: 'bg-blue-50 text-blue-700 border-blue-200',
  music:     'bg-purple-50 text-purple-700 border-purple-200',
  art:       'bg-pink-50 text-pink-700 border-pink-200',
  food:      'bg-orange-50 text-orange-700 border-orange-200',
  market:    'bg-yellow-50 text-yellow-700 border-yellow-200',
  historic:  'bg-amber-50 text-amber-700 border-amber-200',
  outdoor:   'bg-[hsl(35,15%,94%)] text-[hsl(160,25%,24%)] border-[hsl(35,18%,84%)]',
  education: 'bg-indigo-50 text-indigo-700 border-indigo-200',
};

function categoryBadge(cat: EventCategory) {
  return (
    <Badge variant="outline" className={`capitalize ${CATEGORY_COLORS[cat]}`}>
      {cat}
    </Badge>
  );
}

function statusBadge(status: string) {
  switch (status) {
    case 'pending':
      return <Badge variant="outline" className="text-amber-700 border-amber-200 bg-amber-50">Pending</Badge>;
    case 'rejected':
      return <Badge variant="outline" className="text-red-600 border-red-200 bg-red-50">Rejected</Badge>;
    case 'cancelled':
      return <Badge variant="outline" className="text-red-600 border-red-200 bg-red-50">Cancelled</Badge>;
    case 'active':
      return <Badge variant="outline" className="text-[hsl(160,25%,24%)] border-[hsl(35,18%,84%)] bg-[hsl(35,15%,94%)]">Active</Badge>;
    default:
      return <Badge variant="outline" className="text-gray-500 border-gray-200 bg-gray-50">Past</Badge>;
  }
}

function safeDocumentUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  if (url.startsWith('/uploads/')) return resolveAssetUrl(url);
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}

function safePhotoUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  if (url.startsWith('/uploads/')) return resolveAssetUrl(url);
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function formatDateTimeLocal(iso: string) {
  // Converts ISO to datetime-local input format: "YYYY-MM-DDTHH:mm"
  return iso ? iso.slice(0, 16) : '';
}

interface EventFormData {
  title: string;
  description: string;
  start_date: string;
  end_date: string;
  location: string;
  category: EventCategory;
  image_url: string;
  is_featured: boolean;
}

type ImagePreviewStatus = 'empty' | 'loading' | 'valid' | 'invalid';

const EMPTY_FORM: EventFormData = {
  title: '',
  description: '',
  start_date: '',
  end_date: '',
  location: '',
  category: 'community',
  image_url: '',
  is_featured: false,
};

export default function EventsAdminPage() {
  const [categoryFilter, setCategoryFilter] = useState<'all' | EventCategory>('all');
  const [events, setEvents] = useState<CommunityEvent[]>([]);
  const [pendingEvents, setPendingEvents] = useState<CommunityEvent[]>([]);
  const [pendingLoadError, setPendingLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [reviewError, setReviewError] = useState('');

  // Create/Edit dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<CommunityEvent | null>(null);
  const [form, setForm] = useState<EventFormData>(EMPTY_FORM);
  const [imagePreviewStatus, setImagePreviewStatus] = useState<ImagePreviewStatus>('empty');
  const [imageUploading, setImageUploading] = useState(false);
  const [imageError, setImageError] = useState('');

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = useState<CommunityEvent | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (categoryFilter !== 'all') params.category = categoryFilter;
      const res = await eventApi.adminList(params);
      setEvents(res.data?.items ?? res.data?.events ?? res.data ?? []);
    } catch {
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [categoryFilter]);

  const fetchPendingEvents = useCallback(async () => {
    setPendingLoadError('');
    try {
      const res = await eventApi.adminList({ status: 'pending', limit: '50' });
      setPendingEvents(res.data?.items ?? res.data?.events ?? res.data ?? []);
    } catch {
      setPendingEvents([]);
      setPendingLoadError('Pending reviews could not be loaded. Please try again.');
    }
  }, []);

  useEffect(() => {
    fetchEvents();
    fetchPendingEvents();
  }, [fetchEvents, fetchPendingEvents]);

  const reviewEvent = async (event: CommunityEvent, action: 'approve' | 'reject') => {
    setReviewError('');
    try {
      await eventApi[action](event.id);
      await Promise.all([fetchPendingEvents(), fetchEvents()]);
    } catch {
      setReviewError(`Failed to ${action} event. Please try again.`);
    }
  };

  const openCreate = () => {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setImagePreviewStatus('empty');
    setImageError('');
    setError('');
    setDialogOpen(true);
  };

  const openEdit = (event: CommunityEvent) => {
    setEditTarget(event);
    setForm({
      title: event.title,
      description: event.description ?? '',
      start_date: formatDateTimeLocal(event.start_date),
      end_date: event.end_date ? formatDateTimeLocal(event.end_date) : '',
      location: event.location ?? '',
      category: event.category,
      image_url: event.image_url ?? '',
      is_featured: event.is_featured,
    });
    setImagePreviewStatus(event.image_url ? (safePhotoUrl(event.image_url) ? 'loading' : 'invalid') : 'empty');
    setImageError('');
    setError('');
    setDialogOpen(true);
  };

  const handlePhotoUpload = async (file: File) => {
    setImageUploading(true);
    setImageError('');
    try {
      const { data } = await uploadApi.uploadPhoto(file);
      setForm((current) => ({ ...current, image_url: data.photo_url }));
      setImagePreviewStatus('loading');
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
      setImageError(typeof detail === 'string' ? detail : 'Photo upload failed. Please try again.');
    } finally {
      setImageUploading(false);
    }
  };

  const handleSave = async () => {
    if (!form.title.trim()) { setError('Title is required.'); return; }
    if (!form.start_date) { setError('Start date is required.'); return; }
    if (form.image_url.trim() && imagePreviewStatus === 'invalid') {
      setError('Upload the photo or use a direct image URL before saving.');
      return;
    }
    if (form.image_url.trim() && imagePreviewStatus === 'loading') {
      setError('Wait for the photo preview to finish loading before saving.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        start_date: form.start_date,
        end_date: form.end_date || undefined,
        location: form.location.trim() || undefined,
        category: form.category,
        image_url: form.image_url.trim() || undefined,
        is_featured: form.is_featured,
      };
      if (editTarget) {
        await eventApi.update(editTarget.id, {
          ...payload,
          image_url: form.image_url.trim() || null,
        });
      } else {
        await eventApi.create(payload);
      }
      setDialogOpen(false);
      fetchEvents();
    } catch {
      setError('Failed to save event. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await eventApi.delete(deleteTarget.id);
      setDeleteTarget(null);
      fetchEvents();
    } catch {
      // silent
    } finally {
      setDeleting(false);
    }
  };

  const filteredEvents = categoryFilter === 'all'
    ? events
    : events.filter((e) => e.category === categoryFilter);

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Events</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage community events
            </p>
          </div>
          <Button
            onClick={openCreate}
            className="gap-1.5 text-white"
            style={{ backgroundColor: PRIMARY }}
          >
            <Plus size={16} />
            Create Event
          </Button>
        </div>

        {(pendingEvents.length > 0 || pendingLoadError) && (
          <section aria-label="Pending event reviews" className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 space-y-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Pending event reviews</h2>
              <p className="text-sm text-muted-foreground">Review community submissions before they go live.</p>
            </div>
            {reviewError && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700">{reviewError}</p>}
            {pendingLoadError && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700">{pendingLoadError}</p>}
            <div className="grid gap-3">
              {pendingEvents.map((event) => (
                <article key={event.id} className="rounded-lg border bg-white p-4 min-w-0">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <h3 className="font-semibold break-words">{event.title}</h3>
                      <p className="text-sm text-muted-foreground">{formatDate(event.start_date)} · {event.location || 'No location'}</p>
                      <p className="text-sm break-words">Submitted by: <span className="font-medium">{event.submitted_by_name || 'Unknown'}</span> · {event.submitted_by_email || 'No email'}</p>
                      <p className="text-sm">Organization type: <span className="font-medium">{event.organization_type || (event.is_nonprofit ? 'verified_nonprofit' : 'for_profit')}</span></p>
                      {event.nonprofit_doc_url && (safeDocumentUrl(event.nonprofit_doc_url) ? <a className="text-sm text-blue-700 underline break-all" href={safeDocumentUrl(event.nonprofit_doc_url)} target="_blank" rel="noopener noreferrer">View nonprofit document</a> : <span className="text-sm text-muted-foreground">Nonprofit document unavailable</span>)}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button size="sm" onClick={() => reviewEvent(event, 'approve')} style={{ backgroundColor: PRIMARY }} className="text-white">Approve</Button>
                      <Button size="sm" variant="outline" onClick={() => reviewEvent(event, 'reject')} className="text-red-600 border-red-200">Reject</Button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {/* Category filter tabs */}
        <Tabs value={categoryFilter} onValueChange={(v) => setCategoryFilter(v as typeof categoryFilter)}>
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="all">All</TabsTrigger>
            {ALL_CATEGORIES.map((cat) => (
              <TabsTrigger key={cat} value={cat} className="capitalize">{cat}</TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value={categoryFilter} className="mt-4">
            {loading ? (
              <div className="rounded-xl border bg-white overflow-hidden shadow-sm">
                <div className="p-4 space-y-3">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              </div>
            ) : filteredEvents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
                <CalendarDays size={40} className="opacity-30" />
                <p>No events found{categoryFilter !== 'all' ? ` in "${categoryFilter}"` : ''}.</p>
                <Button variant="outline" size="sm" onClick={openCreate}>Create one</Button>
              </div>
            ) : (
              <div className="rounded-xl border bg-white overflow-hidden shadow-sm">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50/60">
                      <TableHead className="pl-4">Title</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right pr-4">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEvents.map((event) => (
                      <TableRow key={event.id}>
                        <TableCell className="pl-4 font-medium max-w-[220px]">
                          <span className="truncate block">{event.title}</span>
                          {event.is_featured && (
                            <span className="text-xs text-amber-600 font-normal">Featured</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {formatDate(event.start_date)}
                        </TableCell>
                        <TableCell>{categoryBadge(event.category)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground capitalize">
                          {event.source}
                        </TableCell>
                        <TableCell>{statusBadge(event.status)}</TableCell>
                        <TableCell className="text-right pr-4">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1.5"
                              onClick={() => openEdit(event)}
                            >
                              <Pencil size={13} />
                              Edit
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50"
                              onClick={() => setDeleteTarget(event)}
                            >
                              <Trash2 size={13} />
                              Delete
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editTarget ? 'Edit Event' : 'Create Event'}</DialogTitle>
            <DialogDescription>
              {editTarget ? 'Update the event details below.' : 'Fill in the details for the new event.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="ev-title">Title *</Label>
              <Input
                id="ev-title"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Event title"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ev-desc">Description</Label>
              <Textarea
                id="ev-desc"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Event description"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ev-start">Start Date *</Label>
                <Input
                  id="ev-start"
                  type="datetime-local"
                  value={form.start_date}
                  onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ev-end">End Date</Label>
                <Input
                  id="ev-end"
                  type="datetime-local"
                  value={form.end_date}
                  onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ev-location">Location</Label>
              <Input
                id="ev-location"
                value={form.location}
                onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                placeholder="e.g. The Bend Community Hall"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ev-category">Category</Label>
              <Select
                value={form.category}
                onValueChange={(v) => setForm((f) => ({ ...f, category: v as EventCategory }))}
              >
                <SelectTrigger id="ev-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALL_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat} className="capitalize">{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ev-image">Photo URL</Label>
              <Input
                id="ev-image"
                value={form.image_url}
                onChange={(e) => {
                  const imageUrl = e.target.value;
                  setForm((current) => ({ ...current, image_url: imageUrl }));
                  setImagePreviewStatus(imageUrl.trim() ? (safePhotoUrl(imageUrl.trim()) ? 'loading' : 'invalid') : 'empty');
                  setImageError('');
                  setError('');
                }}
                placeholder="https://..."
              />
              <p className="text-xs text-muted-foreground">
                Use a direct JPG, PNG, or WebP image URL. A Facebook page link is not a photo URL.
              </p>

              {form.image_url.trim() && imagePreviewStatus !== 'invalid' && (
                <div className="overflow-hidden rounded-lg border bg-gray-50">
                  <img
                    key={form.image_url.trim()}
                    src={safePhotoUrl(form.image_url.trim())}
                    alt="Photo preview"
                    onLoad={() => setImagePreviewStatus('valid')}
                    onError={() => setImagePreviewStatus('invalid')}
                    className="h-48 w-full object-contain bg-white"
                  />
                </div>
              )}

              {imagePreviewStatus === 'invalid' && (
                <p role="alert" className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                  This link is a webpage, not a displayable photo.
                </p>
              )}

              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  disabled={imageUploading}
                  onClick={() => document.getElementById('ev-photo-upload')?.click()}
                >
                  {imageUploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                  {imageUploading ? 'Uploading...' : 'Upload photo'}
                </Button>
                {form.image_url && (
                  <button
                    type="button"
                    className="text-xs text-red-600 hover:underline"
                    onClick={() => {
                      setForm((current) => ({ ...current, image_url: '' }));
                      setImagePreviewStatus('empty');
                      setImageError('');
                      setError('');
                    }}
                  >
                    Remove photo
                  </button>
                )}
                <input
                  id="ev-photo-upload"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  disabled={imageUploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handlePhotoUpload(file);
                    e.target.value = '';
                  }}
                />
              </div>
              {imageError && <p role="alert" className="text-xs text-red-600">{imageError}</p>}
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="ev-featured"
                checked={form.is_featured}
                onCheckedChange={(checked) =>
                  setForm((f) => ({ ...f, is_featured: checked === true }))
                }
              />
              <Label htmlFor="ev-featured" className="cursor-pointer">
                Feature this event
              </Label>
            </div>

            {error && <p className="text-xs text-red-500">{error}</p>}
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
                  Saving...
                </span>
              ) : editTarget ? 'Save Changes' : 'Create Event'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Event</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{' '}
              <span className="font-semibold text-foreground">{deleteTarget?.title}</span>?
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
                  Deleting...
                </span>
              ) : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
