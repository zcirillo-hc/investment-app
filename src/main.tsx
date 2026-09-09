import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { applyTheme, readThemeMirror } from './lib/theme';

/**
 * D19. `ErrorBoundary` sits outside `App`, but the theme was only applied from an effect
 * inside `App`. A throw during App's *first* render commits nothing, so no effect ran, and
 * the boundary's fallback painted the light palette even for a dark-mode user. Applying the
 * mirrored theme here, before the tree mounts, means the boundary is themed no matter which
 * render throws. `App`'s own effect still runs and still owns the theme after hydration; this
 * is idempotent with it, and a missing or corrupt mirror falls through to the same default.
 */
const mirror = readThemeMirror();
if (mirror) applyTheme(mirror);

/**
 * Plan v2 6.2. Registration happens after the first paint, inside a try and catch. A failed
 * registration is logged once and changes nothing else: the app must boot and run identically
 * with no service worker at all (6.12), which is also how it behaves in every test that does
 * not go looking for one.
 */
function registerServiceWorker(): void {
  // The VALUE, not the key. In an insecure context the property exists and is undefined, so
  // `'serviceWorker' in navigator` is true and the next dereference throws.
  if (typeof navigator === 'undefined' || !navigator.serviceWorker) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((err: unknown) => {
      // Once. Not on a timer, and never surfaced as an error the user has to act on.
      console.warn('Service worker registration failed; nudges will not arrive on this browser.', err);
    });
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);

registerServiceWorker();
