import { Link } from 'react-router-dom';
import { useTenant } from '@/context/TenantContext';

export function Footer() {
  const tenant = useTenant();
  const displayName = tenant.display_name.split('\u2014')[0].trim() || 'THE BEND';

  return (
    <footer className="bg-[hsl(30,12%,14%)] text-[hsl(35,15%,75%)]">
      {/* Top gold rule */}
      <div className="h-[2px]" style={{ background: 'linear-gradient(90deg, transparent, hsl(35,45%,42%), transparent)' }} />

      <div className="max-w-7xl mx-auto px-4 md:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-10">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 border border-[hsl(35,45%,42%)] flex items-center justify-center">
                <span className="text-xs font-bold font-serif text-[hsl(35,45%,55%)]">B</span>
              </div>
              <div className="leading-none">
                <span className="text-sm font-semibold font-serif text-[hsl(40,20%,90%)] tracking-wide block">{displayName.toUpperCase()}</span>
                <span className="text-[8px] tracking-[0.3em] uppercase text-[hsl(35,15%,55%)]">Community</span>
              </div>
            </div>
            <p className="text-sm leading-relaxed text-[hsl(35,12%,55%)]">
              A heritage community platform connecting local businesses to find gigs, materials, and equipment.
            </p>
          </div>
          <div>
            <h4 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[hsl(35,45%,55%)] mb-4">About</h4>
            <ul className="space-y-2.5 text-sm">
              <li><Link to="/about" className="hover:text-[hsl(40,20%,90%)] transition-colors">Our Story</Link></li>
              <li><Link to="/guidelines" className="hover:text-[hsl(40,20%,90%)] transition-colors">Community Guidelines</Link></li>
              <li><Link to="/register" className="hover:text-[hsl(40,20%,90%)] transition-colors">Register</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[hsl(35,45%,55%)] mb-4">Services</h4>
            <ul className="space-y-2.5 text-sm">
              <li><Link to="/browse?category=staff" className="hover:text-[hsl(40,20%,90%)] transition-colors">Browse Gigs</Link></li>
              <li><Link to="/browse?category=materials" className="hover:text-[hsl(40,20%,90%)] transition-colors">Browse Materials</Link></li>
              <li><Link to="/browse?category=equipment" className="hover:text-[hsl(40,20%,90%)] transition-colors">Browse Equipment</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[hsl(35,45%,55%)] mb-4">Community</h4>
            <ul className="space-y-2.5 text-sm">
              <li><Link to="/volunteers" className="hover:text-[hsl(40,20%,90%)] transition-colors">Volunteer Board</Link></li>
              <li><Link to="/talent" className="hover:text-[hsl(40,20%,90%)] transition-colors">Talent Marketplace</Link></li>
              <li><Link to="/browse" className="hover:text-[hsl(40,20%,90%)] transition-colors">All Listings</Link></li>
              <li><Link to="/advertise" className="hover:text-[hsl(40,20%,90%)] transition-colors">Advertise</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-[hsl(30,10%,22%)] pt-5 flex flex-col sm:flex-row justify-between items-center gap-2 text-xs text-[hsl(35,10%,45%)]">
          <span>&copy; {new Date().getFullYear()} {tenant.display_name}. All rights reserved.</span>
          <span className="italic" style={{ fontFamily: 'var(--font-serif)' }}>{tenant.footer_text || 'Preserving community, one connection at a time'}</span>
        </div>
      </div>
    </footer>
  );
}
