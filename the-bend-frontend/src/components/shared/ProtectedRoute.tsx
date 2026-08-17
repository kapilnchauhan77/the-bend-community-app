import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { setPendingDestination } from '@/auth/pendingDestination';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useAuthStore();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    // Persist only the route path. Foundation deep links intentionally reject query strings.
    const destination = location.pathname;
    setPendingDestination(destination);
    return <Navigate to="/login" state={{ from: { pathname: location.pathname, search: location.search, hash: location.hash } }} replace />;
  }

  return <>{children}</>;
}
