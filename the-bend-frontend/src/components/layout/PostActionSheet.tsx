import { X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useEffect, useRef, type RefObject } from 'react';
import { setPendingIntent, type NativeCreateAction } from '@/auth/pendingDestination';
import { usePlatformServices } from '@/platform/createPlatformServices';

const postActions = [
  { action: 'offer-listing', label: 'Offer something', path: '/create?type=offer' },
  { action: 'request-listing', label: 'Request something', path: '/create?type=request' },
  { action: 'bender-post', label: 'Share on Bender', path: '/bender' },
] as const;

interface PostActionSheetProps { open: boolean; onClose: () => void; returnFocusRef?: RefObject<HTMLButtonElement | null>; }

export function PostActionSheet({ open, onClose, returnFocusRef }: PostActionSheetProps) {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const { haptics } = usePlatformServices();
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);
  useEffect(() => {
    if (!open) return;
    const trigger = returnFocusRef?.current;
    return () => { requestAnimationFrame(() => trigger?.focus()); };
  }, [open, returnFocusRef]);
  if (!open) return null;

  const continueTo = (path: string, action: NativeCreateAction) => {
    onClose();
    void haptics.selection();
    if (isAuthenticated) {
      navigate(path);
      return;
    }
    setPendingIntent({ destination: path, action });
    navigate('/login', { state: { from: { pathname: path } } });
  };

  const trapFocus = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return;
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled])') ?? []);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };

  return (
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="post-action-title" onKeyDown={trapFocus} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }} className="fixed inset-0 z-[60] flex items-end bg-black/40">
      <div onClick={(event) => event.stopPropagation()} className="w-full rounded-t-2xl bg-white p-5 pb-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="post-action-title" className="text-lg font-semibold">What do you want to create?</h2>
          <button ref={closeRef} type="button" aria-label="Close" onClick={onClose} className="rounded p-2"><X size={20} /></button>
        </div>
        <div className="grid gap-2">
          {postActions.map(({ action, label, path }) => <button key={path} type="button" onClick={() => continueTo(path, action)} className="rounded border p-3 text-left font-medium">{label}</button>)}
        </div>
      </div>
    </div>
  );
}
