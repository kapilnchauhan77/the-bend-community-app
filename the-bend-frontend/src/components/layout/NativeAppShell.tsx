import { Outlet } from 'react-router-dom';
import { NativeBottomNav } from './NativeBottomNav';

export function NativeAppShell() {
  return <div className="min-h-screen bg-white pb-20"><main><Outlet /></main><NativeBottomNav /></div>;
}
