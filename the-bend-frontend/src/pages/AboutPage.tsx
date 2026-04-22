import { useNavigate } from 'react-router-dom';
import {
  Users,
  Package,
  Wrench,
  Heart,
  Handshake,
  Leaf,
  ShieldCheck,
  MessageCircle,
  ArrowLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PageLayout } from '@/components/layout/PageLayout';
import { useTenant } from '@/context/TenantContext';

const PRIMARY = 'hsl(160, 25%, 24%)';

const values = [
  {
    icon: Handshake,
    title: 'Community First',
    description:
      'We believe local businesses thrive when they support each other. The community connects businesses so neighbors can share what they have and find what they need.',
  },
  {
    icon: Leaf,
    title: 'Reduce Waste',
    description:
      'Surplus ingredients, idle equipment, and open shifts don\'t have to go to waste. By sharing resources, we keep materials in use and out of landfills.',
  },
  {
    icon: ShieldCheck,
    title: 'Trust & Safety',
    description:
      'Every business is verified before joining. Community guidelines keep interactions respectful and transactions fair for everyone.',
  },
  {
    icon: MessageCircle,
    title: 'Direct Communication',
    description:
      'Message businesses directly through the platform. No middlemen, no fees — just neighbors helping neighbors.',
  },
];

const categories = [
  {
    icon: Users,
    title: 'Gig Opportunities',
    description: 'Post job openings and find available workers in the community. Whether you need weekend help or have skills to offer, the Gig Board connects you.',
    color: 'bg-[hsl(35,15%,90%)] text-[hsl(160,25%,24%)]',
  },
  {
    icon: Package,
    title: 'Raw Materials',
    description: 'Surplus flour, produce, or packaging? List it before it expires so a neighbor can put it to good use — free or at cost.',
    color: 'bg-teal-100 text-teal-700',
  },
  {
    icon: Wrench,
    title: 'Equipment',
    description: 'Looking for commercial mixers, proofing racks, refrigeration units and more? See what your neighbors have to offer.',
    color: 'bg-[hsl(35,15%,90%)] text-[hsl(160,25%,24%)]',
  },
];

const guidelines = [
  'Be honest and accurate in your listings — describe condition, quantity, and availability clearly.',
  'Respond to messages promptly. A quick "no longer available" is better than silence.',
  'Honor your commitments. If you agree to share something, follow through.',
  'Respect pricing norms. The Bend is about community support.',
  'Report any issues or concerns to the community admin team.',
];

export default function AboutPage() {
  const navigate = useNavigate();
  const tenant = useTenant();

  return (
    <PageLayout>
      {/* Page Header */}
      <section className="bg-[hsl(160,25%,24%)] py-8">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <div className="flex items-center gap-2 text-white/90 text-sm mb-1">
            <button onClick={() => navigate(-1)} className="hover:text-white transition-colors cursor-pointer" aria-label="Go back">
              <ArrowLeft size={14} />
            </button>
            <span>Home</span>
            <span>/</span>
            <span className="text-white">About</span>
          </div>
          <h1 className="font-serif text-2xl md:text-3xl font-bold text-white">About {tenant.display_name} Community</h1>
          <p className="text-sm text-white/85 mt-1">
            A local resource-sharing platform where businesses find gigs, materials, and equipment with their neighbors
          </p>
        </div>
      </section>

      {/* Our Story */}
      <section className="max-w-3xl mx-auto px-4 md:px-8 py-12">

        <h2 className="font-serif text-2xl font-bold text-gray-900 mb-4">Our Story</h2>
        <div className="space-y-4 text-gray-700 leading-relaxed">
          <p>
            The Bend started with a simple observation: local businesses often have what their neighbors
            need — a spare pair of hands on a busy Saturday, leftover ingredients before they expire,
            or equipment sitting idle between seasons.
          </p>
          <p>
            Instead of letting these resources go to waste, we built a platform where the community
            can come together. Whether you're a bakery with extra flour, a kitchen with a free prep
            cook, or a cafe that needs a commercial mixer for the week — The Bend makes it easy to
            connect.
          </p>
          <p>
            Every listing, every message, and every fulfilled request strengthens the local network
            and keeps resources circulating where they're needed most.
          </p>
        </div>
      </section>

      {/* Values */}
      <section className="py-12" style={{ backgroundColor: 'hsl(35, 15%, 93%)' }}>
        <div className="max-w-5xl mx-auto px-4 md:px-8">
          <h2 className="font-serif text-2xl font-bold text-gray-900 text-center mb-8">What We Stand For</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {values.map(({ icon: Icon, title, description }) => (
              <Card key={title} className="border-0 shadow-md rounded-2xl">
                <CardContent className="p-6 flex gap-4">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: 'hsl(35, 15%, 88%)', color: PRIMARY }}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-1">{title}</h3>
                    <p className="text-sm text-gray-600 leading-relaxed">{description}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="max-w-5xl mx-auto px-4 md:px-8 py-12">
        <h2 className="font-serif text-2xl font-bold text-gray-900 text-center mb-8">What You Can Share</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {categories.map(({ icon: Icon, title, description, color }) => (
            <Card key={title} className="border-gray-100 shadow-md rounded-2xl text-center">
              <CardContent className="p-6 flex flex-col items-center">
                <div
                  className={`w-14 h-14 rounded-2xl flex items-center justify-center ${color} mb-4`}
                >
                  <Icon className="w-6 h-6" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">{title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Community Guidelines */}
      <section className="py-12" style={{ backgroundColor: 'hsl(35, 15%, 93%)' }}>
        <div className="max-w-3xl mx-auto px-4 md:px-8">
          <h2 className="font-serif text-2xl font-bold text-gray-900 text-center mb-2">Community Guidelines</h2>
          <p className="text-sm text-gray-500 text-center mb-8">
            Simple rules to keep The Bend a great place for everyone
          </p>
          <div className="space-y-3">
            {guidelines.map((rule, i) => (
              <div
                key={i}
                className="flex items-start gap-3 p-4 bg-white rounded-xl border border-gray-100 shadow-sm"
              >
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold text-white"
                  style={{ backgroundColor: PRIMARY }}
                >
                  {i + 1}
                </div>
                <p className="text-sm text-gray-700 leading-relaxed">{rule}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-5xl mx-auto px-4 md:px-8 py-12">
        <div className="bg-[hsl(40,20%,98%)] border border-[hsl(35,18%,84%)] rounded-lg p-8 md:p-10 text-center">
          <h2 className="font-serif text-xl md:text-2xl font-bold text-gray-900 mb-2">Join The Bend Community</h2>
          <p className="text-sm text-gray-600 mb-6 max-w-md mx-auto">
            Register your business and start sharing with your neighbors today.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button
              onClick={() => navigate('/register')}
              className="font-semibold px-6 h-10 text-white cursor-pointer"
              style={{ backgroundColor: PRIMARY }}
            >
              Register Your Business
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate('/browse')}
              className="font-semibold px-6 h-10 cursor-pointer"
            >
              Browse Listings
            </Button>
          </div>
        </div>
      </section>
    </PageLayout>
  );
}
