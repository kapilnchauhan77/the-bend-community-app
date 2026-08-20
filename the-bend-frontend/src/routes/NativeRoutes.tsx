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
import { NativeRouteFrame } from '@/components/layout/NativeRouteFrame';
import { useAuthStore } from '@/stores/authStore';
import { useNavigate } from 'react-router-dom';
import { Send } from 'lucide-react';

function NativeUnavailablePage() { return <section role="status" className="native-unavailable-page"><h1>Page unavailable</h1><p>This page isn't available in the mobile app.</p></section>; }

function BenderMessagesAction() {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  if (!isAuthenticated) return null;
  return <button type="button" aria-label="Messages" className="native-route-action" onClick={() => navigate('/messages')}><Send size={19} aria-hidden="true" /></button>;
}

const focused = (title: string, fallbackPath: string, children: React.ReactNode, actions?: React.ReactNode) => <NativeRouteFrame title={title} fallbackPath={fallbackPath} actions={actions}>{children}</NativeRouteFrame>;

export function NativeRoutes() {
  return <Routes><Route element={<NativeAppShell />}>
    <Route path="/" element={<NativeHomePage />} /><Route path="/explore" element={<NativeExplorePage />} /><Route path="/bender" element={<BenderPage nativeEmbedded />} /><Route path="/bender/:postId" element={focused('Bender post', '/bender', <BenderPage nativeEmbedded />, <BenderMessagesAction />)} />
    <Route path="/browse" element={focused('Browse', '/explore', <BrowsePage />)} /><Route path="/listing/:id" element={focused('Listing', '/explore?type=listings', <ListingDetailPage />)} /><Route path="/business/:shopId" element={focused('Business', '/explore?type=businesses', <BusinessProfilePage />)} /><Route path="/events" element={focused('Events', '/explore?type=events', <EventsPage />)} /><Route path="/events/:eventId" element={focused('Event', '/events', <NativeUnavailablePage />)} /><Route path="/volunteers" element={focused('Volunteer', '/explore?type=volunteer', <VolunteerPage />)} /><Route path="/talent" element={focused('Talent', '/explore', <TalentPage />)} />
    <Route path="/login" element={<LoginPage />} /><Route path="/register" element={<RegisterPage />} /><Route path="/guidelines" element={<GuidelinesViewPage embeddedNative />} /><Route path="/forgot-password" element={<ForgotPasswordPage />} /><Route path="/reset-password" element={<ResetPasswordPage />} />
    <Route path="/messages" element={<ProtectedRoute>{focused('Messages', '/bender', <MessagesPage />)}</ProtectedRoute>} /><Route path="/messages/:threadId" element={<ProtectedRoute>{focused('Conversation', '/messages', <MessagesPage />)}</ProtectedRoute>} /><Route path="/notifications" element={<ProtectedRoute>{focused('Notifications', '/', <NotificationsPage />)}</ProtectedRoute>} /><Route path="/you" element={<ProtectedRoute><ProfileHubPage /></ProtectedRoute>} /><Route path="/settings" element={<ProtectedRoute>{focused('Settings', '/you', <SettingsPage />)}</ProtectedRoute>} /><Route path="/create" element={<ProtectedRoute>{focused('Create listing', '/', <CreateListingPage />)}</ProtectedRoute>} />
    <Route path="*" element={focused('Page unavailable', '/', <NativeUnavailablePage />)} />
  </Route></Routes>;
}
