import { BrowserRouter, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { TenantProvider } from '@/context/TenantContext';
import { isRootDomain } from '@/lib/constants';
import LandingPage from '@/pages/LandingPage';
import { getRuntimeConfig } from '@/platform/runtimeConfig';
import { NativeRoutes } from '@/routes/NativeRoutes';
import { WebRoutes } from '@/routes/WebRoutes';
import { useAuthStore } from '@/stores/authStore';
import { usePushNotifications } from '@/hooks/usePushNotifications';

function PushLifecycle() { usePushNotifications(); return null }

function ScrollToTop() { const { pathname, hash } = useLocation(); useEffect(() => { if (!hash) window.scrollTo(0, 0); }, [pathname, hash]); return null; }
function App() {
  const runtime = getRuntimeConfig();
  const initialize = useAuthStore((state) => state.initialize);
  useEffect(() => { void initialize(); }, [initialize]);
  if (runtime.isNative) return <TenantProvider><BrowserRouter><PushLifecycle /><ScrollToTop /><NativeRoutes /></BrowserRouter></TenantProvider>;
  if (isRootDomain()) return <BrowserRouter><PushLifecycle /><LandingPage /></BrowserRouter>;
  return <TenantProvider><BrowserRouter><PushLifecycle /><ScrollToTop /><WebRoutes /></BrowserRouter></TenantProvider>;
}

export default App;
