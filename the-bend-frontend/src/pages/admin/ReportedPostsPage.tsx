import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { adminApi } from '@/services/adminApi';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, Loader2, Flag, ExternalLink } from 'lucide-react';

interface Report {
  id: string;
  listing_id: string;
  listing_title: string;
  reporter_name: string;
  reason: string;
  details?: string;
  resolved: boolean;
  created_at: string;
}

type TabValue = 'all' | 'pending' | 'resolved';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function ReasonBadge({ reason }: { reason: string }) {
  switch (reason.toLowerCase()) {
    case 'inappropriate':
      return (
        <Badge variant="outline" className="text-red-700 border-red-200 bg-red-50 capitalize">
          {reason}
        </Badge>
      );
    case 'spam':
      return (
        <Badge variant="outline" className="text-orange-700 border-orange-200 bg-orange-50 capitalize">
          {reason}
        </Badge>
      );
    case 'misleading':
      return (
        <Badge variant="outline" className="text-amber-700 border-amber-200 bg-amber-50 capitalize">
          {reason}
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="text-gray-600 border-gray-200 bg-gray-50 capitalize">
          {reason}
        </Badge>
      );
  }
}

function StatusBadge({ resolved }: { resolved: boolean }) {
  if (resolved) {
    return (
      <Badge variant="outline" className="text-green-700 border-green-200 bg-green-50">
        Resolved
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-red-700 border-red-200 bg-red-50">
      Pending
    </Badge>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl border p-5 shadow-sm animate-pulse space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="h-4 bg-gray-200 rounded w-2/5" />
        <div className="h-5 bg-gray-200 rounded w-16" />
      </div>
      <div className="h-3 bg-gray-100 rounded w-1/4" />
      <div className="flex gap-2">
        <div className="h-5 bg-gray-100 rounded w-20" />
        <div className="h-5 bg-gray-100 rounded w-14" />
      </div>
      <div className="h-3 bg-gray-100 rounded w-3/4" />
    </div>
  );
}

const TABS: Array<{ value: TabValue; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'resolved', label: 'Resolved' },
];

export default function ReportedPostsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabValue>('all');
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (tab === 'pending') params.resolved = 'false';
      if (tab === 'resolved') params.resolved = 'true';
      const res = await adminApi.getReportedPosts(params);
      setReports(res.data?.items ?? res.data ?? []);
    } catch {
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const handleResolve = async (reportId: string) => {
    setResolvingId(reportId);
    try {
      await adminApi.resolveReport(reportId);
      setReports((prev) =>
        prev.map((r) => (r.id === reportId ? { ...r, resolved: true } : r))
      );
    } catch {
      // silently fail — leave state unchanged
    } finally {
      setResolvingId(null);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reported Posts</h1>
          <p className="text-sm text-muted-foreground mt-1">Review flagged listings</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b">
          {TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === t.value
                  ? 'border-[hsl(160,25%,24%)] text-[hsl(160,25%,24%)]'
                  : 'border-transparent text-muted-foreground hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        {loading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : reports.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <Flag size={40} className="mx-auto mb-3 opacity-25" />
            <p className="text-sm">No reports found.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {reports.map((report) => (
              <div
                key={report.id}
                className="bg-white rounded-xl border shadow-sm p-5 space-y-3"
              >
                {/* Top row */}
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <Link
                      to={`/listing/${report.listing_id}`}
                      className="font-semibold text-[hsl(160,25%,24%)] hover:underline truncate block"
                    >
                      {report.listing_title}
                    </Link>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Reported by{' '}
                      <span className="font-medium text-gray-700">{report.reporter_name}</span>
                      {' · '}
                      {timeAgo(report.created_at)}
                    </p>
                  </div>
                  <StatusBadge resolved={report.resolved} />
                </div>

                {/* Badges row */}
                <div className="flex items-center gap-2 flex-wrap">
                  <ReasonBadge reason={report.reason} />
                  {report.details && (
                    <span className="text-xs text-muted-foreground italic">
                      "{report.details}"
                    </span>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-1">
                  <Link to={`/listing/${report.listing_id}`}>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-[hsl(160,25%,24%)] border-[hsl(35,18%,84%)] hover:bg-[hsl(35,15%,94%)]"
                    >
                      <ExternalLink size={13} />
                      View Listing
                    </Button>
                  </Link>
                  {!report.resolved && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-green-700 border-green-200 hover:bg-green-50"
                      onClick={() => handleResolve(report.id)}
                      disabled={resolvingId === report.id}
                    >
                      {resolvingId === report.id ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <CheckCircle size={13} />
                      )}
                      Resolve
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
