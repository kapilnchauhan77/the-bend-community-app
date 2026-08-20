import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Calendar, Clock, ExternalLink, MapPin } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EventThumb } from '@/components/shared/EventThumb';
import { PageLayout } from '@/components/layout/PageLayout';
import { ShareButton } from '@/components/shared/ShareButton';
import { usePlatformServices } from '@/platform/createPlatformServices';
import { eventApi } from '@/services/eventApi';
import { parseSafeExternalUrl } from '@/lib/safeExternalUrl';
import { publicWestmorelandUrl } from '@/lib/publicUrl';
import { parseServerDate } from '@/lib/utils';
import type { CommunityEvent } from '@/types';
type EventDetailState = { status: 'loading' } | { status: 'success'; event: CommunityEvent } | { status: 'unavailable' } | { status: 'error'; error: Error };
function responseStatus(error: unknown): number | undefined { return (error as { response?: { status?: number } })?.response?.status; }
function formatEventTime(event: CommunityEvent): string { const start = parseServerDate(event.start_date); const end = event.end_date ? parseServerDate(event.end_date) : null; const date = start.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }); const time = start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); return end ? `${date} at ${time} to ${end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : `${date} at ${time}`; }
export function EventDetailPage() {
  const { eventId } = useParams<{ eventId: string }>(); const services = usePlatformServices(); const [state, setState] = useState<EventDetailState>({ status: 'loading' }); const [retryKey, setRetryKey] = useState(0);
  const load = useCallback(() => { if (!eventId) { setState({ status: 'unavailable' }); return () => undefined; } const controller = new AbortController(); let active = true; setState({ status: 'loading' }); eventApi.getDetail(eventId, { signal: controller.signal }).then((response) => { if (active && !controller.signal.aborted) setState({ status: 'success', event: response.data }); }).catch((error: unknown) => { if (!active || controller.signal.aborted) return; const status = responseStatus(error); if (status && [400, 401, 403, 404, 422].includes(status)) setState({ status: 'unavailable' }); else setState({ status: 'error', error: error instanceof Error ? error : new Error('Could not load event') }); }); return () => { active = false; controller.abort(); }; }, [eventId]);
  // The request lifecycle owns this state reset because each id/retry starts a fresh load.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => load(), [load, retryKey]);
  let content: React.ReactNode;
  if (state.status === 'loading') content = <p role="status" className="event-detail-message">Loading event</p>;
  else if (state.status === 'unavailable') content = <section role="status" className="event-detail-message"><h1>Event unavailable</h1><p>This event is no longer available.</p><Link to="/events">Back to events</Link></section>;
  else if (state.status === 'error') content = <section role="status" className="event-detail-message"><h1>Unable to load event</h1><p>We couldn't load this event right now.</p><Button type="button" onClick={() => setRetryKey((value) => value + 1)}>Retry event</Button></section>;
  else { const event = state.event; const source = parseSafeExternalUrl(event.source_url); content = <article className="event-detail-page"><div className="event-detail-hero"><EventThumb event={event} className="event-detail-image" /></div><div className="event-detail-content"><div className="event-detail-actions"><ShareButton url={publicWestmorelandUrl(`/events/${event.id}`)} title={event.title} description={event.description} /><Link to="/events">All events</Link></div><Badge>{event.category}</Badge><h1>{event.title}</h1><dl className="event-detail-meta"><div><dt><Calendar aria-hidden="true" size={18} /> Date and time</dt><dd><Clock aria-hidden="true" size={16} />{formatEventTime(event)}</dd></div>{event.location && <div><dt><MapPin aria-hidden="true" size={18} /> Location</dt><dd>{event.location}</dd></div>}</dl>{event.description && <section><h2>About this event</h2><p>{event.description}</p></section>}{source && <a className="event-detail-source" href={source.href} target="_blank" rel="noopener noreferrer" onClick={(e) => { e.preventDefault(); void services.browser.open(source.href); }}><ExternalLink aria-hidden="true" size={16} /> View source</a>}</div></article>; }
  return <PageLayout showFooter={false}>{content}</PageLayout>;
}
export default EventDetailPage;
