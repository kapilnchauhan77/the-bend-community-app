import { Routes, Route } from 'react-router-dom';
import NativeHomePage from '@/pages/native/NativeHomePage';
import NativeExplorePage from '@/pages/native/NativeExplorePage';
import BrowsePage from '@/pages/BrowsePage';
import ListingDetailPage from '@/pages/ListingDetailPage';
import BusinessProfilePage from '@/pages/BusinessProfilePage';
import EventsPage from '@/pages/EventsPage';
import BenderPage from '@/pages/BenderPage';
import VolunteerPage from '@/pages/VolunteerPage';
import TalentPage from '@/pages/TalentPage';
import MessagesPage from '@/pages/MessagesPage';
import NotificationsPage from '@/pages/NotificationsPage';
import SettingsPage from '@/pages/SettingsPage';
import CreateListingPage from '@/pages/CreateListingPage';
import ProfileHubPage from '@/pages/ProfileHubPage';
import LoginPage from '@/pages/LoginPage';
import RegisterPage from '@/pages/RegisterPage';
import GuidelinesViewPage from '@/pages/GuidelinesViewPage';
import ForgotPasswordPage from '@/pages/ForgotPasswordPage';
import ResetPasswordPage from '@/pages/ResetPasswordPage';
import { ProtectedRoute } from '@/components/shared/ProtectedRoute';
import { NativeAppShell } from '@/components/layout/NativeAppShell';

function NativeUnavailablePage() { return <section role="status" className="mx-auto max-w-lg px-5 py-16 text-center"><h1 className="text-2xl font-semibold">This page isn't available in the mobile app</h1><p className="mt-2 text-gray-600">Admin tools are available on the website.</p></section>; }

export function NativeRoutes() {
  return <Routes><Route element={<NativeAppShell />}>
    <Route path="/" element={<NativeHomePage />} /><Route path="/explore" element={<NativeExplorePage />} /><Route path="/browse" element={<BrowsePage />} /><Route path="/listing/:id" element={<ListingDetailPage />} /><Route path="/business/:shopId" element={<BusinessProfilePage />} /><Route path="/events" element={<EventsPage />} /><Route path="/events/:eventId" element={<EventsPage />} /><Route path="/bender" element={<BenderPage nativeEmbedded />} /><Route path="/bender/:postId" element={<BenderPage nativeEmbedded />} /><Route path="/volunteers" element={<VolunteerPage />} /><Route path="/talent" element={<TalentPage />} />
    <Route path="/login" element={<LoginPage />} /><Route path="/register" element={<RegisterPage />} /><Route path="/guidelines" element={<GuidelinesViewPage embeddedNative />} /><Route path="/forgot-password" element={<ForgotPasswordPage />} /><Route path="/reset-password" element={<ResetPasswordPage />} />
    <Route path="/messages" element={<ProtectedRoute><MessagesPage /></ProtectedRoute>} /><Route path="/messages/:threadId" element={<ProtectedRoute><MessagesPage /></ProtectedRoute>} /><Route path="/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} /><Route path="/you" element={<ProtectedRoute><ProfileHubPage /></ProtectedRoute>} /><Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} /><Route path="/create" element={<ProtectedRoute><CreateListingPage /></ProtectedRoute>} />
    <Route path="*" element={<NativeUnavailablePage />} />
  </Route></Routes>;
}
