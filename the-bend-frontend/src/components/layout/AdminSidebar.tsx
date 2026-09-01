import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, ClipboardList, Store, Users, FileText, Upload, BarChart3, Calendar, Link2, Megaphone, DollarSign, Settings, Flag, Gift } from 'lucide-react';

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/admin' },
  { icon: ClipboardList, label: 'Registrations', path: '/admin/registrations' },
  { icon: Store, label: 'Businesses', path: '/admin/shops' },
  { icon: Users, label: 'Individuals', path: '/admin/individuals' },
  { icon: FileText, label: 'Listings', path: '/admin/listings' },
  { icon: Upload, label: 'Guidelines', path: '/admin/guidelines' },
  { icon: BarChart3, label: 'Reports', path: '/admin/reports' },
  { icon: Calendar, label: 'Events', path: '/admin/events' },
  { icon: Link2, label: 'Connectors', path: '/admin/connectors' },
  { icon: Megaphone, label: 'Sponsors', path: '/admin/sponsors' },
  { icon: Flag, label: 'Flagged', path: '/admin/flagged' },
  { icon: Gift, label: 'Refer a County', path: '/admin/referrals' },
  { icon: DollarSign, label: 'Pricing', path: '/admin/pricing' },
  { icon: Settings, label: 'Settings', path: '/admin/settings' },
];

export function AdminSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const currentPath = navItems.some((item) => item.path === location.pathname)
    ? location.pathname
    : '/admin';

  return (
    <>
      <div className="border-b bg-white px-4 py-3 md:hidden">
        <label
          htmlFor="admin-section"
          className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500"
        >
          Admin section
        </label>
        <select
          id="admin-section"
          aria-label="Admin section"
          value={currentPath}
          onChange={(event) => navigate(event.target.value)}
          className="min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-base text-gray-900"
        >
          {navItems.map((item) => (
            <option key={item.path} value={item.path}>
              {item.label}
            </option>
          ))}
        </select>
      </div>
      <aside className="hidden min-h-screen w-60 shrink-0 border-r bg-white md:block">
        <div className="p-4 border-b">
          <span className="text-lg font-bold text-[hsl(160,25%,24%)]">
            Admin
          </span>
        </div>
        <nav className="p-2 space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? 'bg-[hsl(35,15%,94%)] text-[hsl(160,25%,24%)]' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <item.icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
