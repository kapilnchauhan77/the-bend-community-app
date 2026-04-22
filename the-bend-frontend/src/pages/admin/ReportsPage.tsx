import { useState, useEffect } from 'react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { adminApi } from '@/services/adminApi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, TrendingUp, Store, FileText, CheckCircle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

type Period = 'week' | 'month' | 'quarter';

interface ReportData {
  period: string;
  new_shops: number;
  active_listings: number;
  fulfilled_listings: number;
  listings_by_category: Record<string, number>;
}

const PRIMARY = 'hsl(160, 25%, 24%)';
const BRONZE = 'hsl(35, 45%, 42%)';

const PERIODS: Array<{ value: Period; label: string }> = [
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'quarter', label: 'This Quarter' },
];

const CATEGORY_COLORS: Record<string, string> = {
  staff: '#2d6a3f',
  materials: '#8b6914',
  equipment: '#3b5998',
};

const PIE_COLORS = ['#2d6a3f', '#8b6914', '#3b5998', '#7c3aed', '#be185d'];

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

  // Transform category data for charts
  const categoryDisplayName = (cat: string) => cat === 'staff' ? 'Gigs' : cat.charAt(0).toUpperCase() + cat.slice(1);

  const categoryData = data?.listings_by_category
    ? Object.entries(data.listings_by_category).map(([category, count]) => ({
        name: categoryDisplayName(category),
        count,
        fill: CATEGORY_COLORS[category] || '#666',
      }))
    : [];

  const totalListings = categoryData.reduce((sum, c) => sum + c.count, 0);

  const statCards = data
    ? [
        { icon: Store, label: 'New Businesses', value: data.new_shops, color: 'text-[hsl(160,25%,28%)]', bg: 'bg-[hsl(35,15%,94%)]', iconColor: PRIMARY },
        { icon: FileText, label: 'Active Listings', value: data.active_listings, color: 'text-blue-600', bg: 'bg-blue-50', iconColor: '#3b5998' },
        { icon: CheckCircle, label: 'Fulfilled', value: data.fulfilled_listings, color: 'text-amber-600', bg: 'bg-amber-50', iconColor: '#8b6914' },
        { icon: TrendingUp, label: 'Total by Category', value: totalListings, color: 'text-purple-600', bg: 'bg-purple-50', iconColor: '#7c3aed' },
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

          <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-lg">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all cursor-pointer ${
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

            {/* Charts row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Bar Chart */}
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold">Listings by Category</CardTitle>
                </CardHeader>
                <CardContent>
                  {categoryData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={categoryData} margin={{ top: 10, right: 10, left: -10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(35, 18%, 84%)" />
                        <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'hsl(30, 10%, 48%)' }} />
                        <YAxis tick={{ fontSize: 12, fill: 'hsl(30, 10%, 48%)' }} allowDecimals={false} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'hsl(40, 20%, 98%)',
                            border: '1px solid hsl(35, 18%, 84%)',
                            borderRadius: '4px',
                            fontSize: '13px',
                          }}
                        />
                        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                          {categoryData.map((entry, index) => (
                            <Cell key={index} fill={entry.fill} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-12">No category data available</p>
                  )}
                </CardContent>
              </Card>

              {/* Pie Chart */}
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold">Category Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  {categoryData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={250}>
                      <PieChart>
                        <Pie
                          data={categoryData}
                          cx="50%"
                          cy="50%"
                          innerRadius={55}
                          outerRadius={90}
                          paddingAngle={3}
                          dataKey="count"
                          nameKey="name"
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                          labelLine={false}
                        >
                          {categoryData.map((_, index) => (
                            <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'hsl(40, 20%, 98%)',
                            border: '1px solid hsl(35, 18%, 84%)',
                            borderRadius: '4px',
                            fontSize: '13px',
                          }}
                        />
                        <Legend
                          verticalAlign="bottom"
                          height={36}
                          formatter={(value: string) => <span style={{ color: 'hsl(30, 10%, 48%)', fontSize: '12px' }}>{value}</span>}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-12">No category data available</p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Horizontal bars (kept as secondary view) */}
            {categoryData.length > 0 && (
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold">Category Breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {categoryData.map((item) => {
                      const maxCount = Math.max(...categoryData.map(c => c.count), 1);
                      const pct = Math.round((item.count / maxCount) * 100);
                      return (
                        <div key={item.name} className="space-y-1">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium text-gray-700">{item.name}</span>
                            <span className="tabular-nums text-muted-foreground">{item.count}</span>
                          </div>
                          <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{ width: `${pct}%`, backgroundColor: item.fill }}
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
