import { Route, Routes } from 'react-router-dom';
import { PublicMemberRoutes } from './PublicMemberRoutes';
import { WebAdminRoutes } from './WebAdminRoutes';

export function WebRoutes() {
  return <Routes>
    <Route path="/admin/*" element={<WebAdminRoutes />} />
    <Route path="/super-admin/*" element={<WebAdminRoutes />} />
    <Route path="*" element={<PublicMemberRoutes />} />
  </Routes>;
}
