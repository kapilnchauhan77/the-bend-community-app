/* eslint-disable react-refresh/only-export-components */
import { Outlet } from 'react-router-dom';
import { NativeBottomNav } from './NativeBottomNav';
import { useDeepLinks } from '@/deep-links/useDeepLinks';
import { createContext, useContext, useEffect, useRef } from 'react';
import '@/styles/native.css';
import type { NativeAppShellContextValue, NativeRootTab } from '@/platform/contracts';
const ShellContext = createContext<NativeAppShellContextValue | null>(null)
export function useNativeAppShell() { const value = useContext(ShellContext); if (!value) throw new Error('useNativeAppShell must be used inside NativeAppShell'); return value }

export function NativeAppShell() {
  useDeepLinks();
  const rootRef = useRef<HTMLDivElement>(null);
  const roots = useRef(new Map<NativeRootTab, HTMLElement>());
  const shell = {
    registerRootScroll: (tab: NativeRootTab, element: HTMLElement | null) => { if (element) roots.current.set(tab, element); else roots.current.delete(tab) },
    scrollRootToTop: (tab: NativeRootTab) => { const element = roots.current.get(tab); if (!element) return; const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches; element.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' }) },
  };
  useEffect(() => {
    const root = rootRef.current;
    const viewport = window.visualViewport;
    const updateKeyboardInset = () => {
      if (!root || !viewport) return;
      root.style.setProperty('--native-keyboard-bottom', `${Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)}px`);
    };
    viewport?.addEventListener('resize', updateKeyboardInset);
    updateKeyboardInset();
    return () => {
      viewport?.removeEventListener('resize', updateKeyboardInset);
      root?.style.removeProperty('--native-keyboard-bottom');
    };
  }, []);
  useEffect(() => {
    const hadDarkClass = document.documentElement.classList.contains('dark');
    const apply = (dark: boolean) => document.documentElement.classList.toggle('dark', dark);
    const stored = typeof window.localStorage?.getItem === 'function' ? window.localStorage.getItem('theme') : null;
    let media: MediaQueryList | undefined;
    let update: (() => void) | undefined;
    if (stored === 'dark' || stored === 'light') apply(stored === 'dark');
    else if (typeof window.matchMedia === 'function') {
      media = window.matchMedia('(prefers-color-scheme: dark)');
      update = () => apply(media!.matches);
      update(); media.addEventListener?.('change', update);
    }
    return () => {
      if (media && update) media.removeEventListener?.('change', update);
      apply(hadDarkClass);
    };
  }, []);
  return <ShellContext.Provider value={shell}><div ref={rootRef} className="native-app"><main id="native-main" className="native-main"><Outlet /></main><NativeBottomNav /></div></ShellContext.Provider>;
}
