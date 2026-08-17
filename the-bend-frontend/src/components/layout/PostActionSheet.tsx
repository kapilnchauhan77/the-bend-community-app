import { X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useEffect, useRef, type RefObject } from 'react';

const postActions = [
  { label: 'Offer listing', path: '/create?type=offer' },
  { label: 'Request listing', path: '/create?type=request' },
  { label: 'Bender post', path: '/bender' },
] as const;

interface PostActionSheetProps { open: boolean; onClose: () => void; returnFocusRef?: RefObject<HTMLButtonElement | null>; }

export function PostActionSheet({ open, onClose, returnFocusRef }: PostActionSheetProps) {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const closeRef = useRef<HTMLButtonElement>(null);
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

  const continueTo = (path: string) => {
    onClose();
    if (isAuthenticated) {
      navigate(path);
      return;
    }
    navigate('/login', { state: { from: { pathname: path } } });
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="post-action-title" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }} className="fixed inset-0 z-[60] flex items-end bg-black/40">
      <div onClick={(event) => event.stopPropagation()} className="w-full rounded-t-2xl bg-white p-5 pb-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="post-action-title" className="text-lg font-semibold">What do you want to post?</h2>
          <button ref={closeRef} type="button" aria-label="Close" onClick={onClose} className="rounded p-2"><X size={20} /></button>
        </div>
        <div className="grid gap-2">
          {postActions.map(({ label, path }) => <button key={path} type="button" onClick={() => continueTo(path)} className="rounded border p-3 text-left font-medium">{label}</button>)}
        </div>
      </div>
    </div>
  );
}
