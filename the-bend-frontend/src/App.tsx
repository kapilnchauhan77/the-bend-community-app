import { BrowserRouter, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { TenantProvider } from '@/context/TenantContext';
import { isRootDomain } from '@/lib/constants';
import LandingPage from '@/pages/LandingPage';
import { getRuntimeConfig } from '@/platform/runtimeConfig';
import { NativeRoutes } from '@/routes/NativeRoutes';
import { PublicMemberRoutes } from '@/routes/PublicMemberRoutes';
import { WebAdminRoutes } from '@/routes/WebAdminRoutes';

function ScrollToTop() { const { pathname, hash } = useLocation(); useEffect(() => { if (!hash) window.scrollTo(0, 0); }, [pathname, hash]); return null; }
function WebRoutes() { return <><PublicMemberRoutes /><WebAdminRoutes /></>; }

function App() {
  const runtime = getRuntimeConfig();
  if (runtime.isNative) return <TenantProvider><BrowserRouter><ScrollToTop /><NativeRoutes /></BrowserRouter></TenantProvider>;
  if (isRootDomain()) return <LandingPage />;
  return <TenantProvider><BrowserRouter><ScrollToTop /><WebRoutes /></BrowserRouter></TenantProvider>;
}

export default App;
