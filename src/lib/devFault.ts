/**
 * C4-6 test harness. `ErrorBoundary` (plan 11's malformed-state guarantee, D10) has never
 * been observed catching a real render error, only reasoned about, so this is a deliberate
 * way to throw one during render.
 *
 * It is gated twice: it only reads the query string in a dev build (`import.meta.env.DEV` is
 * false in `vite build`, so the branch is dropped from the production bundle entirely), and
 * it needs `?boom=1` on top of that. No user action anywhere in the app produces it, and it
 * renders no copy of its own.
 */
export function forcedRenderFault(): boolean {
  if (!import.meta.env.DEV) return false;
  try {
    return new URLSearchParams(window.location.search).get('boom') === '1';
  } catch {
    return false;
  }
}
