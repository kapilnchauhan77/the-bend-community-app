import { Link } from 'react-router-dom';

export function Footer() {
  return (
    <footer className="bg-green-950 text-white">
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          <div>
            <span className="text-xl font-bold">🏘️ The Bend</span>
            <p className="text-green-300 text-sm mt-2 leading-relaxed">
              A community platform connecting local shops to share staff, materials, and equipment.
            </p>
          </div>
          <div>
            <h4 className="font-semibold mb-3">About</h4>
            <ul className="space-y-2 text-sm text-green-300">
              <li>
                <Link to="/about" className="hover:text-white">
                  Our Story
                </Link>
              </li>
              <li>
                <Link to="/about" className="hover:text-white">
                  Community Guidelines
                </Link>
              </li>
              <li>
                <Link to="/register" className="hover:text-white">
                  Register
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold mb-3">Quick Links</h4>
            <ul className="space-y-2 text-sm text-green-300">
              <li>
                <Link to="/browse?category=staff" className="hover:text-white">
                  Browse Staff
                </Link>
              </li>
              <li>
                <Link to="/browse?category=materials" className="hover:text-white">
                  Browse Materials
                </Link>
              </li>
              <li>
                <Link to="/browse?category=equipment" className="hover:text-white">
                  Browse Equipment
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold mb-3">Connect</h4>
            <ul className="space-y-2 text-sm text-green-300">
              <li>📞 Contact Us</li>
              <li>💬 WhatsApp</li>
            </ul>
          </div>
        </div>
        <div className="border-t border-green-800 pt-4 text-sm text-green-400">
          © 2026 The Bend Community
        </div>
      </div>
    </footer>
  );
}
