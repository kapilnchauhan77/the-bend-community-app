import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { TenantProvider } from '@/context/TenantContext';
import { isRootDomain } from '@/lib/constants';
import LandingPage from '@/pages/LandingPage';

function ScrollToTop() {
  const { pathname, hash } = useLocation();
  useEffect(() => { if (!hash) window.scrollTo(0, 0); }, [pathname, hash]);
  return null;
}
import HomePage from '@/pages/HomePage';
import AboutPage from '@/pages/AboutPage';
import VolunteerPage from '@/pages/VolunteerPage';
import TalentPage from '@/pages/TalentPage';
import EventsPage from '@/pages/EventsPage';
import BrowsePage from '@/pages/BrowsePage';
import ListingDetailPage from '@/pages/ListingDetailPage';
import CreateListingPage from '@/pages/CreateListingPage';
import LoginPage from '@/pages/LoginPage';
import RegisterPage from '@/pages/RegisterPage';
import ForgotPasswordPage from '@/pages/ForgotPasswordPage';
import ResetPasswordPage from '@/pages/ResetPasswordPage';
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
import EventsAdminPage from '@/pages/admin/EventsAdminPage';
import ConnectorsPage from '@/pages/admin/ConnectorsPage';
import SponsorsPage from '@/pages/admin/SponsorsPage';
import PricingPage from '@/pages/admin/PricingPage';
import PlatformSettingsPage from '@/pages/admin/PlatformSettingsPage';
import ReportedPostsPage from '@/pages/admin/ReportedPostsPage';
import BusinessProfilePage from '@/pages/BusinessProfilePage';
import DirectoryPage from '@/pages/DirectoryPage';
import AdvertisePage from '@/pages/AdvertisePage';
import GuidelinesViewPage from '@/pages/GuidelinesViewPage';
import NotFoundPage from '@/pages/NotFoundPage';
import TenantsListPage from '@/pages/super-admin/TenantsListPage';
import TenantDetailPage from '@/pages/super-admin/TenantDetailPage';
import SavedListingsPage from '@/pages/SavedListingsPage';
import { ProtectedRoute } from '@/components/shared/ProtectedRoute';
import { RoleGuard } from '@/components/shared/RoleGuard';

function App() {
  // If we're at the root domain (bend.community), show the sales/landing page instead of the tenant app
  if (isRootDomain()) {
    return <LandingPage />;
  }

  return (
    <TenantProvider>
    <BrowserRouter>
      <ScrollToTop />
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<HomePage />} />
        <Route path="/browse" element={<BrowsePage />} />
        <Route path="/listing/:id" element={<ListingDetailPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/volunteers" element={<VolunteerPage />} />
        <Route path="/talent" element={<TalentPage />} />
        <Route path="/events" element={<EventsPage />} />
        <Route path="/advertise" element={<AdvertisePage />} />
        <Route path="/advertise/success" element={<AdvertisePage />} />
        <Route path="/guidelines" element={<GuidelinesViewPage />} />
        <Route path="/business/:shopId" element={<BusinessProfilePage />} />
        <Route path="/directory" element={<DirectoryPage />} />

        {/* Protected routes */}
        <Route path="/create" element={<ProtectedRoute><CreateListingPage /></ProtectedRoute>} />
        <Route path="/listing/:id/edit" element={<ProtectedRoute><CreateListingPage /></ProtectedRoute>} />
        <Route path="/my-shop" element={<ProtectedRoute><MyShopPage /></ProtectedRoute>} />
        <Route path="/messages" element={<ProtectedRoute><MessagesPage /></ProtectedRoute>} />
        <Route path="/messages/:threadId" element={<ProtectedRoute><MessagesPage /></ProtectedRoute>} />
        <Route path="/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
        <Route path="/saved" element={<ProtectedRoute><SavedListingsPage /></ProtectedRoute>} />

        {/* Admin routes */}
        <Route path="/admin" element={<ProtectedRoute><RoleGuard allowedRoles={['community_admin', 'super_admin']}><DashboardPage /></RoleGuard></ProtectedRoute>} />
        <Route path="/admin/registrations" element={<ProtectedRoute><RoleGuard allowedRoles={['community_admin', 'super_admin']}><RegistrationsPage /></RoleGuard></ProtectedRoute>} />
        <Route path="/admin/shops" element={<ProtectedRoute><RoleGuard allowedRoles={['community_admin', 'super_admin']}><ShopsPage /></RoleGuard></ProtectedRoute>} />
        <Route path="/admin/listings" element={<ProtectedRoute><RoleGuard allowedRoles={['community_admin', 'super_admin']}><ListingsPage /></RoleGuard></ProtectedRoute>} />
        <Route path="/admin/guidelines" element={<ProtectedRoute><RoleGuard allowedRoles={['community_admin', 'super_admin']}><GuidelinesPage /></RoleGuard></ProtectedRoute>} />
        <Route path="/admin/reports" element={<ProtectedRoute><RoleGuard allowedRoles={['community_admin', 'super_admin']}><ReportsPage /></RoleGuard></ProtectedRoute>} />
        <Route path="/admin/events" element={<ProtectedRoute><RoleGuard allowedRoles={['community_admin', 'super_admin']}><EventsAdminPage /></RoleGuard></ProtectedRoute>} />
        <Route path="/admin/connectors" element={<ProtectedRoute><RoleGuard allowedRoles={['community_admin', 'super_admin']}><ConnectorsPage /></RoleGuard></ProtectedRoute>} />
        <Route path="/admin/sponsors" element={<ProtectedRoute><RoleGuard allowedRoles={['community_admin', 'super_admin']}><SponsorsPage /></RoleGuard></ProtectedRoute>} />
        <Route path="/admin/pricing" element={<ProtectedRoute><RoleGuard allowedRoles={['community_admin', 'super_admin']}><PricingPage /></RoleGuard></ProtectedRoute>} />
        <Route path="/admin/settings" element={<ProtectedRoute><RoleGuard allowedRoles={['community_admin', 'super_admin']}><PlatformSettingsPage /></RoleGuard></ProtectedRoute>} />
        <Route path="/admin/flagged" element={<ProtectedRoute><RoleGuard allowedRoles={['community_admin', 'super_admin']}><ReportedPostsPage /></RoleGuard></ProtectedRoute>} />

        {/* Super Admin routes */}
        <Route path="/super-admin" element={<ProtectedRoute><RoleGuard allowedRoles={['super_admin']}><TenantsListPage /></RoleGuard></ProtectedRoute>} />
        <Route path="/super-admin/tenants" element={<ProtectedRoute><RoleGuard allowedRoles={['super_admin']}><TenantsListPage /></RoleGuard></ProtectedRoute>} />
        <Route path="/super-admin/tenants/:tenantId" element={<ProtectedRoute><RoleGuard allowedRoles={['super_admin']}><TenantDetailPage /></RoleGuard></ProtectedRoute>} />

        {/* 404 */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
    </TenantProvider>
  );
}

export default App;
