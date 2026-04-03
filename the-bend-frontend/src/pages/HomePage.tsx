import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Search,
  Users,
  Package,
  Wrench,
  Store,
  ClipboardList,
  BookOpen,
  ChevronRight,
  TrendingUp,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { PageLayout } from '@/components/layout/PageLayout';
import { ListingCard } from '@/components/shared/ListingCard';
import { listingApi } from '@/services/listingApi';
import type { Listing } from '@/types';

const PRIMARY = 'hsl(142, 76%, 36%)';

// ─── Hero background image via unsplash (craft/community workshop feel) ───────
const HERO_BG =
  'https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=1600&q=80&auto=format&fit=crop';

// ─── Quick links ──────────────────────────────────────────────────────────────
const quickLinks = [
  { icon: Users, label: 'Share Staff', href: '/browse?category=staff', color: 'bg-emerald-100 text-emerald-700' },
  { icon: Package, label: 'Raw Materials', href: '/browse?category=materials', color: 'bg-teal-100 text-teal-700' },
  { icon: Wrench, label: 'Equipment', href: '/browse?category=equipment', color: 'bg-green-100 text-green-700' },
  { icon: Store, label: 'Shop Directory', href: '/browse', color: 'bg-lime-100 text-lime-700' },
  { icon: ClipboardList, label: 'Post a Request', href: '/create', color: 'bg-emerald-100 text-emerald-700' },
  { icon: BookOpen, label: 'Community Guide', href: '/about', color: 'bg-teal-100 text-teal-700' },
];

// ─── Community stats ──────────────────────────────────────────────────────────
const stats = [
  { value: '28', label: 'Active Shops', suffix: '' },
  { value: '142', label: 'Active Listings', suffix: '' },
  { value: '89', label: 'Items Shared', suffix: '' },
  { value: '$4.2K', label: 'Saved in Waste', suffix: '' },
];

// ─── Placeholder fulfilled items ──────────────────────────────────────────────
const fulfilledPlaceholder = [
  { title: 'Commercial Mixer — 20qt', shop: 'Grain & Glory Bakery', category: 'Equipment', when: '2h ago' },
  { title: '3 Bags Bread Flour', shop: 'The Daily Loaf', category: 'Materials', when: '5h ago' },
  { title: 'Saturday Prep Cook', shop: 'Bent Fork Kitchen', category: 'Staff', when: 'Yesterday' },
  { title: 'Proofing Racks (×4)', shop: 'Rise & Shine', category: 'Equipment', when: 'Yesterday' },
  { title: 'Pastry Chef — 2 days', shop: 'Sweet Nothings', category: 'Staff', when: '2 days ago' },
];

export default function HomePage() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [urgentListings, setUrgentListings] = useState<Listing[]>([]);
  const [recentListings, setRecentListings] = useState<Listing[]>([]);
  const [loadingUrgent, setLoadingUrgent] = useState(true);
  const [loadingRecent, setLoadingRecent] = useState(true);

  useEffect(() => {
    listingApi
      .browse({ urgency: 'critical', limit: 3, status: 'active' })
      .then((res) => setUrgentListings(res.data.items))
      .catch(() => setUrgentListings([]))
      .finally(() => setLoadingUrgent(false));

    listingApi
      .browse({ limit: 5, status: 'active' })
      .then((res) => setRecentListings(res.data.items))
      .catch(() => setRecentListings([]))
      .finally(() => setLoadingRecent(false));
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/browse?q=${encodeURIComponent(searchQuery.trim())}`);
    } else {
      navigate('/browse');
    }
  };

  return (
    <PageLayout>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section
        className="relative h-[50vh] md:h-[70vh] flex items-center justify-center overflow-hidden"
        aria-label="Hero banner"
      >
        {/* Background image */}
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${HERO_BG})` }}
        />
        {/* Gradient overlay */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(135deg, rgba(15,60,30,0.78), rgba(22,101,52,0.72))',
          }}
        />

        {/* Content */}
        <div className="relative z-10 text-center text-white px-4 max-w-3xl mx-auto w-full">
          <p
            className="text-xs md:text-sm font-semibold tracking-[0.25em] uppercase mb-2 opacity-90"
            style={{ letterSpacing: '0.25em' }}
          >
            Welcome to
          </p>
          <h1 className="text-3xl md:text-5xl font-extrabold leading-tight mb-3 drop-shadow-lg">
            The Bend Community
          </h1>
          <p className="text-sm md:text-lg font-light opacity-85 mb-8 max-w-xl mx-auto leading-relaxed">
            Share staff, materials &amp; equipment with your neighbors
          </p>

          {/* Search bar */}
          <form onSubmit={handleSearch} className="relative max-w-lg mx-auto mb-6">
            <div className="relative flex items-center">
              <Search className="absolute left-4 w-4 h-4 text-gray-400 pointer-events-none" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search listings, shops, materials…"
                className="w-full pl-11 pr-4 py-3 h-12 rounded-full bg-white text-gray-900 placeholder:text-gray-400 border-0 shadow-xl focus-visible:ring-2 focus-visible:ring-white/50 text-sm"
              />
              <button
                type="submit"
                className="absolute right-2 px-4 py-1.5 rounded-full text-white text-sm font-semibold transition-all hover:opacity-90"
                style={{ backgroundColor: PRIMARY }}
              >
                Search
              </button>
            </div>
          </form>

          {/* CTA buttons */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button
              onClick={() => navigate('/browse')}
              className="font-semibold px-6 py-2.5 h-auto rounded-full shadow-lg transition-all hover:scale-105"
              style={{ backgroundColor: 'white', color: PRIMARY }}
            >
              Browse Listings
            </Button>
            <Button
              onClick={() => navigate('/register')}
              variant="outline"
              className="font-semibold px-6 py-2.5 h-auto rounded-full border-2 border-white text-white bg-transparent hover:bg-white/10 transition-all hover:scale-105"
            >
              Register Your Shop
            </Button>
          </div>
        </div>
      </section>

      {/* ── Quick Links ──────────────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-4 md:px-8 -mt-6 relative z-20">
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          {quickLinks.map(({ icon: Icon, label, href, color }) => (
            <Link
              key={label}
              to={href}
              className="group flex flex-col items-center gap-2.5 p-4 bg-white rounded-2xl shadow-md hover:shadow-xl transition-all duration-200 hover:-translate-y-1 border border-gray-100"
            >
              <div
                className={`w-12 h-12 rounded-2xl flex items-center justify-center ${color} transition-transform group-hover:scale-110`}
              >
                <Icon className="w-5 h-5" />
              </div>
              <span className="text-xs font-semibold text-gray-700 text-center leading-tight">
                {label}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Urgent Section ───────────────────────────────────────────────── */}
      {!loadingUrgent && urgentListings.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 md:px-8 mt-10">
          <div className="bg-red-50 border border-red-200 rounded-2xl p-5 md:p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center">
                  <AlertTriangle className="w-4 h-4 text-red-600" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-red-800">
                    {urgentListings.length} critical item{urgentListings.length !== 1 ? 's' : ''} need attention
                  </h2>
                  <p className="text-xs text-red-600">These listings need an immediate response</p>
                </div>
              </div>
              <Link
                to="/browse?urgency=critical"
                className="text-xs font-semibold text-red-600 hover:text-red-800 flex items-center gap-1 transition-colors"
              >
                View All <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {urgentListings.map((listing) => (
                <ListingCard key={listing.id} listing={listing} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── What's Happening ─────────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-4 md:px-8 mt-10">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Community Board */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">Community Board</h2>
              <Link
                to="/browse"
                className="text-xs font-semibold flex items-center gap-1 transition-colors hover:opacity-80"
                style={{ color: PRIMARY }}
              >
                View All <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {loadingRecent ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-28 bg-gray-100 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : recentListings.length > 0 ? (
              <div className="space-y-3">
                {recentListings.map((listing) => (
                  <ListingCard key={listing.id} listing={listing} />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                <ClipboardList className="w-8 h-8 text-gray-300 mb-2" />
                <p className="text-sm text-gray-500">No listings yet</p>
                <Button
                  onClick={() => navigate('/create')}
                  size="sm"
                  className="mt-3 text-white"
                  style={{ backgroundColor: PRIMARY }}
                >
                  Post the First One
                </Button>
              </div>
            )}
          </div>

          {/* Recently Fulfilled */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">Recently Fulfilled</h2>
              <Link
                to="/browse?status=fulfilled"
                className="text-xs font-semibold flex items-center gap-1 transition-colors hover:opacity-80"
                style={{ color: PRIMARY }}
              >
                View All <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <div className="space-y-2.5">
              {fulfilledPlaceholder.map((item, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 p-3.5 bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow cursor-pointer group"
                  onClick={() => navigate('/browse?status=fulfilled')}
                >
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: 'hsl(142, 76%, 95%)', color: PRIMARY }}
                  >
                    <TrendingUp className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate group-hover:text-green-700 transition-colors">
                      {item.title}
                    </p>
                    <p className="text-xs text-gray-500 truncate">{item.shop}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className="inline-block text-[10px] font-medium px-2 py-0.5 rounded-full bg-green-50 text-green-700 mb-1">
                      {item.category}
                    </span>
                    <p className="text-[10px] text-gray-400">{item.when}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Community Stats ──────────────────────────────────────────────── */}
      <section className="mt-14 py-14" style={{ backgroundColor: 'hsl(142, 30%, 97%)' }}>
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-gray-900">Our Community in Numbers</h2>
            <p className="text-sm text-gray-500 mt-1">Real impact, real neighbors</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
            {stats.map(({ value, label }) => (
              <Card
                key={label}
                className="text-center border-0 shadow-md bg-white rounded-2xl"
              >
                <CardContent className="pt-7 pb-6">
                  <div
                    className="text-4xl font-extrabold mb-1 tabular-nums"
                    style={{ color: PRIMARY }}
                  >
                    {value}
                  </div>
                  <p className="text-sm font-medium text-gray-600">{label}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ── Bottom CTA ───────────────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-4 md:px-8 py-14">
        <div
          className="rounded-3xl p-8 md:p-12 text-center text-white relative overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, hsl(142, 76%, 28%), hsl(142, 76%, 40%))',
          }}
        >
          {/* Decorative circles */}
          <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full bg-white/5" />
          <div className="absolute -bottom-12 -left-12 w-56 h-56 rounded-full bg-white/5" />
          <div className="relative z-10">
            <h2 className="text-2xl md:text-3xl font-bold mb-3">
              Ready to support your neighbors?
            </h2>
            <p className="text-sm md:text-base opacity-85 mb-6 max-w-md mx-auto">
              Post a listing, share what you have, or find what you need — it only takes a minute.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button
                onClick={() => navigate('/create')}
                className="font-semibold px-8 py-2.5 h-auto rounded-full shadow-lg bg-white transition-all hover:scale-105"
                style={{ color: PRIMARY }}
              >
                Post a Listing
              </Button>
              <Button
                onClick={() => navigate('/browse')}
                variant="outline"
                className="font-semibold px-8 py-2.5 h-auto rounded-full border-2 border-white text-white bg-transparent hover:bg-white/10 transition-all hover:scale-105"
              >
                Browse Listings
              </Button>
            </div>
          </div>
        </div>
      </section>
    </PageLayout>
  );
}
