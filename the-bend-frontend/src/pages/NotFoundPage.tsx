import { Link } from 'react-router-dom';
import { MapPin, ArrowLeft, Home } from 'lucide-react';
import { PageLayout } from '@/components/layout/PageLayout';

export default function NotFoundPage() {
  return (
    <PageLayout showFooter={false}>
      <div className="flex-1 flex items-center justify-center px-4 py-20">
        <div className="text-center max-w-md">
          {/* Icon */}
          <div
            className="w-20 h-20 rounded-full mx-auto mb-6 flex items-center justify-center"
            style={{ backgroundColor: 'hsl(35, 15%, 90%)' }}
          >
            <MapPin className="w-10 h-10" style={{ color: 'hsl(35, 45%, 42%)' }} />
          </div>

          {/* Number */}
          <p
            className="font-serif text-7xl font-bold mb-2"
            style={{ color: 'hsl(35, 18%, 84%)' }}
          >
            404
          </p>

          {/* Message */}
          <h1 className="font-serif text-2xl font-bold text-[hsl(30,15%,18%)] mb-2">
            Wrong bend in the road
          </h1>
          <p className="text-sm text-[hsl(30,10%,48%)] mb-8 leading-relaxed">
            The page you're looking for doesn't exist or has been moved. Let's get you back on track.
          </p>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to="/"
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white tracking-wider uppercase cursor-pointer transition-all hover:opacity-90"
              style={{ backgroundColor: 'hsl(160, 25%, 24%)' }}
            >
              <Home size={15} />
              Home
            </Link>
            <button
              onClick={() => window.history.back()}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold tracking-wider uppercase border border-[hsl(35,18%,84%)] text-[hsl(30,15%,30%)] hover:border-[hsl(35,45%,42%)] cursor-pointer transition-all"
            >
              <ArrowLeft size={15} />
              Go Back
            </button>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
