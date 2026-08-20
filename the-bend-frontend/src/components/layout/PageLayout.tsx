import { Navbar } from './Navbar';
import { BottomNav } from './BottomNav';
import { Footer } from './Footer';
import { InstallBanner } from '../shared/InstallBanner';
import { SponsorBanner } from '../shared/SponsorBanner';

interface PageLayoutProps {
  children: React.ReactNode;
  showFooter?: boolean;
  embeddedNative?: boolean;
  embeddedClassName?: string;
}

export function PageLayout({ children, showFooter = true, embeddedNative = false, embeddedClassName }: PageLayoutProps) {
  if (embeddedNative) {
    return (
      <div className={['native-embedded-page', embeddedClassName].filter(Boolean).join(' ')}>
        {children}
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Navbar />
      <main className="flex-1 pb-20 md:pb-0">{children}</main>
      <SponsorBanner placement="footer" variant="strip" />
      {showFooter && <Footer />}
      <BottomNav />
      <InstallBanner />
    </div>
  );
}
