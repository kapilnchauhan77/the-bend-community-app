import { BrowserRouter, Routes, Route } from 'react-router-dom';
import HomePage from '@/pages/HomePage';
import BrowsePage from '@/pages/BrowsePage';
import ListingDetailPage from '@/pages/ListingDetailPage';
import CreateListingPage from '@/pages/CreateListingPage';
import LoginPage from '@/pages/LoginPage';
import RegisterPage from '@/pages/RegisterPage';
import MyShopPage from '@/pages/MyShopPage';
import MessagesPage from '@/pages/MessagesPage';
import NotificationsPage from '@/pages/NotificationsPage';
import SettingsPage from '@/pages/SettingsPage';
import DashboardPage from '@/pages/admin/DashboardPage';
import RegistrationsPage from '@/pages/admin/RegistrationsPage';
import ShopsPage from '@/pages/admin/ShopsPage';
import ListingsPage from '@/pages/admin/ListingsPage';
import GuidelinesPage from '@/pages/admin/GuidelinesPage';
import ReportsPage from '@/pages/admin/ReportsPage';
import { ProtectedRoute } from '@/components/shared/ProtectedRoute';
import { RoleGuard } from '@/components/shared/RoleGuard';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<HomePage />} />
        <Route path="/browse" element={<BrowsePage />} />
        <Route path="/listing/:id" element={<ListingDetailPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/about" element={<HomePage />} />

        {/* Protected routes */}
        <Route path="/create" element={<ProtectedRoute><CreateListingPage /></ProtectedRoute>} />
        <Route path="/my-shop" element={<ProtectedRoute><MyShopPage /></ProtectedRoute>} />
        <Route path="/messages" element={<ProtectedRoute><MessagesPage /></ProtectedRoute>} />
        <Route path="/messages/:threadId" element={<ProtectedRoute><MessagesPage /></ProtectedRoute>} />
        <Route path="/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />

        {/* Admin routes */}
        <Route path="/admin" element={<ProtectedRoute><RoleGuard allowedRoles={['community_admin']}><DashboardPage /></RoleGuard></ProtectedRoute>} />
        <Route path="/admin/registrations" element={<ProtectedRoute><RoleGuard allowedRoles={['community_admin']}><RegistrationsPage /></RoleGuard></ProtectedRoute>} />
        <Route path="/admin/shops" element={<ProtectedRoute><RoleGuard allowedRoles={['community_admin']}><ShopsPage /></RoleGuard></ProtectedRoute>} />
        <Route path="/admin/listings" element={<ProtectedRoute><RoleGuard allowedRoles={['community_admin']}><ListingsPage /></RoleGuard></ProtectedRoute>} />
        <Route path="/admin/guidelines" element={<ProtectedRoute><RoleGuard allowedRoles={['community_admin']}><GuidelinesPage /></RoleGuard></ProtectedRoute>} />
        <Route path="/admin/reports" element={<ProtectedRoute><RoleGuard allowedRoles={['community_admin']}><ReportsPage /></RoleGuard></ProtectedRoute>} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
