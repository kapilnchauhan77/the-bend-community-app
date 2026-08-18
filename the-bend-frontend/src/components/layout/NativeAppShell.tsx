import { Outlet } from 'react-router-dom';
import { NativeBottomNav } from './NativeBottomNav';
import { useDeepLinks } from '@/deep-links/useDeepLinks';
import { useEffect, useRef } from 'react';
import '@/styles/native.css';

export function NativeAppShell() {
  useDeepLinks();
  const rootRef = useRef<HTMLDivElement>(null);
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
    if (typeof window.localStorage?.getItem === 'function' && window.localStorage.getItem('theme')) return;
    if (typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => document.documentElement.classList.toggle('dark', media.matches);
    update(); media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);
  return <div ref={rootRef} className="native-app"><main id="native-main" className="native-main"><Outlet /></main><NativeBottomNav /></div>;
}
