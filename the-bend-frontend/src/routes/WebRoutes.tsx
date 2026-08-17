import { useLocation } from 'react-router-dom';
import { PublicMemberRoutes } from './PublicMemberRoutes';
import { WebAdminRoutes } from './WebAdminRoutes';

export function WebRoutes() {
  const { pathname } = useLocation();
  const isAdminPath = pathname === '/admin' || pathname.startsWith('/admin/') || pathname === '/super-admin' || pathname.startsWith('/super-admin/');
  return isAdminPath ? <WebAdminRoutes /> : <PublicMemberRoutes />;
}
