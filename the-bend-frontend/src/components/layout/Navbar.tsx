import { Link, useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/authStore';

export function Navbar() {
  const { isAuthenticated, user, logout } = useAuthStore();
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-50 w-full bg-white border-b shadow-sm">
      <div className="max-w-7xl mx-auto flex items-center justify-between h-16 px-4 md:px-8">
        <Link to="/" className="flex items-center gap-2">
          <span className="text-xl font-bold" style={{ color: 'hsl(142, 76%, 36%)' }}>
            🏘️ The Bend
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-6">
          <Link to="/" className="text-sm font-medium text-gray-600 hover:text-green-600">
            Home
          </Link>
          <Link to="/browse" className="text-sm font-medium text-gray-600 hover:text-green-600">
            Browse
          </Link>
          {isAuthenticated ? (
            <>
              <Link
                to="/messages"
                className="text-sm font-medium text-gray-600 hover:text-green-600"
              >
                Messages
              </Link>
              <Link
                to="/my-shop"
                className="text-sm font-medium text-gray-600 hover:text-green-600"
              >
                My Shop
              </Link>
              {user?.role === 'community_admin' && (
                <Link
                  to="/admin"
                  className="text-sm font-medium text-gray-600 hover:text-green-600"
                >
                  Admin
                </Link>
              )}
            </>
          ) : (
            <Link to="/about" className="text-sm font-medium text-gray-600 hover:text-green-600">
              About
            </Link>
          )}
        </nav>

        <div className="flex items-center gap-3">
          {isAuthenticated && (
            <button
              onClick={() => navigate('/notifications')}
              className="relative p-2 text-gray-500 hover:text-green-600 rounded-lg"
            >
              <Bell size={20} />
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
            </button>
          )}
          {isAuthenticated ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                logout();
                navigate('/');
              }}
            >
              Log Out
            </Button>
          ) : (
            <div className="hidden md:flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => navigate('/login')}>
                Log In
              </Button>
              <Button
                size="sm"
                onClick={() => navigate('/register')}
                style={{ backgroundColor: 'hsl(142, 76%, 36%)' }}
              >
                Register
              </Button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
