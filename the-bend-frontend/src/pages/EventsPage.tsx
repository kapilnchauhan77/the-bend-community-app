import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPin, Star, ChevronLeft, ChevronRight, Calendar, List, ArrowDownUp, Search, Plus, X, CheckCircle, Upload } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageLayout } from '@/components/layout/PageLayout';
import { eventApi } from '@/services/eventApi';
import type { CommunityEvent, EventCategory } from '@/types/index';
import { SponsorBanner } from '@/components/shared/SponsorBanner';
import { uploadApi } from '@/services/uploadApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ShareButton } from '@/components/shared/ShareButton';

const PRIMARY = 'hsl(160, 25%, 24%)';

// ─── Category config ──────────────────────────────────────────────────────────

const CATEGORIES: { value: EventCategory; label: string; color: string; dot: string }[] = [
  { value: 'community', label: 'Community', color: 'bg-[hsl(35,15%,90%)] text-[hsl(160,25%,20%)]', dot: 'bg-[hsl(160,25%,32%)]' },
  { value: 'music',     label: 'Music',     color: 'bg-violet-100 text-violet-800',   dot: 'bg-violet-500' },
  { value: 'art',       label: 'Art',       color: 'bg-pink-100 text-pink-800',       dot: 'bg-pink-500' },
  { value: 'food',      label: 'Food',      color: 'bg-amber-100 text-amber-800',     dot: 'bg-amber-500' },
  { value: 'market',    label: 'Market',    color: 'bg-teal-100 text-teal-800',       dot: 'bg-teal-500' },
  { value: 'historic',  label: 'Historic',  color: 'bg-stone-100 text-stone-800',     dot: 'bg-stone-500' },
  { value: 'outdoor',   label: 'Outdoor',   color: 'bg-[hsl(35,15%,90%)] text-[hsl(160,25%,20%)]',     dot: 'bg-[hsl(35,15%,94%)]0' },
  { value: 'education', label: 'Education', color: 'bg-blue-100 text-blue-800',       dot: 'bg-blue-500' },
];

function getCategoryConfig(category: string) {
  return CATEGORIES.find((c) => c.value === category) ?? {
    value: category as EventCategory,
    label: category,
    color: 'bg-gray-100 text-gray-700',
    dot: 'bg-gray-400',
  };
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function formatEventDate(start: string, end?: string): string {
  const d = parseDate(start);
  const dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (end) {
    const e = parseDate(end);
    const endTime = e.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    return `${dateStr} · ${timeStr} – ${endTime}`;
  }
  return `${dateStr} · ${timeStr}`;
}

function parseDate(s: string): Date {
  // Handle "2026-04-11 08:00:00" format (space instead of T)
  return new Date(s.replace(' ', 'T'));
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

// ─── Calendar grid generator ──────────────────────────────────────────────────

function getCalendarDays(year: number, month: number): { date: Date; inMonth: boolean }[] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startPad = firstDay.getDay(); // 0=Sun
  const days: { date: Date; inMonth: boolean }[] = [];

  // Previous month padding
  for (let i = startPad - 1; i >= 0; i--) {
    const d = new Date(year, month, -i);
    days.push({ date: d, inMonth: false });
  }
  // Current month
  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push({ date: new Date(year, month, d), inMonth: true });
  }
  // Next month padding
  while (days.length < 42) {
    const d = new Date(year, month + 1, days.length - startPad - lastDay.getDate() + 1);
    days.push({ date: d, inMonth: false });
  }
  return days;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ─── Event Card ───────────────────────────────────────────────────────────────

function EventCard({ event }: { event: CommunityEvent }) {
  const cat = getCategoryConfig(event.category);
  return (
    <Card id={`event-${event.id}`} className="border-0 shadow-md rounded-2xl hover:shadow-xl transition-all duration-200 group">
      {event.image_url && (
        <div className="relative h-40 overflow-hidden">
          <img
            src={event.image_url}
            alt={event.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
          {event.is_featured && (
            <div className="absolute top-2 right-2 bg-amber-400 rounded-full p-1">
              <Star className="w-3 h-3 text-white fill-white" />
            </div>
          )}
        </div>
      )}
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <Badge className={`text-xs rounded-full border-0 font-medium ${cat.color}`}>
            {cat.label}
          </Badge>
          {!event.image_url && event.is_featured && (
            <Star className="w-4 h-4 text-amber-400 fill-amber-400 flex-shrink-0" />
          )}
        </div>

        <h3 className="font-serif font-bold text-gray-900 text-base leading-tight mb-1 line-clamp-2">
          {event.title}
        </h3>

        <p className="text-xs text-[hsl(160,25%,32%)] font-medium mb-2">
          {formatEventDate(event.start_date, event.end_date)}
        </p>

        {event.location && (
          <div className="flex items-start gap-1 text-xs text-gray-500 mb-2">
            <MapPin className="w-3 h-3 flex-shrink-0 mt-0.5" style={{ color: PRIMARY }} />
            <span className="truncate">{event.location}</span>
          </div>
        )}

        {event.description && (
          <p className="text-xs text-gray-500 line-clamp-2 mb-2">{event.description}</p>
        )}

        <div className="flex items-center justify-between mt-2">
          <span className="text-[10px] text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full border border-gray-100 truncate max-w-[50%]">
            {event.source}
          </span>
          <div className="flex items-center gap-2">
            <ShareButton
              url={`/events#event-${event.id}`}
              title={event.title}
              description={`${event.title} - ${formatEventDate(event.start_date, event.end_date)}${event.location ? ' at ' + event.location : ''}`}
            />
            {event.source_url && (
              <a
                href={event.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] font-medium hover:underline"
                style={{ color: PRIMARY }}
              >
                Details →
              </a>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Mini Event Row (used in calendar day panel) ──────────────────────────────

function MiniEventRow({ event }: { event: CommunityEvent }) {
  const cat = getCategoryConfig(event.category);
  return (
    <div className="flex items-start gap-3 py-3 border-b border-gray-100 last:border-0">
      <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${cat.dot}`} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-900 leading-tight line-clamp-1">{event.title}</p>
        <p className="text-xs text-[hsl(160,25%,32%)] mt-0.5">
          {parseDate(event.start_date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
          {event.location && <span className="text-gray-400"> · {event.location}</span>}
        </p>
      </div>
      {event.source_url && (
        <a
          href={event.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] font-medium flex-shrink-0 mt-1"
          style={{ color: PRIMARY }}
        >
          →
        </a>
      )}
    </div>
  );
}

// ─── Calendar View ────────────────────────────────────────────────────────────

function CalendarView({ events }: { events: CommunityEvent[] }) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState<Date | null>(today);

  const days = getCalendarDays(year, month);

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }

  function eventsOnDay(date: Date): CommunityEvent[] {
    return events.filter(e => isSameDay(parseDate(e.start_date), date));
  }

  const selectedDayEvents = selectedDay ? eventsOnDay(selectedDay) : [];

  return (
    <div className="space-y-6">
      {/* Calendar header */}
      <div className="bg-white rounded-2xl shadow-md overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <button
            onClick={prevMonth}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
            aria-label="Previous month"
          >
            <ChevronLeft className="w-4 h-4 text-gray-600" />
          </button>
          <h2 className="font-serif font-bold text-gray-900 text-base">
            {MONTH_NAMES[month]} {year}
          </h2>
          <button
            onClick={nextMonth}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
            aria-label="Next month"
          >
            <ChevronRight className="w-4 h-4 text-gray-600" />
          </button>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-gray-100">
          {DAY_NAMES.map(d => (
            <div key={d} className="py-2 text-center text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
              {d}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7">
          {days.map(({ date, inMonth }, idx) => {
            const dayEvents = eventsOnDay(date);
            const isToday = isSameDay(date, today);
            const isSelected = selectedDay && isSameDay(date, selectedDay);

            return (
              <button
                key={idx}
                onClick={() => setSelectedDay(date)}
                className={[
                  'relative min-h-[60px] md:min-h-[80px] p-1.5 border-b border-r border-gray-50 text-left transition-colors cursor-pointer',
                  !inMonth ? 'bg-gray-50' : 'hover:bg-[hsl(160,25%,97%)]',
                  isSelected ? 'bg-[hsl(160,25%,95%)]' : '',
                ].join(' ')}
                aria-label={date.toLocaleDateString()}
              >
                <span
                  className={[
                    'inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium',
                    isToday ? 'text-white font-bold' : '',
                    isSelected && !isToday ? 'ring-2 ring-offset-1' : '',
                    !inMonth ? 'text-gray-300' : 'text-gray-700',
                  ].join(' ')}
                  style={isToday ? { backgroundColor: PRIMARY } : isSelected ? { ringColor: PRIMARY } : {}}
                >
                  {date.getDate()}
                </span>

                {/* Event dots */}
                {dayEvents.length > 0 && (
                  <div className="flex flex-wrap gap-0.5 mt-1">
                    {dayEvents.slice(0, 3).map(e => {
                      const cat = getCategoryConfig(e.category);
                      return (
                        <span
                          key={e.id}
                          className={`w-1.5 h-1.5 rounded-full ${cat.dot}`}
                          title={e.title}
                        />
                      );
                    })}
                    {dayEvents.length > 3 && (
                      <span className="text-[9px] text-gray-400 leading-none mt-0.5">+{dayEvents.length - 3}</span>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected day events */}
      {selectedDay && (
        <div className="bg-white rounded-2xl shadow-md p-5">
          <h3 className="font-serif font-bold text-gray-900 mb-3">
            {selectedDay.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </h3>
          {selectedDayEvents.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No events on this day.</p>
          ) : (
            <div>
              {selectedDayEvents.map(e => <MiniEventRow key={e.id} event={e} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function EventsPage() {
  const navigate = useNavigate();
  const [view, setView] = useState<'list' | 'calendar'>(window.location.hash ? 'list' : 'calendar');
  const [category, setCategory] = useState<string | null>(null);
  const [events, setEvents] = useState<CommunityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortDesc, setSortDesc] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Post Event modal state
  const [showPostForm, setShowPostForm] = useState(false);
  const [postStep, setPostStep] = useState<'tier' | 'details'>('tier');
  const [postTier, setPostTier] = useState<'forprofit' | 'nonprofit'>('forprofit');
  const [postForm, setPostForm] = useState({
    title: '', description: '', start_date: '', end_date: '', location: '', category: 'community',
    submitted_by_name: '', submitted_by_email: '',
  });
  const [nonprofitDocUrl, setNonprofitDocUrl] = useState<string | null>(null);
  const [docUploading, setDocUploading] = useState(false);
  const [postSubmitting, setPostSubmitting] = useState(false);
  const [postError, setPostError] = useState('');
  const [postSuccess, setPostSuccess] = useState(false);

  // Check for success return from Stripe
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('posted') === 'success') {
      setPostSuccess(true);
      window.history.replaceState({}, '', '/events');
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setLoading(true);
    const params: Record<string, string> = { limit: '100' };
    if (category) params.category = category;
    if (debouncedSearch) params.search = debouncedSearch;
    eventApi.list(params)
      .then(res => {
        setEvents(res.data.items ?? []);
      })
      .catch(err => {
        console.error('Failed to load events:', err);
        setEvents([]);
      })
      .finally(() => setLoading(false));
  }, [category, debouncedSearch]);

  // Scroll to and highlight a card based on URL hash
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash) {
      setTimeout(() => {
        const el = document.getElementById(hash);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.style.boxShadow = '0 0 0 3px hsl(35, 45%, 42%)';
          setTimeout(() => { el.style.boxShadow = ''; }, 3000);
        }
      }, 500);
    }
  }, []);

  const sortedEvents = [...events].sort((a, b) => {
    const da = parseDate(a.start_date).getTime();
    const db = parseDate(b.start_date).getTime();
    return sortDesc ? db - da : da - db;
  });

  return (
    <PageLayout>
      {/* ── Page Header ── */}
      <section className="py-8" style={{ backgroundColor: PRIMARY }}>
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <div className="flex items-center gap-2 text-white/90 text-sm mb-1">
            <button
              onClick={() => navigate('/')}
              className="hover:text-white transition-colors cursor-pointer"
              aria-label="Go home"
            >
              <ArrowLeft size={14} />
            </button>
            <span>Home</span>
            <span>/</span>
            <span className="text-white">Events</span>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-serif text-2xl md:text-3xl font-bold text-white">Community Events</h1>
              <p className="text-sm text-white/85 mt-1">Discover what's happening in the community</p>
            </div>
            <Button
              onClick={() => { setShowPostForm(true); setPostStep('tier'); setPostError(''); }}
              size="sm"
              className="gap-1.5 text-xs tracking-wider uppercase font-semibold cursor-pointer"
              style={{ backgroundColor: 'hsl(35, 45%, 42%)' }}
            >
              <Plus className="w-3.5 h-3.5" />
              Post Event
            </Button>
          </div>
        </div>
      </section>

      {/* ── Controls Bar ── */}
      <section className="border-b border-gray-100 bg-white sticky top-14 z-30">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-3">
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
            {/* View toggle + Sort */}
            <div className="flex items-center gap-2 self-start">
              <div className="flex items-center gap-1 bg-gray-100 rounded-full p-1">
                <button
                  onClick={() => setView('list')}
                  className={[
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer',
                    view === 'list'
                      ? 'bg-white shadow text-gray-900'
                      : 'text-gray-500 hover:text-gray-700',
                  ].join(' ')}
                >
                  <List className="w-3.5 h-3.5" />
                  List
                </button>
                <button
                  onClick={() => setView('calendar')}
                  className={[
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer',
                    view === 'calendar'
                      ? 'bg-white shadow text-gray-900'
                      : 'text-gray-500 hover:text-gray-700',
                  ].join(' ')}
                >
                  <Calendar className="w-3.5 h-3.5" />
                  Calendar
                </button>
              </div>
              {view === 'list' && (
                <button
                  onClick={() => setSortDesc(s => !s)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-gray-500 hover:text-gray-700 bg-gray-100 hover:bg-gray-200 transition-all cursor-pointer"
                  title={sortDesc ? 'Newest first' : 'Oldest first'}
                >
                  <ArrowDownUp className="w-3.5 h-3.5" />
                  {sortDesc ? 'Newest' : 'Oldest'}
                </button>
              )}
            </div>

            {/* Search input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(30,10%,50%)]" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search events..."
                className="pl-10 pr-4 h-9 w-full sm:w-64 text-sm border border-[hsl(35,18%,84%)] bg-white rounded focus:outline-none focus:ring-1 focus:ring-[hsl(35,45%,42%)]"
              />
            </div>

            {/* Category filters */}
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setCategory(null)}
                className={[
                  'px-3 py-1 rounded-full text-xs font-medium transition-all cursor-pointer border',
                  category === null
                    ? 'text-white border-transparent'
                    : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300',
                ].join(' ')}
                style={category === null ? { backgroundColor: PRIMARY, borderColor: PRIMARY } : {}}
              >
                All
              </button>
              {CATEGORIES.map(cat => (
                <button
                  key={cat.value}
                  onClick={() => setCategory(cat.value)}
                  className={[
                    'px-3 py-1 rounded-full text-xs font-medium transition-all cursor-pointer border',
                    category === cat.value
                      ? `${cat.color} border-transparent`
                      : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300',
                  ].join(' ')}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Main Content ── */}
      <section className="py-8">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          {loading ? (
            /* Skeleton grid */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {[1, 2, 3, 4, 5, 6].map(n => (
                <Card key={n} className="border-0 shadow-md rounded-2xl animate-pulse">
                  <div className="h-40 bg-gray-200 rounded-t-2xl" />
                  <CardContent className="p-4 space-y-3">
                    <div className="h-5 bg-gray-200 rounded-lg w-1/4" />
                    <div className="h-4 bg-gray-200 rounded-lg w-3/4" />
                    <div className="h-3 bg-gray-100 rounded-lg w-1/2" />
                    <div className="h-3 bg-gray-100 rounded-lg w-2/3" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : view === 'list' ? (
            sortedEvents.length === 0 ? (
              <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-gray-200">
                <Calendar className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                <p className="text-gray-500 text-sm mb-1">No events found</p>
                <p className="text-gray-400 text-xs">
                  {category ? 'Try a different category or check back later.' : 'Check back soon for upcoming events!'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {sortedEvents.map(event => (
                  <EventCard key={event.id} event={event} />
                ))}
              </div>
            )
          ) : (
            <CalendarView events={events} />
          )}
        </div>
      </section>
      <SponsorBanner placement="events" />

      {/* Success toast */}
      {postSuccess && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-white border border-[hsl(35,25%,70%)] shadow-lg rounded-lg p-4 flex items-center gap-3 max-w-md">
          <CheckCircle className="w-5 h-5 flex-shrink-0" style={{ color: PRIMARY }} />
          <div>
            <p className="text-sm font-semibold text-[hsl(30,15%,18%)]">Event submitted!</p>
            <p className="text-xs text-[hsl(30,10%,48%)]">Payment received. Your event will be live after admin review.</p>
          </div>
          <button onClick={() => setPostSuccess(false)} className="text-gray-400 hover:text-gray-600 cursor-pointer"><X size={16} /></button>
        </div>
      )}

      {/* Post Event Modal */}
      {showPostForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
          style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowPostForm(false); }}
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setShowPostForm(false)}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all cursor-pointer z-10"
            >
              <X size={18} />
            </button>

            <div className="p-6 md:p-8">
              {postStep === 'tier' ? (
                <>
                  <h2 className="text-xl font-bold font-serif text-gray-900 mb-1">Post an Event</h2>
                  <p className="text-sm text-gray-500 mb-6">Select your organization type to continue</p>

                  <div className="space-y-3">
                    {/* For-Profit */}
                    <button
                      onClick={() => { setPostTier('forprofit'); setPostStep('details'); }}
                      className="w-full text-left border-2 rounded-xl p-5 transition-all hover:border-[hsl(35,45%,42%)] hover:shadow-md cursor-pointer"
                      style={{ borderColor: 'hsl(35, 18%, 84%)' }}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-semibold text-gray-900">For-Profit Business</h3>
                        <span className="text-xl font-bold font-serif" style={{ color: 'hsl(35, 45%, 42%)' }}>$19.99</span>
                      </div>
                      <p className="text-xs text-gray-500">Standard rate for businesses and commercial event postings.</p>
                    </button>

                    {/* Nonprofit */}
                    <button
                      onClick={() => { setPostTier('nonprofit'); setPostStep('details'); }}
                      className="w-full text-left border-2 rounded-xl p-5 transition-all hover:border-[hsl(160,25%,24%)] hover:shadow-md cursor-pointer"
                      style={{ borderColor: 'hsl(35, 18%, 84%)' }}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-semibold text-gray-900">Not-for-Profit Organization</h3>
                        <span className="text-xl font-bold font-serif" style={{ color: PRIMARY }}>$9.99</span>
                      </div>
                      <p className="text-xs text-gray-500">Reduced rate for registered nonprofits. Documentation of not-for-profit status is required during checkout.</p>
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2 mb-1">
                    <button
                      onClick={() => setPostStep('tier')}
                      className="text-xs flex items-center gap-1 hover:underline cursor-pointer"
                      style={{ color: 'hsl(35, 45%, 42%)' }}
                    >
                      <ChevronLeft size={14} /> Back
                    </button>
                  </div>
                  <h2 className="text-xl font-bold font-serif text-gray-900 mb-1">Event Details</h2>
                  <p className="text-sm text-gray-500 mb-1">
                    {postTier === 'nonprofit' ? 'Not-for-Profit' : 'For-Profit'} — <span className="font-semibold" style={{ color: 'hsl(35, 45%, 42%)' }}>{postTier === 'nonprofit' ? '$9.99' : '$19.99'}</span>
                  </p>

                  {postError && (
                    <div className="mb-4 p-3 rounded-xl border border-red-200 bg-red-50 text-sm text-red-700">{postError}</div>
                  )}

                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      setPostError('');
                      if (postTier === 'nonprofit' && !nonprofitDocUrl) {
                        setPostError('Please upload documentation of your not-for-profit status.');
                        return;
                      }
                      setPostSubmitting(true);
                      try {
                        const res = await eventApi.submit({
                          ...postForm,
                          is_nonprofit: postTier === 'nonprofit',
                          nonprofit_doc_url: nonprofitDocUrl || undefined,
                        });
                        const checkoutUrl = res.data?.checkout_url;
                        if (checkoutUrl) {
                          window.location.href = checkoutUrl;
                        }
                      } catch {
                        setPostError('Something went wrong. Please try again.');
                      } finally {
                        setPostSubmitting(false);
                      }
                    }}
                    className="space-y-4 mt-4"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="block text-sm font-medium text-gray-700">Your Name <span className="text-red-400">*</span></label>
                        <Input value={postForm.submitted_by_name} onChange={(e) => setPostForm(f => ({ ...f, submitted_by_name: e.target.value }))} required placeholder="Jane Smith" className="rounded-xl h-11" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="block text-sm font-medium text-gray-700">Your Email <span className="text-red-400">*</span></label>
                        <Input type="email" value={postForm.submitted_by_email} onChange={(e) => setPostForm(f => ({ ...f, submitted_by_email: e.target.value }))} required placeholder="jane@example.com" className="rounded-xl h-11" />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-gray-700">Event Title <span className="text-red-400">*</span></label>
                      <Input value={postForm.title} onChange={(e) => setPostForm(f => ({ ...f, title: e.target.value }))} required placeholder="Spring Community Fair" className="rounded-xl h-11" />
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-gray-700">Description</label>
                      <textarea value={postForm.description} onChange={(e) => setPostForm(f => ({ ...f, description: e.target.value }))} rows={3} placeholder="What's this event about?"
                        className="w-full px-3 py-2.5 text-sm border border-input bg-background rounded-xl resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="block text-sm font-medium text-gray-700">Start Date & Time <span className="text-red-400">*</span></label>
                        <Input type="datetime-local" value={postForm.start_date} onChange={(e) => setPostForm(f => ({ ...f, start_date: e.target.value }))} required className="rounded-xl h-11" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="block text-sm font-medium text-gray-700">End Date & Time</label>
                        <Input type="datetime-local" value={postForm.end_date} onChange={(e) => setPostForm(f => ({ ...f, end_date: e.target.value }))} className="rounded-xl h-11" />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="block text-sm font-medium text-gray-700">Location</label>
                        <Input value={postForm.location} onChange={(e) => setPostForm(f => ({ ...f, location: e.target.value }))} placeholder="Town Square, Montross" className="rounded-xl h-11" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="block text-sm font-medium text-gray-700">Category</label>
                        <select value={postForm.category} onChange={(e) => setPostForm(f => ({ ...f, category: e.target.value }))}
                          className="w-full px-3 py-2.5 h-11 text-sm border border-input bg-background rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer">
                          {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                        </select>
                      </div>
                    </div>

                    {/* Nonprofit documentation upload */}
                    {postTier === 'nonprofit' && (
                      <div className="space-y-1.5 p-4 rounded-xl border-2 border-dashed" style={{ borderColor: 'hsl(160, 25%, 70%)', backgroundColor: 'hsl(160, 20%, 97%)' }}>
                        <label className="block text-sm font-medium" style={{ color: PRIMARY }}>
                          <Upload className="w-4 h-4 inline mr-1.5" />
                          Not-for-Profit Documentation <span className="text-red-400">*</span>
                        </label>
                        <p className="text-xs text-gray-500 mb-2">Upload proof of your not-for-profit status (IRS determination letter, state registration, etc.)</p>
                        {nonprofitDocUrl ? (
                          <div className="flex items-center gap-2">
                            <CheckCircle className="w-4 h-4" style={{ color: PRIMARY }} />
                            <span className="text-sm text-gray-700">Document uploaded</span>
                            <button type="button" onClick={() => setNonprofitDocUrl(null)} className="text-xs text-red-500 hover:underline cursor-pointer ml-2">Remove</button>
                          </div>
                        ) : (
                          <label className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border border-gray-200 rounded-xl cursor-pointer hover:bg-white transition-colors">
                            {docUploading ? 'Uploading...' : 'Choose File'}
                            <input type="file" accept="image/*,.pdf" className="hidden" disabled={docUploading} onChange={async (ev) => {
                              const file = ev.target.files?.[0];
                              if (!file) return;
                              setDocUploading(true);
                              try {
                                const { data } = await uploadApi.uploadPhoto(file);
                                setNonprofitDocUrl(data.photo_url);
                              } catch { /* silent */ }
                              setDocUploading(false);
                              ev.target.value = '';
                            }} />
                          </label>
                        )}
                      </div>
                    )}

                    <div className="flex gap-3 pt-2">
                      <Button type="button" variant="outline" onClick={() => setShowPostForm(false)} className="flex-1 h-11 rounded-xl cursor-pointer">
                        Cancel
                      </Button>
                      <Button type="submit" disabled={postSubmitting}
                        className="flex-1 h-11 rounded-xl font-semibold text-white cursor-pointer"
                        style={{ backgroundColor: 'hsl(35, 45%, 42%)' }}
                      >
                        {postSubmitting ? 'Redirecting to Payment...' : `Pay ${postTier === 'nonprofit' ? '$9.99' : '$19.99'} & Submit`}
                      </Button>
                    </div>
                    <p className="text-[10px] text-gray-400 text-center">
                      You'll be securely redirected to Stripe to complete payment. Event goes live after admin review.
                    </p>
                  </form>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </PageLayout>
  );
}
