import { useLocation } from 'react-router-dom';
import { PublicMemberRoutes } from './PublicMemberRoutes';
import { WebAdminRoutes } from './WebAdminRoutes';

export function WebRoutes() {
  const { pathname } = useLocation();
  return pathname.startsWith('/admin') || pathname.startsWith('/super-admin') ? <WebAdminRoutes /> : <PublicMemberRoutes />;
}
