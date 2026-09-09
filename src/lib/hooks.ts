import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, type LinkProps, type NavigateOptions } from 'react-router-dom';
import { createElement } from 'react';

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : false,
  );
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

/** Navigation that keeps the query string (demo params) across screens. */
export function useAppNavigate() {
  const navigate = useNavigate();
  const { search } = useLocation();
  return useCallback((to: string, opts?: NavigateOptions) => navigate({ pathname: to, search }, opts), [navigate, search]);
}

export function AppLink(props: Omit<LinkProps, 'to'> & { to: string }) {
  const { search } = useLocation();
  const { to, ...rest } = props;
  return createElement(Link, { ...rest, to: { pathname: to, search } });
}

export function AppRedirect({ to }: { to: string }) {
  const { search } = useLocation();
  return createElement(Navigate, { to: { pathname: to, search }, replace: true });
}

/** Long-press helper (plan 6: 600 ms on the logo opens the demo tray). */
export function useLongPress(onLongPress: () => void, ms = 600) {
  const timer = useRef<number | null>(null);
  const clear = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);
  const start = useCallback(() => {
    clear();
    timer.current = window.setTimeout(() => {
      timer.current = null;
      onLongPress();
    }, ms);
  }, [clear, ms, onLongPress]);
  useEffect(() => clear, [clear]);
  return {
    onPointerDown: start,
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerCancel: clear,
    onContextMenu: (e: { preventDefault: () => void }) => e.preventDefault(),
  };
}

/** Press-and-hold repeat for +/- buttons. Click steps once; holding accelerates after a delay. */
export function useHoldRepeat(step: () => void) {
  const held = useRef(false);
  // Set only when a hold ends *on* the button, so the click the browser fires next is the
  // tail of that hold and must not step again. Releasing outside the button fires no click,
  // so nothing is left armed to swallow the next real one.
  const suppressClick = useRef(false);
  const timeout = useRef<number | null>(null);
  const interval = useRef<number | null>(null);
  const stepRef = useRef(step);
  stepRef.current = step;
  const stop = useCallback(() => {
    if (timeout.current !== null) window.clearTimeout(timeout.current);
    if (interval.current !== null) window.clearInterval(interval.current);
    timeout.current = null;
    interval.current = null;
  }, []);
  const onPointerDown = useCallback(() => {
    held.current = false;
    suppressClick.current = false;
    stop();
    timeout.current = window.setTimeout(() => {
      held.current = true;
      interval.current = window.setInterval(() => stepRef.current(), 70);
    }, 450);
  }, [stop]);
  const onPointerUp = useCallback(() => {
    if (held.current) suppressClick.current = true;
    held.current = false;
    stop();
  }, [stop]);
  const cancel = useCallback(() => {
    held.current = false;
    stop();
  }, [stop]);
  const onClick = useCallback(() => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    stepRef.current();
  }, []);
  useEffect(() => stop, [stop]);
  return { onPointerDown, onPointerUp, onPointerLeave: cancel, onPointerCancel: cancel, onClick };
}

export function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState(() => (typeof window !== 'undefined' ? window.innerWidth >= 1024 : false));
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const on = () => setDesktop(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return desktop;
}
