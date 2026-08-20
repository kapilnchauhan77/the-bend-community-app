import { Home, Compass, Plus, Sparkles, User } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PostActionSheet } from './PostActionSheet';
import { useNativeAppShell } from './NativeAppShell';
import { usePlatformServices } from '@/platform/createPlatformServices';
import { useRef, useState } from 'react';

const actions = [
  { label: 'Home', path: '/', icon: Home },
  { label: 'Explore', path: '/explore', icon: Compass },
  { label: 'Bender', path: '/bender', icon: Sparkles },
  { label: 'You', path: '/you', icon: User },
] as const;

export function NativeBottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const [postOpen, setPostOpen] = useState(false);
  const postTriggerRef = useRef<HTMLButtonElement>(null);
  const { scrollRootToTop } = useNativeAppShell();
  const { haptics } = usePlatformServices();
  const select = (label: string, path: string) => {
    if ((label === 'Home' || label === 'Explore') && location.pathname === path) { scrollRootToTop(label.toLowerCase() as 'home' | 'explore'); return }
    navigate(path)
  };

  return (
    <>
      <nav aria-label="Native app navigation" className="native-bottom-nav native-safe-bottom fixed inset-x-0 bottom-0 z-50 border-t bg-white pb-[env(safe-area-inset-bottom)] shadow-lg">
        <div className="native-bottom-nav-inner mx-auto flex h-16 max-w-lg items-center justify-around">
          {actions.slice(0, 2).map(({ label, path, icon: Icon }) => (
            <button key={label} type="button" aria-label={label} aria-current={location.pathname === path ? 'page' : undefined} onClick={() => select(label, path)} className="native-bottom-nav-item flex min-w-14 flex-col items-center gap-1 p-2 text-xs">
              <Icon size={20} aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
          <button ref={postTriggerRef} type="button" aria-label="Create" onClick={() => { void haptics.impact(); setPostOpen(true) }} className="native-bottom-nav-item flex min-w-14 flex-col items-center gap-1 p-2 text-xs">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[hsl(160,25%,24%)] text-white"><Plus size={20} aria-hidden="true" /></span>
            <span>Create</span>
          </button>
          {actions.slice(2).map(({ label, path, icon: Icon }) => (
            <button key={label} type="button" aria-label={label} aria-current={location.pathname.startsWith(path) ? 'page' : undefined} onClick={() => select(label, path)} className="native-bottom-nav-item flex min-w-14 flex-col items-center gap-1 p-2 text-xs">
              <Icon size={20} aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </nav>
      <PostActionSheet open={postOpen} onClose={() => setPostOpen(false)} returnFocusRef={postTriggerRef} />
    </>
  );
}
