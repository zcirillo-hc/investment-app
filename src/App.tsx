import { useEffect, useRef } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { useAppStore } from './state/store';
import { useUiStore } from './state/uiStore';
import { getUrlParams } from './state/urlParams';
import { todayLocal } from './domain/dates';
import { applyTheme, readThemeMirror, useTheme } from './lib/theme';
import { S } from './content/strings';
import { AppRoutes } from './routes';
import { forcedRenderFault } from './lib/devFault';

export default function App() {
  const hydrated = useUiStore((s) => s.hydrated);
  const theme = useAppStore((s) => s.settings.theme);
  useTheme(theme);
  const booted = useRef(false);

  // Paint the mirrored theme immediately, before hydration, so dark-mode users never see a
  // light flash. `main.tsx` now does this before the tree mounts as well (D19, so the
  // ErrorBoundary is themed even when this component's first render throws); this stays for
  // the unit tests and any host that mounts `App` without going through `main.tsx`.
  useEffect(() => {
    const mirror = readThemeMirror();
    if (mirror) applyTheme(mirror);
  }, []);

  // Auto-advance on open, once, after hydration.
  useEffect(() => {
    if (!hydrated || booted.current) return;
    booted.current = true;
    const mirror = readThemeMirror();
    if (mirror && mirror !== useAppStore.getState().settings.theme) useAppStore.getState().setTheme(mirror);
    const params = getUrlParams();
    const ticks = useAppStore.getState().autoAdvance(todayLocal(), params.freeze);
    if (ticks > 0) useUiStore.getState().showToast(S.home.autoAdvance(ticks));
    if (params.demo) useUiStore.getState().setTrayOpen(true);
    // Plan v2 section 5.4: ?nudge=1 performs "Force a nudge now" once at boot, so one
    // navigation can reach a nudge. `forceNudge` turns nudges on first, because R4.1 would
    // otherwise refuse every candidate while the opt in (R4.5) is still off.
    if (params.nudge && useAppStore.getState().profile.onboardingComplete) useAppStore.getState().forceNudge();
  }, [hydrated]);

  // C4-6: dev-only, query-gated render fault so the ErrorBoundary can actually be observed.
  // Placed after the hooks so the hook order is identical on the render that throws.
  if (forcedRenderFault()) throw new Error('forced render fault');

  if (!hydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ground text-muted" data-testid="hydrating">
        {S.loading}
      </div>
    );
  }
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
