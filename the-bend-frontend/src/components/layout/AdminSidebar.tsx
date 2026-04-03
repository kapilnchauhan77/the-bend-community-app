import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, ClipboardList, Store, FileText, Upload, BarChart3 } from 'lucide-react';

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/admin' },
  { icon: ClipboardList, label: 'Registrations', path: '/admin/registrations' },
  { icon: Store, label: 'Shops', path: '/admin/shops' },
  { icon: FileText, label: 'Listings', path: '/admin/listings' },
  { icon: Upload, label: 'Guidelines', path: '/admin/guidelines' },
  { icon: BarChart3, label: 'Reports', path: '/admin/reports' },
];

export function AdminSidebar() {
  const location = useLocation();
  return (
    <aside className="w-60 min-h-screen bg-white border-r hidden md:block">
      <div className="p-4 border-b">
        <span className="text-lg font-bold" style={{ color: 'hsl(142, 76%, 36%)' }}>
          🏘️ Admin
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
                isActive ? 'bg-green-50 text-green-700' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <item.icon size={18} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
