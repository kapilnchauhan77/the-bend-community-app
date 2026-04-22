import { resolveAssetUrl } from '@/lib/constants';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, Menu, X, ChevronDown, Settings, LogOut, User as UserIcon, Store, Bookmark, Moon, Sun } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/authStore';
import { useDarkMode } from '@/hooks/useDarkMode';

const BRONZE = 'hsl(35, 45%, 42%)';

export function Navbar() {
  const { isAuthenticated, user, shop, logout } = useAuthStore();
  const navigate = useNavigate();
  const { isDark, toggle: toggleDark } = useDarkMode();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [communityOpen, setCommunityOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setCommunityOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const communityLinks = [
    { to: '/directory', label: 'Directory' },
    { to: '/volunteers', label: 'Volunteers' },
    { to: '/talent', label: 'Talent' },
    { to: '/about', label: 'About' },
  ];

  return (
    <>
      {/* Accent bar */}
      <div className="h-[3px]" style={{ background: `linear-gradient(90deg, hsl(160,25%,24%), ${BRONZE}, hsl(160,25%,24%))` }} />

      <header className="sticky top-0 z-50 w-full bg-[hsl(40,20%,98%)] border-b border-[hsl(35,18%,84%)]">
        <div className="max-w-7xl mx-auto flex items-center justify-between h-14 px-4 md:px-8">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3 shrink-0 group">
            <div className="w-9 h-9 border-2 border-[hsl(35,45%,42%)] flex items-center justify-center transition-colors group-hover:bg-[hsl(35,45%,42%)]">
              <span className="text-sm font-bold font-serif text-[hsl(35,45%,42%)] group-hover:text-white transition-colors" style={{ letterSpacing: '0.05em' }}>B</span>
            </div>
            <div className="leading-none">
              <span className="text-[15px] font-semibold font-serif text-[hsl(30,15%,18%)] tracking-wide block">THE BEND</span>
              <span className="text-[9px] tracking-[0.3em] uppercase text-[hsl(30,10%,48%)]">Community</span>
            </div>
          </Link>

          {/* Desktop nav — consolidated */}
          <nav className="hidden md:flex items-center gap-1">
            <Link to="/" className="px-3 py-2 text-[13px] font-medium text-[hsl(30,10%,40%)] hover:text-[hsl(35,45%,35%)] transition-colors tracking-wide uppercase">
              Home
            </Link>
            <Link to="/browse" className="px-3 py-2 text-[13px] font-medium text-[hsl(30,10%,40%)] hover:text-[hsl(35,45%,35%)] transition-colors tracking-wide uppercase">
              Browse
            </Link>
            <Link to="/events" className="px-3 py-2 text-[13px] font-medium text-[hsl(30,10%,40%)] hover:text-[hsl(35,45%,35%)] transition-colors tracking-wide uppercase">
              Events
            </Link>

            {/* Community dropdown */}
            <div ref={dropdownRef} className="relative">
              <button
                onClick={() => setCommunityOpen(!communityOpen)}
                className="px-3 py-2 text-[13px] font-medium text-[hsl(30,10%,40%)] hover:text-[hsl(35,45%,35%)] transition-colors tracking-wide uppercase flex items-center gap-1 cursor-pointer"
              >
                Community
                <ChevronDown size={14} className={`transition-transform ${communityOpen ? 'rotate-180' : ''}`} />
              </button>
              {communityOpen && (
                <div className="absolute top-full left-0 mt-1 w-44 bg-[hsl(40,20%,98%)] border border-[hsl(35,18%,84%)] shadow-lg py-1 z-50">
                  {communityLinks.map((link) => (
                    <Link
                      key={link.to}
                      to={link.to}
                      onClick={() => setCommunityOpen(false)}
                      className="block px-4 py-2 text-[13px] font-medium text-[hsl(30,10%,40%)] hover:text-[hsl(35,45%,35%)] hover:bg-[hsl(35,15%,94%)] transition-colors tracking-wide uppercase"
                    >
                      {link.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {isAuthenticated && (
              <>
                <Link to="/messages" className="px-3 py-2 text-[13px] font-medium text-[hsl(30,10%,40%)] hover:text-[hsl(35,45%,35%)] transition-colors tracking-wide uppercase">
                  Messages
                </Link>
                {user?.role !== 'community_admin' && user?.role !== 'super_admin' && (
                  <Link to="/my-shop" className="px-3 py-2 text-[13px] font-medium text-[hsl(30,10%,40%)] hover:text-[hsl(35,45%,35%)] transition-colors tracking-wide uppercase">
                    My Business
                  </Link>
                )}
                {user?.role === 'community_admin' && (
                  <Link to="/admin" className="px-3 py-2 text-[13px] font-medium text-[hsl(30,10%,40%)] hover:text-[hsl(35,45%,35%)] transition-colors tracking-wide uppercase">
                    Admin
                  </Link>
                )}
                {user?.role === 'super_admin' && (
                  <Link to="/super-admin" className="px-3 py-2 text-[13px] font-medium text-[hsl(30,10%,40%)] hover:text-[hsl(35,45%,35%)] transition-colors tracking-wide uppercase">
                    Super Admin
                  </Link>
                )}
              </>
            )}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-2">
            <button
              onClick={toggleDark}
              className="p-2 text-[hsl(30,10%,48%)] hover:text-[hsl(35,45%,42%)] transition-colors cursor-pointer"
              aria-label="Toggle dark mode"
            >
              {isDark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            {isAuthenticated && (
              <button
                onClick={() => navigate('/notifications')}
                className="relative p-2 text-[hsl(30,10%,48%)] hover:text-[hsl(35,45%,42%)] transition-colors cursor-pointer"
                aria-label="Notifications"
              >
                <Bell size={18} />
                <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-[hsl(0,55%,45%)] rounded-full" />
              </button>
            )}
            {isAuthenticated ? (
              <div ref={profileRef} className="relative">
                <button
                  onClick={() => setProfileOpen(!profileOpen)}
                  className="flex items-center gap-2 cursor-pointer rounded-full transition-all hover:ring-2 hover:ring-[hsl(35,18%,84%)]"
                  aria-label="Profile menu"
                >
                  <div className="w-8 h-8 rounded-full overflow-hidden border border-[hsl(35,18%,84%)] bg-[hsl(35,15%,90%)]">
                    {user?.avatar_url ? (
                      <img src={resolveAssetUrl(user.avatar_url)} alt={user.name || ''} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs font-bold font-serif text-[hsl(160,25%,24%)]">
                        {user?.name?.charAt(0).toUpperCase() || '?'}
                      </div>
                    )}
                  </div>
                </button>
                {profileOpen && (
                  <div className="absolute top-full right-0 mt-2 w-56 bg-[hsl(40,20%,98%)] border border-[hsl(35,18%,84%)] shadow-lg py-1 z-50">
                    {/* User info */}
                    <div className="px-4 py-3 border-b border-[hsl(35,18%,88%)]">
                      <p className="font-serif font-semibold text-sm text-[hsl(30,15%,18%)] truncate">{user?.name}</p>
                      <p className="text-xs text-[hsl(30,10%,50%)] truncate">{user?.email}</p>
                      {shop && <p className="text-[10px] text-[hsl(35,45%,42%)] mt-0.5 truncate">{shop.name}</p>}
                    </div>
                    {/* Menu items */}
                    {user?.role !== 'community_admin' && user?.role !== 'super_admin' && (
                      <button
                        onClick={() => { setProfileOpen(false); navigate('/my-shop'); }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-[13px] text-[hsl(30,10%,40%)] hover:bg-[hsl(35,15%,94%)] transition-colors cursor-pointer text-left"
                      >
                        <Store size={15} />
                        My Business
                      </button>
                    )}
                    <button
                      onClick={() => { setProfileOpen(false); navigate('/saved'); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-[13px] text-[hsl(30,10%,40%)] hover:bg-[hsl(35,15%,94%)] transition-colors cursor-pointer text-left"
                    >
                      <Bookmark size={15} />
                      Saved
                    </button>
                    <button
                      onClick={() => { setProfileOpen(false); navigate('/settings'); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-[13px] text-[hsl(30,10%,40%)] hover:bg-[hsl(35,15%,94%)] transition-colors cursor-pointer text-left"
                    >
                      <Settings size={15} />
                      Settings
                    </button>
                    <div className="border-t border-[hsl(35,18%,88%)] mt-1 pt-1">
                      <button
                        onClick={() => { setProfileOpen(false); logout(); navigate('/'); }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-[13px] text-[hsl(0,50%,45%)] hover:bg-[hsl(0,50%,97%)] transition-colors cursor-pointer text-left"
                      >
                        <LogOut size={15} />
                        Log Out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="hidden md:flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-[11px] tracking-wider uppercase border-[hsl(35,18%,82%)] text-[hsl(30,15%,30%)] hover:bg-[hsl(35,15%,92%)] cursor-pointer"
                  onClick={() => navigate('/login')}
                >
                  Log In
                </Button>
                <Button
                  size="sm"
                  className="text-[11px] tracking-wider uppercase text-white cursor-pointer"
                  style={{ backgroundColor: BRONZE }}
                  onClick={() => navigate('/register')}
                >
                  Register
                </Button>
              </div>
            )}

            {/* Mobile menu */}
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="md:hidden p-2 text-[hsl(30,10%,40%)] hover:text-[hsl(35,45%,42%)] cursor-pointer"
              aria-label="Toggle menu"
            >
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* Mobile nav — all links flat */}
        {mobileOpen && (
          <nav className="md:hidden border-t border-[hsl(35,18%,84%)] bg-[hsl(40,20%,98%)] px-4 py-2">
            {[
              { to: '/', label: 'Home' },
              { to: '/browse', label: 'Browse' },
              { to: '/events', label: 'Events' },
              { to: '/directory', label: 'Directory' },
              { to: '/volunteers', label: 'Volunteers' },
              { to: '/talent', label: 'Talent' },
              { to: '/about', label: 'About' },
              ...(isAuthenticated
                ? [
                    { to: '/messages', label: 'Messages' },
                    ...(user?.role !== 'community_admin' && user?.role !== 'super_admin' ? [{ to: '/my-shop', label: 'My Business' }] : []),
                    ...(user?.role === 'community_admin' ? [{ to: '/admin', label: 'Admin' }] : []),
                    ...(user?.role === 'super_admin' ? [{ to: '/super-admin', label: 'Super Admin' }] : []),
                  ]
                : []),
            ].map((link) => (
              <Link
                key={link.to}
                to={link.to}
                onClick={() => setMobileOpen(false)}
                className="block px-3 py-2.5 text-[13px] font-medium text-[hsl(30,10%,40%)] hover:text-[hsl(35,45%,35%)] tracking-wide uppercase transition-colors"
              >
                {link.label}
              </Link>
            ))}
            {!isAuthenticated && (
              <div className="flex gap-2 mt-2 px-3 pb-2">
                <Button variant="outline" size="sm" className="flex-1 text-[11px] tracking-wider uppercase cursor-pointer" onClick={() => { navigate('/login'); setMobileOpen(false); }}>
                  Log In
                </Button>
                <Button size="sm" className="flex-1 text-[11px] tracking-wider uppercase text-white cursor-pointer" style={{ backgroundColor: BRONZE }} onClick={() => { navigate('/register'); setMobileOpen(false); }}>
                  Register
                </Button>
              </div>
            )}
          </nav>
        )}
      </header>
    </>
  );
}
