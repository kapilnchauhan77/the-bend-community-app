import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { adminApi } from '@/services/adminApi';

interface Registration {
  id: string;
  name: string;
  business_type: string;
}

interface Listing {
  id: string;
  title: string;
  status: string;
  urgency: string;
}

interface DashboardData {
  pending_registrations: number;
  active_shops: number;
  active_listings: number;
  recent_registrations?: Registration[];
  recent_listings?: Listing[];
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi
      .getDashboard()
      .then((r) => {
        setData(r.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <AdminLayout>
        <div className="space-y-4">
          <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-28 bg-gray-200 rounded-xl animate-pulse" />
            ))}
          </div>
        </div>
      </AdminLayout>
    );
  }

  if (!data) {
    return (
      <AdminLayout>
        <div className="text-center py-20 text-muted-foreground">
          Failed to load dashboard data. Please refresh.
        </div>
      </AdminLayout>
    );
  }

  const urgencyClass = (urgency: string) => {
    if (urgency === 'urgent') return 'bg-amber-100 text-amber-700 border-amber-200';
    return 'bg-gray-100 text-gray-600 border-gray-200';
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Overview of community activity
          </p>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-6 pb-5">
              <div
                className="text-3xl font-bold tabular-nums"
                style={{ color: 'hsl(160, 25%, 24%)' }}
              >
                {data.pending_registrations}
              </div>
              <p className="text-sm text-muted-foreground mt-1">Pending Registrations</p>
              <div
                className="mt-3 h-1 w-12 rounded-full"
                style={{ backgroundColor: 'hsl(160, 25%, 24%)' }}
              />
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardContent className="pt-6 pb-5">
              <div className="text-3xl font-bold tabular-nums text-blue-600">
                {data.active_shops}
              </div>
              <p className="text-sm text-muted-foreground mt-1">Active Businesses</p>
              <div className="mt-3 h-1 w-12 rounded-full bg-blue-500" />
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardContent className="pt-6 pb-5">
              <div className="text-3xl font-bold tabular-nums text-amber-600">
                {data.active_listings}
              </div>
              <p className="text-sm text-muted-foreground mt-1">Active Listings</p>
              <div className="mt-3 h-1 w-12 rounded-full bg-amber-500" />
            </CardContent>
          </Card>
        </div>

        {/* Recent tables */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Recent Registrations</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {data.recent_registrations?.length ? (
                  data.recent_registrations.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between py-2.5 border-b last:border-0"
                    >
                      <div>
                        <p className="font-medium text-sm">{r.name}</p>
                        <p className="text-xs text-muted-foreground capitalize">
                          {r.business_type}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50">
                        Pending
                      </Badge>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No pending registrations
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Recent Listings</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {data.recent_listings?.length ? (
                  data.recent_listings.map((l) => (
                    <div
                      key={l.id}
                      className="flex items-center justify-between py-2.5 border-b last:border-0"
                    >
                      <div>
                        <p className="font-medium text-sm">{l.title}</p>
                        <p className="text-xs text-muted-foreground capitalize">{l.status}</p>
                      </div>
                      <Badge className={urgencyClass(l.urgency)} variant="outline">
                        {l.urgency}
                      </Badge>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No recent listings
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}
