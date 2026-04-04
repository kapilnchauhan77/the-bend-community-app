import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Phone,
  MapPin,
  MessageCircle,
  Edit,
  CheckCircle,
  Trash2,
  Loader2,
  UserPlus,
  Building2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { PageLayout } from '@/components/layout/PageLayout';
import { shopApi } from '@/services/shopApi';
import { listingApi } from '@/services/listingApi';
import { useAuthStore } from '@/stores/authStore';
import type { Listing } from '@/types';

interface Employee {
  id: string;
  name: string;
  role: string;
  skills?: string;
  is_available: boolean;
}

const urgencyStyles = {
  normal: 'bg-gray-100 text-gray-600',
  urgent: 'bg-amber-100 text-amber-700',
  critical: 'bg-red-100 text-red-600',
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function ListingRow({
  listing,
  onFulfill,
  onDelete,
}: {
  listing: Listing;
  onFulfill: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const navigate = useNavigate();
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border bg-white hover:bg-gray-50 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <Badge
            variant="secondary"
            className={urgencyStyles[listing.urgency]}
          >
            {listing.urgency.charAt(0).toUpperCase() + listing.urgency.slice(1)}
          </Badge>
          <Badge
            variant="secondary"
            className={listing.type === 'offer' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}
          >
            {listing.type === 'offer' ? 'Offer' : 'Request'}
          </Badge>
          <span className="text-xs text-muted-foreground">{timeAgo(listing.created_at)}</span>
        </div>
        <p className="font-medium text-sm truncate">{listing.title}</p>
        <p className="text-xs text-muted-foreground">
          {listing.interest_count} interested &middot;{' '}
          {listing.is_free ? 'FREE' : `$${listing.price}`}
        </p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <Button
          size="sm"
          variant="ghost"
          className="h-8 w-8 p-0"
          onClick={() => navigate(`/listing/${listing.id}/edit`)}
          title="Edit"
        >
          <Edit size={15} />
        </Button>

        {listing.status === 'active' && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0 text-green-600 hover:text-green-700 hover:bg-green-50"
                title="Mark Fulfilled"
              >
                <CheckCircle size={15} />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Mark as Fulfilled?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will close "{listing.title}" and mark it as fulfilled.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => onFulfill(listing.id)}
                  style={{ backgroundColor: 'hsl(142, 76%, 36%)' }}
                >
                  Confirm
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-50"
              title="Delete"
            >
              <Trash2 size={15} />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete listing?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete "{listing.title}". This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => onDelete(listing.id)}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

export default function MyShopPage() {
  const navigate = useNavigate();
  const { shop, isAuthenticated } = useAuthStore();

  const [activeListings, setActiveListings] = useState<Listing[]>([]);
  const [historyListings, setHistoryListings] = useState<Listing[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loadingListings, setLoadingListings] = useState(true);
  const [loadingEmployees, setLoadingEmployees] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadListings = useCallback(async () => {
    if (!shop) return;
    setLoadingListings(true);
    try {
      const { data } = await shopApi.getShopListings(shop.id);
      const items = (data as { items?: Listing[] }).items || (data as Listing[]);
      setActiveListings(items.filter((l: Listing) => l.status === 'active'));
      setHistoryListings(items.filter((l: Listing) => l.status !== 'active'));
    } catch {
      // silently fail
    } finally {
      setLoadingListings(false);
    }
  }, [shop]);

  const loadEmployees = useCallback(async () => {
    if (!shop) return;
    setLoadingEmployees(true);
    try {
      const { data } = await shopApi.getEmployees(shop.id);
      setEmployees((data as { items?: Employee[] }).items || (data as Employee[]));
    } catch {
      // silently fail
    } finally {
      setLoadingEmployees(false);
    }
  }, [shop]);

  useEffect(() => {
    if (!isAuthenticated || !shop) {
      navigate('/login');
      return;
    }
    loadListings();
    loadEmployees();
  }, [isAuthenticated, shop, loadListings, loadEmployees, navigate]);

  async function handleFulfill(id: string) {
    setActionLoading(id);
    try {
      await listingApi.fulfill(id);
      await loadListings();
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDelete(id: string) {
    setActionLoading(id);
    try {
      await listingApi.delete(id);
      await loadListings();
    } finally {
      setActionLoading(null);
    }
  }

  async function handleToggleAvailability(emp: Employee) {
    try {
      await shopApi.updateEmployee(shop!.id, emp.id, {
        is_available: !emp.is_available,
      });
      setEmployees((prev) =>
        prev.map((e) => (e.id === emp.id ? { ...e, is_available: !e.is_available } : e))
      );
    } catch {
      // silently fail
    }
  }

  async function handleDeleteEmployee(eid: string) {
    try {
      await shopApi.deleteEmployee(shop!.id, eid);
      setEmployees((prev) => prev.filter((e) => e.id !== eid));
    } catch {
      // silently fail
    }
  }

  if (!shop) {
    return (
      <PageLayout>
        <div className="max-w-3xl mx-auto px-4 py-16 text-center">
          <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">No shop found</h2>
          <p className="text-muted-foreground">You don't have a shop associated with your account.</p>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <div className="max-w-4xl mx-auto px-4 md:px-8 py-6">
        {/* Shop profile header */}
        <Card className="mb-6 border-gray-200 overflow-hidden">
          <div className="h-2" style={{ backgroundColor: 'hsl(142, 76%, 36%)' }} />
          <CardContent className="p-5">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-xl bg-green-100 flex items-center justify-center text-2xl font-bold text-green-700 flex-shrink-0">
                  {shop.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-xl font-bold text-gray-900">{shop.name}</h1>
                    <Badge
                      className={
                        shop.status === 'active'
                          ? 'bg-green-100 text-green-700'
                          : shop.status === 'pending'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-red-100 text-red-600'
                      }
                      variant="secondary"
                    >
                      {shop.status.charAt(0).toUpperCase() + shop.status.slice(1)}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground capitalize">{shop.business_type}</p>
                  <div className="flex flex-wrap gap-3 mt-2 text-sm text-gray-600">
                    {shop.address && (
                      <span className="flex items-center gap-1">
                        <MapPin size={13} className="text-gray-400" />
                        {shop.address}
                      </span>
                    )}
                    {shop.contact_phone && (
                      <span className="flex items-center gap-1">
                        <Phone size={13} className="text-gray-400" />
                        {shop.contact_phone}
                      </span>
                    )}
                    {shop.whatsapp && (
                      <span className="flex items-center gap-1">
                        <MessageCircle size={13} className="text-green-600" />
                        {shop.whatsapp}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => navigate('/settings')}
                >
                  <Edit size={14} />
                  Edit Shop
                </Button>
                <Button
                  size="sm"
                  className="gap-1.5"
                  style={{ backgroundColor: 'hsl(142, 76%, 36%)' }}
                  onClick={() => navigate('/create')}
                >
                  <Plus size={14} />
                  New Listing
                </Button>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4 pt-4 border-t">
              <div className="text-center">
                <div className="text-2xl font-bold" style={{ color: 'hsl(142, 76%, 36%)' }}>
                  {shop.active_listings_count ?? activeListings.length}
                </div>
                <div className="text-xs text-muted-foreground">Active Listings</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-700">
                  {shop.total_fulfilled ?? historyListings.filter((l) => l.status === 'fulfilled').length}
                </div>
                <div className="text-xs text-muted-foreground">Fulfilled</div>
              </div>
              {shop.member_since && (
                <div className="text-center col-span-2 sm:col-span-1">
                  <div className="text-sm font-semibold text-gray-700">
                    {new Date(shop.member_since).getFullYear()}
                  </div>
                  <div className="text-xs text-muted-foreground">Member Since</div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs defaultValue="active">
          <TabsList className="mb-4 w-full sm:w-auto">
            <TabsTrigger value="active" className="flex-1 sm:flex-none">
              Active
              {activeListings.length > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-semibold">
                  {activeListings.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="history" className="flex-1 sm:flex-none">History</TabsTrigger>
            <TabsTrigger value="employees" className="flex-1 sm:flex-none">
              Team
              {employees.length > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs font-semibold">
                  {employees.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Active listings */}
          <TabsContent value="active">
            {loadingListings ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-20 bg-gray-100 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : activeListings.length === 0 ? (
              <div className="py-14 text-center">
                <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
                  <Plus className="w-6 h-6 text-gray-400" />
                </div>
                <h3 className="font-semibold mb-1">No active listings</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Post something to share or request resources with the community.
                </p>
                <Button
                  style={{ backgroundColor: 'hsl(142, 76%, 36%)' }}
                  onClick={() => navigate('/create')}
                >
                  Post a Listing
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {activeListings.map((listing) => (
                  <div key={listing.id} className={actionLoading === listing.id ? 'opacity-50 pointer-events-none' : ''}>
                    <ListingRow
                      listing={listing}
                      onFulfill={handleFulfill}
                      onDelete={handleDelete}
                    />
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* History */}
          <TabsContent value="history">
            {loadingListings ? (
              <div className="space-y-3">
                {[1, 2].map((i) => (
                  <div key={i} className="h-20 bg-gray-100 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : historyListings.length === 0 ? (
              <div className="py-14 text-center">
                <p className="text-muted-foreground text-sm">No history yet.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {historyListings.map((listing) => (
                  <div
                    key={listing.id}
                    className="flex items-center gap-3 p-3 rounded-lg border bg-white opacity-80"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <Badge
                          variant="secondary"
                          className={
                            listing.status === 'fulfilled'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-500'
                          }
                        >
                          {listing.status.charAt(0).toUpperCase() + listing.status.slice(1)}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {timeAgo(listing.created_at)}
                        </span>
                      </div>
                      <p className="font-medium text-sm truncate">{listing.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {listing.interest_count} interested &middot;{' '}
                        {listing.is_free ? 'FREE' : `$${listing.price}`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Employees */}
          <TabsContent value="employees">
            <div className="flex justify-end mb-3">
              <Button
                size="sm"
                className="gap-1.5"
                style={{ backgroundColor: 'hsl(142, 76%, 36%)' }}
                onClick={() => {
                  // Navigate to employee add page or open a dialog
                  // Placeholder: shows alert for now
                  alert('Add employee flow coming soon');
                }}
              >
                <UserPlus size={14} />
                Add Employee
              </Button>
            </div>
            {loadingEmployees ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />
                ))}
              </div>
            ) : employees.length === 0 ? (
              <div className="py-14 text-center">
                <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
                  <UserPlus className="w-6 h-6 text-gray-400" />
                </div>
                <h3 className="font-semibold mb-1">No team members yet</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Add employees to manage availability and skills sharing.
                </p>
              </div>
            ) : (
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead className="hidden sm:table-cell">Skills</TableHead>
                      <TableHead>Available</TableHead>
                      <TableHead className="w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {employees.map((emp) => (
                      <TableRow key={emp.id}>
                        <TableCell className="font-medium">{emp.name}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="capitalize text-xs">
                            {emp.role}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                          {emp.skills || '—'}
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={emp.is_available}
                            onCheckedChange={() => handleToggleAvailability(emp)}
                          />
                        </TableCell>
                        <TableCell>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-50"
                              >
                                <Trash2 size={14} />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Remove {emp.name}?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will remove {emp.name} from your team.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDeleteEmployee(emp.id)}
                                  className="bg-red-600 hover:bg-red-700 text-white"
                                >
                                  Remove
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Loading overlay for actions */}
      {actionLoading && (
        <div className="fixed inset-0 bg-black/10 flex items-center justify-center z-50 pointer-events-none">
          <div className="bg-white rounded-lg p-4 shadow-lg flex items-center gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-green-600" />
            <span className="text-sm font-medium">Processing...</span>
          </div>
        </div>
      )}
    </PageLayout>
  );
}
