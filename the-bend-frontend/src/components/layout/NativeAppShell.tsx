/* eslint-disable react-refresh/only-export-components */
import { Outlet, useLocation } from 'react-router-dom';
import { NativeBottomNav } from './NativeBottomNav';
import { useDeepLinks } from '@/deep-links/useDeepLinks';
import { createContext, useContext, useEffect, useRef } from 'react';
import '@/styles/native.css';
import type { NativeAppShellContextValue, NativeRootTab } from '@/platform/contracts';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { NativePresentationProvider } from './NativePresentationContext';
import { showsNativeBottomNavigation } from '@/routes/nativeRoutePolicy';
const ShellContext = createContext<NativeAppShellContextValue | null>(null)
export function useNativeAppShell() { const value = useContext(ShellContext); if (!value) throw new Error('useNativeAppShell must be used inside NativeAppShell'); return value }

export function NativeAppShell() {
  useDeepLinks();
  const { pathname } = useLocation();
  const showBottomNavigation = showsNativeBottomNavigation(pathname);
  const rootRef = useRef<HTMLDivElement>(null);
  const roots = useRef(new Map<NativeRootTab, HTMLElement>());
  const shell = {
    registerRootScroll: (tab: NativeRootTab, element: HTMLElement | null) => { if (element) roots.current.set(tab, element); else roots.current.delete(tab) },
    scrollRootToTop: (tab: NativeRootTab) => {
      const registered = roots.current.get(tab);
      const registeredOverflow = registered ? window.getComputedStyle(registered).overflowY : '';
      const registeredScrolls = Boolean(registered && registered.scrollHeight > registered.clientHeight && /(auto|scroll|overlay)/.test(registeredOverflow));
      const target = registeredScrolls ? registered : document.scrollingElement;
      const options: ScrollToOptions = { top: 0, behavior: typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' };
      if (target && typeof target.scrollTo === 'function') target.scrollTo(options);
      else window.scrollTo(options);
    },
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
    const root = rootRef.current;
    if (!root) return;
    const updateFixedTextScale = () => {
      const rootSize = Number.parseFloat(window.getComputedStyle(document.documentElement).fontSize);
      const scale = Number.isFinite(rootSize) && rootSize > 0 ? Math.min(1, 16 / rootSize) : 1;
      root.style.setProperty('--native-fixed-text-scale', String(scale));
    };
    window.addEventListener('resize', updateFixedTextScale);
    updateFixedTextScale();
    return () => {
      window.removeEventListener('resize', updateFixedTextScale);
      root.style.removeProperty('--native-fixed-text-scale');
    };
  }, []);
  useEffect(() => {
    const hadDarkClass = document.documentElement.classList.contains('dark');
    const nativeChrome = Capacitor.getPlatform() === 'ios' || Capacitor.getPlatform() === 'android';
    const previousHtmlBackground = document.documentElement.style.backgroundColor;
    const previousBodyBackground = document.body.style.backgroundColor;
    const apply = (dark: boolean) => {
      document.documentElement.classList.toggle('dark', dark);
      if (!nativeChrome) return;
      const surface = dark ? '#121915' : '#f7f3ea';
      document.documentElement.style.backgroundColor = surface;
      document.body.style.backgroundColor = surface;
      void StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => undefined);
      void StatusBar.setBackgroundColor({ color: surface }).catch(() => undefined);
    };
    const stored = typeof window.localStorage?.getItem === 'function' ? window.localStorage.getItem('theme') : null;
    let media: MediaQueryList | undefined;
    let update: (() => void) | undefined;
    if (stored === 'dark' || stored === 'light') apply(stored === 'dark');
    else if (typeof window.matchMedia === 'function') {
      media = window.matchMedia('(prefers-color-scheme: dark)');
      update = () => apply(media!.matches);
      update(); media.addEventListener?.('change', update);
    }
    const themeObserver = typeof MutationObserver === 'function' ? new MutationObserver(() => apply(document.documentElement.classList.contains('dark'))) : undefined;
    themeObserver?.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => {
      themeObserver?.disconnect();
      if (media && update) media.removeEventListener?.('change', update);
      apply(hadDarkClass);
      document.documentElement.style.backgroundColor = previousHtmlBackground;
      document.body.style.backgroundColor = previousBodyBackground;
    };
  }, []);
  return <ShellContext.Provider value={shell}><NativePresentationProvider><div ref={rootRef} className="native-app"><div className="native-status-bar-scrim" aria-hidden="true" /><main id="native-main" className="native-main" data-bottom-navigation={showBottomNavigation ? 'visible' : 'hidden'}><Outlet /></main>{showBottomNavigation && <NativeBottomNav />}</div></NativePresentationProvider></ShellContext.Provider>;
}
