import { useNavigate, useLocation } from 'react-router-dom';
import { Home, Search, Plus, Calendar, MessageCircle, Store, Shield } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';

export function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, user } = useAuthStore();
  const isAdmin = user?.role === 'community_admin';
  const isSuperAdmin = user?.role === 'super_admin';

  const leftTabs = [
    { icon: Home, label: 'Home', path: '/' },
    { icon: Calendar, label: 'Events', path: '/events' },
  ];

  const rightTabs = [
    { icon: MessageCircle, label: 'Messages', path: '/messages' },
    isSuperAdmin
      ? { icon: Shield, label: 'Super', path: '/super-admin' }
      : isAdmin
        ? { icon: Shield, label: 'Admin', path: '/admin' }
        : { icon: Store, label: 'Business', path: '/my-shop' },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t shadow-lg">
      <div className="relative flex items-end h-16">
        {/* Left tabs */}
        <div className="flex-1 flex">
          {leftTabs.map((tab) => {
            const isActive = location.pathname === tab.path;
            return (
              <button
                key={tab.path}
                onClick={() => navigate(tab.path)}
                className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] cursor-pointer ${
                  isActive ? 'text-[hsl(160,25%,28%)]' : 'text-gray-400'
                }`}
              >
                <tab.icon size={20} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Center Post button */}
        <div className="w-16 flex justify-center">
          <button
            onClick={() => (isAuthenticated ? navigate('/create') : navigate('/login'))}
            className="absolute -top-5 left-1/2 -translate-x-1/2 w-14 h-14 rounded-full flex items-center justify-center text-white shadow-lg cursor-pointer"
            style={{ backgroundColor: 'hsl(160, 25%, 24%)' }}
          >
            <Plus size={26} strokeWidth={2.5} />
          </button>
          <span className="text-[10px] text-gray-400 mt-auto pb-2">Post</span>
        </div>

        {/* Right tabs */}
        <div className="flex-1 flex">
          {rightTabs.map((tab) => {
            const isActive = location.pathname === tab.path;
            return (
              <button
                key={tab.path}
                onClick={() => navigate(tab.path)}
                className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] cursor-pointer ${
                  isActive ? 'text-[hsl(160,25%,28%)]' : 'text-gray-400'
                }`}
              >
                <tab.icon size={20} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
