import { useState, useEffect, useCallback } from 'react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { eventApi } from '@/services/eventApi';
import type { EventConnector, EventCategory, ConnectorType } from '@/types';
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
  Plus,
  RefreshCw,
  Pencil,
  Trash2,
  Loader2,
  Link2,
  Zap,
  FlaskConical,
  AlertCircle,
  CheckCircle2,
  WifiOff,
} from 'lucide-react';
function formatDistanceToNow(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? '' : 's'} ago`;
}

const PRIMARY = 'hsl(160, 25%, 24%)';

const ALL_CATEGORIES: EventCategory[] = [
  'community', 'music', 'art', 'food', 'market', 'historic', 'outdoor', 'education',
];

const CONNECTOR_TYPES: ConnectorType[] = ['ics', 'rss', 'html'];

const TYPE_COLORS: Record<ConnectorType, string> = {
  ics:  'bg-blue-50 text-blue-700 border-blue-200',
  rss:  'bg-orange-50 text-orange-700 border-orange-200',
  html: 'bg-purple-50 text-purple-700 border-purple-200',
};

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

interface ConnectorFormData {
  name: string;
  type: ConnectorType;
  url: string;
  category: EventCategory;
  is_active: boolean;
  // HTML-specific config
  title_selector: string;
  date_selector: string;
  description_selector: string;
  link_selector: string;
}

const EMPTY_FORM: ConnectorFormData = {
  name: '',
  type: 'ics',
  url: '',
  category: 'community',
  is_active: true,
  title_selector: '',
  date_selector: '',
  description_selector: '',
  link_selector: '',
};

interface TestResult {
  count: number;
  sample: string[];
}

export default function ConnectorsPage() {
  const [connectors, setConnectors] = useState<EventConnector[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingAll, setSyncingAll] = useState(false);

  // Per-connector loading states
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, TestResult | null>>({});
  const [testErrors, setTestErrors] = useState<Record<string, string>>({});

  // Create/Edit dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<EventConnector | null>(null);
  const [form, setForm] = useState<ConnectorFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = useState<EventConnector | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchConnectors = useCallback(async () => {
    setLoading(true);
    try {
      const res = await eventApi.getConnectors();
      setConnectors(res.data?.items ?? res.data?.connectors ?? res.data ?? []);
    } catch {
      setConnectors([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConnectors();
  }, [fetchConnectors]);

  const handleSyncAll = async () => {
    setSyncingAll(true);
    try {
      await eventApi.syncAll();
      fetchConnectors();
    } catch {
      // silent
    } finally {
      setSyncingAll(false);
    }
  };

  const handleSync = async (connector: EventConnector) => {
    setSyncingId(connector.id);
    try {
      await eventApi.syncConnector(connector.id);
      fetchConnectors();
    } catch {
      // silent
    } finally {
      setSyncingId(null);
    }
  };

  const handleTest = async (connector: EventConnector) => {
    setTestingId(connector.id);
    setTestResults((r) => ({ ...r, [connector.id]: null }));
    setTestErrors((e) => ({ ...e, [connector.id]: '' }));
    try {
      const res = await eventApi.testConnector(connector.id);
      const data = res.data;
      setTestResults((r) => ({
        ...r,
        [connector.id]: {
          count: data?.count ?? data?.events?.length ?? 0,
          sample: data?.sample ?? data?.events?.slice(0, 3).map((e: { title?: string }) => e?.title ?? '') ?? [],
        },
      }));
    } catch {
      setTestErrors((e) => ({ ...e, [connector.id]: 'Test failed. Check the URL or selectors.' }));
    } finally {
      setTestingId(null);
    }
  };

  const openCreate = () => {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setDialogOpen(true);
  };

  const openEdit = (connector: EventConnector) => {
    setEditTarget(connector);
    setForm({
      name: connector.name,
      type: connector.type,
      url: connector.url,
      category: connector.category,
      is_active: connector.is_active,
      title_selector: connector.config?.title_selector ?? '',
      date_selector: connector.config?.date_selector ?? '',
      description_selector: connector.config?.description_selector ?? '',
      link_selector: connector.config?.link_selector ?? '',
    });
    setFormError('');
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setFormError('Name is required.'); return; }
    if (!form.url.trim()) { setFormError('URL is required.'); return; }
    setSaving(true);
    setFormError('');
    try {
      const config: Record<string, string> = {};
      if (form.type === 'html') {
        if (form.title_selector) config.title_selector = form.title_selector;
        if (form.date_selector) config.date_selector = form.date_selector;
        if (form.description_selector) config.description_selector = form.description_selector;
        if (form.link_selector) config.link_selector = form.link_selector;
      }
      const payload = {
        name: form.name.trim(),
        type: form.type,
        url: form.url.trim(),
        category: form.category,
        is_active: form.is_active,
        config: Object.keys(config).length > 0 ? config : undefined,
      };
      if (editTarget) {
        await eventApi.updateConnector(editTarget.id, payload);
      } else {
        await eventApi.createConnector(payload);
      }
      setDialogOpen(false);
      fetchConnectors();
    } catch {
      setFormError('Failed to save connector. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await eventApi.deleteConnector(deleteTarget.id);
      setDeleteTarget(null);
      fetchConnectors();
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
            <h1 className="text-2xl font-bold text-gray-900">Event Sources</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage connectors that import events from external sources
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="gap-1.5"
              onClick={handleSyncAll}
              disabled={syncingAll}
            >
              {syncingAll ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <RefreshCw size={15} />
              )}
              Sync All
            </Button>
            <Button
              className="gap-1.5 text-white"
              style={{ backgroundColor: PRIMARY }}
              onClick={openCreate}
            >
              <Plus size={16} />
              Add Connector
            </Button>
          </div>
        </div>

        {/* Connector grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <Card key={i}>
                <CardContent className="p-5 space-y-3">
                  <Skeleton className="h-5 w-2/3" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-1/2" />
                  <div className="flex gap-2 pt-2">
                    <Skeleton className="h-8 w-16" />
                    <Skeleton className="h-8 w-16" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : connectors.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
            <Link2 size={40} className="opacity-30" />
            <p>No event connectors configured.</p>
            <Button variant="outline" size="sm" onClick={openCreate}>Add one</Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {connectors.map((connector) => {
              const isSyncing = syncingId === connector.id;
              const isTesting = testingId === connector.id;
              const testResult = testResults[connector.id];
              const testError = testErrors[connector.id];

              return (
                <Card key={connector.id} className="flex flex-col">
                  <CardContent className="p-5 flex flex-col gap-3 flex-1">
                    {/* Name + type */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-semibold text-gray-900 truncate">{connector.name}</span>
                        {connector.is_active ? (
                          <CheckCircle2 size={14} className="text-[hsl(160,25%,32%)] flex-shrink-0" title="Active" />
                        ) : (
                          <WifiOff size={14} className="text-gray-400 flex-shrink-0" title="Inactive" />
                        )}
                      </div>
                      <Badge
                        variant="outline"
                        className={`uppercase text-xs flex-shrink-0 ${TYPE_COLORS[connector.type]}`}
                      >
                        {connector.type}
                      </Badge>
                    </div>

                    {/* URL */}
                    <p className="text-xs text-muted-foreground truncate" title={connector.url}>
                      {connector.url}
                    </p>

                    {/* Category */}
                    <div>
                      <Badge
                        variant="outline"
                        className={`capitalize text-xs ${CATEGORY_COLORS[connector.category]}`}
                      >
                        {connector.category}
                      </Badge>
                    </div>

                    {/* Sync info */}
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      {connector.last_synced_at ? (
                        <p>
                          Last synced{' '}
                          {formatDistanceToNow(new Date(connector.last_synced_at))}
                          {connector.last_sync_count != null && (
                            <> &mdash; {connector.last_sync_count} events</>
                          )}
                        </p>
                      ) : (
                        <p>Never synced</p>
                      )}
                    </div>

                    {/* Error banner */}
                    {connector.last_sync_error && (
                      <div className="flex items-start gap-2 p-2 rounded-lg bg-red-50 border border-red-100 text-xs text-red-700">
                        <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
                        <span className="line-clamp-2">{connector.last_sync_error}</span>
                      </div>
                    )}

                    {/* Test result */}
                    {testResult && (
                      <div className="p-2 rounded-lg bg-[hsl(35,15%,94%)] border border-[hsl(35,18%,87%)] text-xs text-[hsl(160,25%,24%)] space-y-1">
                        <p className="font-medium">{testResult.count} events found</p>
                        {testResult.sample.length > 0 && (
                          <ul className="list-disc list-inside space-y-0.5">
                            {testResult.sample.map((title, i) => (
                              <li key={i} className="truncate">{title}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                    {testError && (
                      <div className="flex items-start gap-2 p-2 rounded-lg bg-red-50 border border-red-100 text-xs text-red-700">
                        <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
                        <span>{testError}</span>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex flex-wrap gap-2 pt-1 mt-auto">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-xs"
                        onClick={() => handleTest(connector)}
                        disabled={isTesting || isSyncing}
                      >
                        {isTesting ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <FlaskConical size={12} />
                        )}
                        Test
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-xs"
                        onClick={() => handleSync(connector)}
                        disabled={isSyncing || isTesting}
                      >
                        {isSyncing ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <Zap size={12} />
                        )}
                        Sync
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-xs"
                        onClick={() => openEdit(connector)}
                      >
                        <Pencil size={12} />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-xs text-red-600 border-red-200 hover:bg-red-50"
                        onClick={() => setDeleteTarget(connector)}
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

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editTarget ? 'Edit Connector' : 'Add Connector'}</DialogTitle>
            <DialogDescription>
              {editTarget
                ? 'Update this event source connector.'
                : 'Connect an external source to import events automatically.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="cn-name">Name *</Label>
              <Input
                id="cn-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. City Council Calendar"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cn-type">Type</Label>
                <Select
                  value={form.type}
                  onValueChange={(v) => setForm((f) => ({ ...f, type: v as ConnectorType }))}
                >
                  <SelectTrigger id="cn-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONNECTOR_TYPES.map((t) => (
                      <SelectItem key={t} value={t} className="uppercase">{t.toUpperCase()}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cn-category">Category</Label>
                <Select
                  value={form.category}
                  onValueChange={(v) => setForm((f) => ({ ...f, category: v as EventCategory }))}
                >
                  <SelectTrigger id="cn-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ALL_CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat} className="capitalize">{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cn-url">URL *</Label>
              <Input
                id="cn-url"
                value={form.url}
                onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                placeholder="https://..."
              />
            </div>

            {/* HTML-specific selectors */}
            {form.type === 'html' && (
              <div className="space-y-3 p-3 rounded-lg border bg-gray-50">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  HTML Selectors
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="cn-title-sel">Title Selector</Label>
                  <Input
                    id="cn-title-sel"
                    value={form.title_selector}
                    onChange={(e) => setForm((f) => ({ ...f, title_selector: e.target.value }))}
                    placeholder=".event-title"
                    className="bg-white"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cn-date-sel">Date Selector</Label>
                  <Input
                    id="cn-date-sel"
                    value={form.date_selector}
                    onChange={(e) => setForm((f) => ({ ...f, date_selector: e.target.value }))}
                    placeholder=".event-date"
                    className="bg-white"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cn-desc-sel">Description Selector</Label>
                  <Input
                    id="cn-desc-sel"
                    value={form.description_selector}
                    onChange={(e) => setForm((f) => ({ ...f, description_selector: e.target.value }))}
                    placeholder=".event-description"
                    className="bg-white"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cn-link-sel">Link Selector</Label>
                  <Input
                    id="cn-link-sel"
                    value={form.link_selector}
                    onChange={(e) => setForm((f) => ({ ...f, link_selector: e.target.value }))}
                    placeholder="a.event-link"
                    className="bg-white"
                  />
                </div>
              </div>
            )}

            <div className="flex items-center gap-2">
              <Checkbox
                id="cn-active"
                checked={form.is_active}
                onCheckedChange={(checked) =>
                  setForm((f) => ({ ...f, is_active: checked === true }))
                }
              />
              <Label htmlFor="cn-active" className="cursor-pointer">
                Active (enable automatic syncing)
              </Label>
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
                  Saving...
                </span>
              ) : editTarget ? 'Save Changes' : 'Add Connector'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Connector</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{' '}
              <span className="font-semibold text-foreground">{deleteTarget?.name}</span>?
              Events already imported will not be removed.
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
