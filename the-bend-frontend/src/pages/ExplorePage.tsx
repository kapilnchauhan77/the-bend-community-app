import { Link } from 'react-router-dom';

export default function ExplorePage() {
  return <section className="mx-auto max-w-lg px-5 py-8"><h1 className="font-serif text-3xl font-bold">Explore</h1><p className="mt-2 text-sm text-gray-600">Discover listings, events, businesses, and community stories.</p><div className="mt-6 grid gap-3"><Link className="rounded border p-4 font-medium" to="/browse">Browse listings</Link><Link className="rounded border p-4 font-medium" to="/events">Community events</Link><Link className="rounded border p-4 font-medium" to="/businesses">Local businesses</Link></div></section>;
}
