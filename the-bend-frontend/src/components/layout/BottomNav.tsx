import { useNavigate, useLocation } from 'react-router-dom';
import { Home, Search, Plus, MessageCircle, Store } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';

const tabs = [
  { icon: Home, label: 'Home', path: '/' },
  { icon: Search, label: 'Browse', path: '/browse' },
  { icon: Plus, label: 'Post', path: '/create', isCenter: true },
  { icon: MessageCircle, label: 'Messages', path: '/messages' },
  { icon: Store, label: 'My Shop', path: '/my-shop' },
];

export function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated } = useAuthStore();

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t shadow-lg">
      <div className="flex items-center justify-around h-16 px-2">
        {tabs.map((tab) => {
          const isActive = location.pathname === tab.path;
          if (tab.isCenter) {
            return (
              <button
                key={tab.path}
                onClick={() => (isAuthenticated ? navigate(tab.path) : navigate('/login'))}
                className="w-12 h-12 -mt-4 rounded-full flex items-center justify-center text-white shadow-lg"
                style={{ backgroundColor: 'hsl(142, 76%, 36%)' }}
              >
                <Plus size={24} strokeWidth={2.5} />
              </button>
            );
          }
          return (
            <button
              key={tab.path}
              onClick={() => navigate(tab.path)}
              className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg text-xs ${
                isActive ? 'text-green-600' : 'text-gray-500'
              }`}
            >
              <tab.icon size={20} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
