import { useState, useEffect } from 'react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { adminApi } from '@/services/adminApi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, TrendingUp, Store, FileText, Users } from 'lucide-react';

type Period = 'week' | 'month' | 'quarter';

interface CategoryStat {
  category: string;
  count: number;
}

interface ReportData {
  new_registrations: number;
  new_shops: number;
  new_listings: number;
  active_users: number;
  listings_by_category: CategoryStat[];
  period_label?: string;
}

const PRIMARY = 'hsl(160, 25%, 24%)';

const PERIODS: Array<{ value: Period; label: string }> = [
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'quarter', label: 'This Quarter' },
];

export default function ReportsPage() {
  const [period, setPeriod] = useState<Period>('month');
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    adminApi
      .getReports(period)
      .then((r) => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [period]);

  const maxCategoryCount = data?.listings_by_category?.length
    ? Math.max(...data.listings_by_category.map((c) => c.count), 1)
    : 1;

  const statCards = data
    ? [
        {
          icon: Users,
          label: 'New Registrations',
          value: data.new_registrations,
          color: 'text-[hsl(160,25%,28%)]',
          bg: 'bg-[hsl(35,15%,94%)]',
          iconColor: PRIMARY,
        },
        {
          icon: Store,
          label: 'New Businesses',
          value: data.new_shops,
          color: 'text-blue-600',
          bg: 'bg-blue-50',
          iconColor: 'hsl(217, 91%, 52%)',
        },
        {
          icon: FileText,
          label: 'New Listings',
          value: data.new_listings,
          color: 'text-amber-600',
          bg: 'bg-amber-50',
          iconColor: 'hsl(43, 96%, 44%)',
        },
        {
          icon: TrendingUp,
          label: 'Active Users',
          value: data.active_users,
          color: 'text-purple-600',
          bg: 'bg-purple-50',
          iconColor: 'hsl(271, 81%, 56%)',
        },
      ]
    : [];

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Community activity and growth metrics
            </p>
          </div>

          {/* Period selector */}
          <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-lg">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                  period === p.value
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24 text-muted-foreground gap-2">
            <Loader2 size={20} className="animate-spin" />
            Loading report...
          </div>
        ) : !data ? (
          <div className="text-center py-24 text-muted-foreground">
            Failed to load report data. Please try again.
          </div>
        ) : (
          <>
            {/* Stat cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {statCards.map((stat) => (
                <Card key={stat.label} className="border-0 shadow-sm">
                  <CardContent className="pt-5 pb-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl ${stat.bg} flex items-center justify-center`}>
                        <stat.icon size={20} style={{ color: stat.iconColor }} />
                      </div>
                      <div>
                        <div className={`text-2xl font-bold tabular-nums ${stat.color}`}>
                          {stat.value}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Listings by category */}
            {data.listings_by_category?.length > 0 && (
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold">Listings by Category</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {data.listings_by_category.map((item) => {
                      const pct = Math.round((item.count / maxCategoryCount) * 100);
                      return (
                        <div key={item.category} className="space-y-1">
                          <div className="flex items-center justify-between text-sm">
                            <span className="capitalize font-medium text-gray-700">
                              {item.category}
                            </span>
                            <span className="tabular-nums text-muted-foreground">{item.count}</span>
                          </div>
                          <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{
                                width: `${pct}%`,
                                backgroundColor: PRIMARY,
                                opacity: 0.7 + (pct / 100) * 0.3,
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  );
}
