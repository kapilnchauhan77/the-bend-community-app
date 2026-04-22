import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Search,
  Briefcase,
  Package,
  Wrench,
  Store,
  ClipboardList,
  Heart,
  Star,
  ChevronRight,
  TrendingUp,
  AlertTriangle,
  Music,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { PageLayout } from '@/components/layout/PageLayout';
import { ListingCard } from '@/components/shared/ListingCard';
import api from '@/services/api';
import { listingApi } from '@/services/listingApi';
import { eventApi } from '@/services/eventApi';
import type { Listing, CommunityEvent, SuccessStory } from '@/types';
import { SponsorBanner } from '@/components/shared/SponsorBanner';
import { useTenant } from '@/context/TenantContext';

const BRONZE = 'hsl(35, 45%, 42%)';

const services = [
  { icon: Briefcase, label: 'Gig Board', desc: 'Job openings & available workers', href: '/browse?category=staff' },
  { icon: Package, label: 'Raw Materials', desc: 'Surplus ingredients & supplies', href: '/browse?category=materials' },
  { icon: Wrench, label: 'Equipment', desc: 'Borrow or lend tools', href: '/browse?category=equipment' },
  { icon: Store, label: 'All Listings', desc: 'Browse the full directory', href: '/browse' },
  { icon: Heart, label: 'Volunteer', desc: 'Give your time to the community', href: '/volunteers' },
  { icon: Music, label: 'Talent', desc: 'Book local freelancers & artists', href: '/talent' },
];

// Stats fetched from API — see useEffect below


export default function HomePage() {
  const navigate = useNavigate();
  const tenant = useTenant();
  const PRIMARY = tenant.primary_color;
  const [searchQuery, setSearchQuery] = useState('');
  const [urgentListings, setUrgentListings] = useState<Listing[]>([]);
  const [recentListings, setRecentListings] = useState<Listing[]>([]);
  const [loadingUrgent, setLoadingUrgent] = useState(true);
  const [loadingRecent, setLoadingRecent] = useState(true);
  const [upcomingEvents, setUpcomingEvents] = useState<CommunityEvent[]>([]);
  const [fulfilledListings, setFulfilledListings] = useState<Listing[]>([]);
  const [stories, setStories] = useState<SuccessStory[]>([]);
  const [stats, setStats] = useState([
    { value: '—', label: 'Active Businesses' },
    { value: '—', label: 'Active Listings' },
    { value: '—', label: 'Items Shared' },
  ]);

  useEffect(() => {
    listingApi
      .browse({ urgency: 'urgent', limit: 3 })
      .then((res) => setUrgentListings(res.data.items))
      .catch(() => setUrgentListings([]))
      .finally(() => setLoadingUrgent(false));

    listingApi
      .browse({ limit: 5 })
      .then((res) => setRecentListings(res.data.items))
      .catch(() => setRecentListings([]))
      .finally(() => setLoadingRecent(false));

    eventApi
      .getUpcoming(3)
      .then((res) => setUpcomingEvents(res.data.items ?? []))
      .catch(() => setUpcomingEvents([]));

    listingApi
      .browse({ status: 'fulfilled', limit: 5 })
      .then((res) => setFulfilledListings(res.data.items))
      .catch(() => setFulfilledListings([]));

    listingApi
      .getStories({ featured: 'true', limit: '3' })
      .then((res) => setStories(res.data.items ?? []))
      .catch(() => setStories([]));

    api.get('/stats')
      .then((res) => {
        const d = res.data;
        setStats([
          { value: String(d.active_shops ?? 0), label: 'Active Businesses' },
          { value: String(d.active_listings ?? 0), label: 'Active Listings' },
          { value: String(d.items_shared ?? 0), label: 'Items Shared' },
        ]);
      })
      .catch(() => {});
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    navigate(searchQuery.trim() ? `/browse?q=${encodeURIComponent(searchQuery.trim())}` : '/browse');
  };

  return (
    <PageLayout>
      {/* Hero — Museum entrance feel */}
      <section className="relative min-h-[280px] md:min-h-[460px] flex items-center overflow-hidden pb-14 pt-8 md:pb-16 md:pt-0">
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url('${tenant.hero_image_url || '/images/the-bend-hero.jpg'}')` }} />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to right, hsl(30,12%,12%,0.88), hsl(30,12%,12%,0.6))' }} />
        {/* Subtle grain overlay */}
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='256' height='256' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E\")" }} />

        <div className="relative z-10 max-w-7xl mx-auto px-4 md:px-8 w-full">
          <div className="max-w-2xl">
            <div className="hidden md:block w-12 h-[2px] mb-4" style={{ backgroundColor: BRONZE }} />
            <p className="hidden md:block text-xs tracking-[0.35em] uppercase text-[hsl(35,45%,65%)] mb-2 font-medium">
              Welcome to
            </p>
            <h1 className="text-2xl md:text-6xl font-bold font-serif text-[hsl(40,20%,95%)] leading-[1.1] mb-2 md:mb-4" style={{ letterSpacing: '-0.01em' }}>
              {tenant.display_name.split('\u2014')[0].trim()}<br />Community
            </h1>
            <p className="text-base md:text-xl text-[hsl(40,15%,75%)] mb-4 max-w-md leading-relaxed">
              {tenant.tagline || 'Find opportunity within your neighborhood'}
            </p>
            {tenant.about_text && (
            <p className="hidden md:block text-sm text-[hsl(40,15%,60%)] mb-8 max-w-lg leading-relaxed italic font-serif">
              {tenant.about_text}
            </p>
            )}
            <form onSubmit={handleSearch} className="flex max-w-md">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(30,10%,50%)]" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search listings, shops..."
                  className="pl-10 pr-4 h-11 rounded-none rounded-l bg-[hsl(40,20%,98%)] border-[hsl(35,18%,84%)] text-sm"
                />
              </div>
              <button
                type="submit"
                className="px-5 h-11 rounded-none rounded-r text-white text-sm font-medium tracking-wider uppercase cursor-pointer transition-colors hover:opacity-90"
                style={{ backgroundColor: BRONZE }}
              >
                Search
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* Services — Museum exhibit cards */}
      <section className="max-w-7xl mx-auto px-4 md:px-8 -mt-8 relative z-20">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {services.map(({ icon: Icon, label, desc, href }) => (
            <Link
              key={label}
              to={href}
              className="group bg-[hsl(40,20%,98%)] border border-[hsl(35,18%,84%)] p-4 text-center transition-all duration-200 cursor-pointer hover:border-[hsl(35,45%,42%)] hover:shadow-md"
            >
              <Icon className="w-5 h-5 mx-auto mb-2 text-[hsl(35,45%,42%)] transition-transform group-hover:scale-110" />
              <h3 className="text-sm font-semibold text-[hsl(30,15%,20%)] mb-0.5 font-serif">{label}</h3>
              <p className="text-[11px] text-[hsl(30,10%,50%)] leading-tight">{desc}</p>
            </Link>
          ))}
        </div>
      </section>

      <SponsorBanner placement="homepage" />

      {/* Urgent Needs */}
      {!loadingUrgent && urgentListings.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 md:px-8 mt-10">
          <div className="border border-[hsl(0,40%,75%)] bg-[hsl(0,30%,97%)] p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-[hsl(0,55%,45%)]" />
                <div>
                  <h2 className="text-base font-bold font-serif text-[hsl(0,40%,30%)]">
                    {urgentListings.length} Urgent Need{urgentListings.length !== 1 ? 's' : ''}
                  </h2>
                  <p className="text-xs text-[hsl(0,30%,50%)]">These listings need an immediate response</p>
                </div>
              </div>
              <Link
                to="/browse?urgency=urgent"
                className="text-xs font-medium text-[hsl(0,55%,45%)] hover:text-[hsl(0,55%,35%)] flex items-center gap-1 tracking-wider uppercase transition-colors"
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

      {/* Main Content — Two Column */}
      <section className="max-w-7xl mx-auto px-4 md:px-8 mt-12 mb-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">

          {/* Community Board */}
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-8 h-[2px]" style={{ backgroundColor: BRONZE }} />
                <h2 className="text-xl font-bold font-serif text-[hsl(30,15%,18%)] tracking-wide">Community Board</h2>
              </div>
              <Link
                to="/browse"
                className="text-xs font-medium tracking-wider uppercase flex items-center gap-1 transition-colors"
                style={{ color: BRONZE }}
              >
                View All <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {loadingRecent ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-28 bg-[hsl(35,15%,92%)] animate-pulse" />
                ))}
              </div>
            ) : recentListings.length > 0 ? (
              <div className="space-y-3">
                {recentListings.map((listing) => (
                  <ListingCard key={listing.id} listing={listing} />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-14 border border-dashed border-[hsl(35,18%,82%)] bg-[hsl(40,20%,98%)]">
                <ClipboardList className="w-8 h-8 text-[hsl(35,15%,75%)] mb-2" />
                <p className="text-sm text-[hsl(30,10%,50%)] mb-3 italic">No listings yet</p>
                <Button
                  onClick={() => navigate('/create')}
                  size="sm"
                  className="text-white text-xs tracking-wider uppercase cursor-pointer"
                  style={{ backgroundColor: BRONZE }}
                >
                  Post the First One
                </Button>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-8">
            {/* Recently Fulfilled */}
            <div>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-6 h-[2px]" style={{ backgroundColor: BRONZE }} />
                <h2 className="text-lg font-bold font-serif text-[hsl(30,15%,18%)]">Recently Fulfilled</h2>
              </div>
              <div className="space-y-2">
                {fulfilledListings.length > 0 ? (
                  fulfilledListings.map((item) => (
                    <div
                      key={item.id}
                      className="fulfilled-item flex items-center gap-3 p-3 border border-[hsl(160,18%,88%)] bg-[hsl(160,20%,97%)] transition-all cursor-pointer group"
                      onClick={() => navigate(`/listing/${item.id}`)}
                    >
                      <div
                        className="fulfilled-icon w-8 h-8 flex items-center justify-center flex-shrink-0 rounded-full bg-[hsl(160,20%,90%)] text-[hsl(160,25%,32%)]"
                      >
                        <TrendingUp className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[hsl(160,20%,22%)] truncate group-hover:text-[hsl(160,25%,18%)] transition-colors">{item.title}</p>
                        <Link
                          to={`/business/${item.shop.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-xs text-[hsl(160,10%,45%)] truncate hover:underline"
                        >
                          {item.shop.name}
                        </Link>
                      </div>
                      <span className="text-[10px] text-[hsl(160,10%,55%)] shrink-0 uppercase tracking-wider">
                        {item.category}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="py-6 text-center border border-dashed border-[hsl(160,18%,85%)] bg-[hsl(160,20%,97%)]">
                    <p className="text-xs text-[hsl(160,10%,50%)] italic">
                      No fulfilled items yet — be the first to complete a listing!
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Quick Actions */}
            <div>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-6 h-[2px]" style={{ backgroundColor: BRONZE }} />
                <h2 className="text-lg font-bold font-serif text-[hsl(30,15%,18%)]">Quick Actions</h2>
              </div>
              <div className="space-y-2">
                <Button
                  onClick={() => navigate('/create')}
                  className="w-full justify-start gap-2 h-10 text-white text-xs tracking-wider uppercase cursor-pointer"
                  style={{ backgroundColor: BRONZE }}
                >
                  <ClipboardList className="w-4 h-4" />
                  Post a Listing
                </Button>
                <Button
                  variant="outline"
                  onClick={() => navigate('/register')}
                  className="w-full justify-start gap-2 h-10 text-xs tracking-wider uppercase border-[hsl(35,18%,84%)] text-[hsl(30,15%,30%)] hover:border-[hsl(35,45%,42%)] cursor-pointer"
                >
                  <Store className="w-4 h-4" />
                  Register Your Business
                </Button>
                <Button
                  variant="outline"
                  onClick={() => navigate('/volunteers')}
                  className="w-full justify-start gap-2 h-10 text-xs tracking-wider uppercase border-[hsl(35,18%,84%)] text-[hsl(30,15%,30%)] hover:border-[hsl(35,45%,42%)] cursor-pointer"
                >
                  <Heart className="w-4 h-4" />
                  Volunteer Board
                </Button>
                <Button
                  variant="outline"
                  onClick={() => navigate('/talent')}
                  className="w-full justify-start gap-2 h-10 text-xs tracking-wider uppercase border-[hsl(35,18%,84%)] text-[hsl(30,15%,30%)] hover:border-[hsl(35,45%,42%)] cursor-pointer"
                >
                  <Star className="w-4 h-4" />
                  Talent Marketplace
                </Button>
              </div>
            </div>

            <SponsorBanner placement="homepage" variant="card" />
          </div>
        </div>
      </section>

      {/* Upcoming Events */}
      {upcomingEvents.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 md:px-8 mb-8">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-8 h-[2px]" style={{ backgroundColor: BRONZE }} />
              <h2 className="text-xl font-bold font-serif text-[hsl(30,15%,18%)] tracking-wide">Upcoming Events</h2>
            </div>
            <Link
              to="/events"
              className="text-xs font-medium tracking-wider uppercase flex items-center gap-1 transition-colors"
              style={{ color: BRONZE }}
            >
              View All <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {upcomingEvents.map((event) => (
              <Link
                key={event.id}
                to="/events"
                className="group border border-[hsl(35,18%,84%)] bg-[hsl(40,20%,98%)] p-4 transition-all hover:border-[hsl(35,45%,42%,0.4)] hover:shadow-md cursor-pointer"
              >
                <Badge className="text-[10px] rounded-sm mb-2 border-0 px-2 py-0.5 bg-[hsl(35,15%,88%)] text-[hsl(30,15%,35%)]">
                  {event.category}
                </Badge>
                <h3 className="font-serif font-semibold text-[hsl(30,15%,18%)] text-sm mb-1 group-hover:text-[hsl(35,45%,35%)] transition-colors">
                  {event.title}
                </h3>
                <p className="text-xs text-[hsl(30,10%,50%)]">
                  {new Date(event.start_date.replace(' ', 'T')).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  {event.location && ` · ${event.location}`}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Stats + Community Story — Museum plaque style */}
      <section className="relative py-12 overflow-hidden" style={{ backgroundColor: PRIMARY }}>
        <div className="absolute inset-0 bg-cover bg-center opacity-10" style={{ backgroundImage: "url('/images/courthouse.jpg')" }} />
        <div className="relative z-10 max-w-7xl mx-auto px-4 md:px-8">
          <div className="text-center mb-8">
            <div className="w-12 h-[2px] mx-auto mb-3" style={{ backgroundColor: 'hsl(35,45%,55%)' }} />
            <h2 className="text-lg font-bold font-serif text-[hsl(40,20%,90%)] tracking-wide">Our Community in Numbers</h2>
          </div>
          <div className="grid grid-cols-3 gap-6 max-w-xl mx-auto">
            {stats.map(({ value, label }) => (
              <div key={label} className="text-center">
                <div className="text-3xl md:text-4xl font-bold font-serif text-[hsl(40,20%,95%)] tabular-nums">{value}</div>
                <p className="text-xs text-[hsl(40,15%,70%)] mt-1 tracking-wider uppercase">{label}</p>
              </div>
            ))}
          </div>

          {/* Inline community story quote */}
          {stories.length > 0 && (
            <div className="mt-10 pt-8 border-t border-white/10 max-w-lg mx-auto text-center">
              <span className="text-3xl font-serif leading-none text-white/20">&ldquo;</span>
              <p className="text-sm text-white/80 italic font-serif leading-relaxed mt-1">
                {stories[0].quote}
              </p>
              <p className="text-xs text-white/50 mt-3 tracking-wider uppercase">
                — {stories[0].author_name}
              </p>
            </div>
          )}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-7xl mx-auto px-4 md:px-8 py-14">
        <div className="border border-[hsl(35,18%,84%)] bg-[hsl(40,20%,98%)] p-8 md:p-10 text-center">
          <div className="w-12 h-[2px] mx-auto mb-4" style={{ backgroundColor: BRONZE }} />
          <h2 className="text-xl md:text-2xl font-bold font-serif text-[hsl(30,15%,18%)] mb-2">
            Ready to support your neighbors?
          </h2>
          <p className="text-sm text-[hsl(30,10%,48%)] mb-6 max-w-md mx-auto">
            Post a listing, share what you have, or find what you need — it only takes a minute.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button
              onClick={() => navigate('/create')}
              className="font-medium px-6 h-10 text-white text-xs tracking-wider uppercase cursor-pointer"
              style={{ backgroundColor: BRONZE }}
            >
              Post a Listing
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate('/browse')}
              className="font-medium px-6 h-10 text-xs tracking-wider uppercase border-[hsl(35,18%,82%)] text-[hsl(30,15%,30%)] hover:border-[hsl(35,45%,42%)] cursor-pointer"
            >
              Browse Listings
            </Button>
          </div>
        </div>
      </section>
    </PageLayout>
  );
}
