import { useEffect } from 'react';
import type { Theme } from '../domain/types';

export const THEME_MIRROR_KEY = 'spare-change-theme';

/** The theme is mirrored synchronously so it paints before IndexedDB hydration and survives an interrupted write. */
export function readThemeMirror(): Theme | null {
  try {
    const v = window.localStorage.getItem(THEME_MIRROR_KEY);
    return v === 'system' || v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

export function writeThemeMirror(theme: Theme): void {
  try {
    window.localStorage.setItem(THEME_MIRROR_KEY, theme);
  } catch {
    /* storage blocked; the persisted store still holds the theme */
  }
}

export function clearThemeMirror(): void {
  try {
    window.localStorage.removeItem(THEME_MIRROR_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Plan v2 6.13. In a standalone launch the status bar sits over the app's own background, so
 * its text colour is the app's problem. `default` is dark text, correct over the light
 * ground; `black-translucent` is light text with the app's dark ground showing through.
 *
 * A missing meta tag is not an error: this runs in jsdom and in a plain tab too, where it has
 * no effect either way.
 */
export function applyStatusBarStyle(dark: boolean): void {
  const meta = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
  if (meta) meta.setAttribute('content', dark ? 'black-translucent' : 'default');
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  const systemDark = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const dark = theme === 'dark' || (theme === 'system' && systemDark);
  root.classList.toggle('dark', dark);
  root.setAttribute('data-theme', theme);
  applyStatusBarStyle(dark);
}

/** Plan 8 step 9: system listens to prefers-color-scheme. */
export function useTheme(theme: Theme): void {
  useEffect(() => {
    applyTheme(theme);
    if (theme !== 'system' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = () => applyTheme('system');
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [theme]);
}
