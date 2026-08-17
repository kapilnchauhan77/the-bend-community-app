import { Outlet } from 'react-router-dom';
import { NativeBottomNav } from './NativeBottomNav';
import { useDeepLinks } from '@/deep-links/useDeepLinks';

export function NativeAppShell() {
  useDeepLinks();
  return <div className="min-h-screen bg-white pb-20"><main><Outlet /></main><NativeBottomNav /></div>;
}
