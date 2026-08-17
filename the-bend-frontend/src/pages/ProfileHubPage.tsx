import { Link } from 'react-router-dom';

export default function ProfileHubPage() {
  return <section className="mx-auto max-w-lg px-5 py-8"><h1 className="font-serif text-3xl font-bold">You</h1><p className="mt-2 text-sm text-gray-600">Manage your account and community activity.</p><div className="mt-6 grid gap-3"><Link className="rounded border p-4 font-medium" to="/settings">Settings</Link><Link className="rounded border p-4 font-medium" to="/my-listings">My listings</Link></div></section>;
}
