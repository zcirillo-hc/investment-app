import { useEffect, type ReactNode } from 'react';
import { Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useAppStore } from './state/store';
import { useUiStore } from './state/uiStore';
import { AppRedirect, useIsDesktop } from './lib/hooks';
import type { AppState } from './domain/types';
import { Header } from './components/Header';
import { NavBar } from './components/NavBar';
import { DemoTray } from './components/DemoTray';
import { Toast } from './components/Toast';
import { Confetti } from './components/Confetti';
import { Welcome } from './screens/Welcome';
import { SummerMoney } from './screens/SummerMoney';
import { FearCheck } from './screens/FearCheck';
import { Home } from './screens/Home';
import { Activity } from './screens/Activity';
import { Places } from './screens/Places';
import { Invest } from './screens/Invest';
import { InvestCapture } from './screens/InvestCapture';
import { Lessons } from './screens/Lessons';
import { Lesson } from './screens/Lesson';
import { Learn } from './screens/Learn';
import { LearnItem } from './screens/LearnItem';
import { Settings } from './screens/Settings';
import type { BackControl } from './components/Header';
import { S } from './content/strings';

type Step = 'welcome' | 'summer' | 'fear';

/**
 * Plan v2 section 8.5: onboarding is Welcome, Summer, Fear. No name goes to /welcome, a name
 * with no fear goes to /onboarding/summer, otherwise /onboarding/fear.
 */
export function resumePath(state: AppState): string {
  if (!state.profile.name) return '/welcome';
  if (state.profile.fear) return '/onboarding/fear';
  return '/onboarding/summer';
}

/**
 * Onboarding is a sequence, so a step may only render once the data the earlier steps collect
 * is actually in state. Checking prerequisites rather than a step index keeps "refresh resumes
 * at this step" working: the summer screen's inputs are all optional, so reaching the fear
 * check needs only a name.
 */
function stepAllowed(step: Step, state: AppState): boolean {
  const p = state.profile;
  switch (step) {
    case 'welcome':
      return true;
    case 'summer':
    case 'fear':
      return p.name.length > 0;
  }
}

function OnboardingRoute({ step, children }: { step: Step; children: ReactNode }) {
  const complete = useAppStore((s) => s.profile.onboardingComplete);
  const state = useAppStore();
  if (complete) return <AppRedirect to="/" />;
  if (!stepAllowed(step, state)) return <AppRedirect to={resumePath(state)} />;
  return (
    <div className="min-h-screen bg-ground">
      <Toast />
      <div className="mx-auto max-w-content">{children}</div>
    </div>
  );
}

/**
 * Plan v2 6.13. A standalone launch has no browser back button, so every screen a user can
 * only reach by drilling in from one of the five tabs must supply its own way back. This is
 * that audit, in code: the list is exactly the one section 6.13 names, and criterion 20b walks
 * it with the browser's own back and forward disabled.
 *
 * The five tabs are deliberately absent, because switching tabs is itself the way back, and so
 * is anything dismissed by its own explicit action (the nudge card, the catch sheet, the
 * ledger form, the milestone modal), which R6.4, R6.5 and 8.2 already require.
 */
export function backControlFor(pathname: string): BackControl | undefined {
  if (pathname === '/activity') return { to: '/', label: S.common.backToHome };
  if (pathname === '/summer') return { to: '/', label: S.common.backToHome };
  if (pathname === '/learn') return { to: '/lessons', label: S.common.backToLessons };
  if (pathname.startsWith('/learn/')) return { to: '/learn', label: S.common.backToLearn };
  if (pathname.startsWith('/lessons/')) return { to: '/lessons', label: S.common.backToLessons };
  if (pathname === '/invest/capture') return { to: '/invest', label: S.common.backToInvest };
  return undefined;
}

function AppShell() {
  const state = useAppStore();
  const trayOpen = useUiStore((s) => s.trayOpen);
  const trayHeight = useUiStore((s) => s.trayHeight);
  const { pathname } = useLocation();
  const desktop = useIsDesktop();
  if (!state.profile.onboardingComplete) return <AppRedirect to={resumePath(state)} />;
  // Mobile: tab bar plus the demo tray. Desktop: the tray alone (it floats beside the rail).
  const trayInset = trayOpen ? 12 + Math.ceil(trayHeight) : 0;
  const bottomInset = desktop ? trayInset : 64 + trayInset;
  return (
    <div
      className="min-h-screen bg-ground"
      /*
       * Plan v2 6.13. The bottom inset the tab bar and every bottom sheet already read now
       * also carries the home indicator, and the side insets keep content off the rounded
       * corners in landscape. Padding, not margin, so the ground colour still reaches the edge.
       */
      style={{
        ['--bottom-inset' as string]: `calc(${bottomInset}px + env(safe-area-inset-bottom))`,
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
      }}
      data-route={pathname}
    >
      <Header back={backControlFor(pathname)} />
      <NavBar />
      <div className="lg:pl-56">
        <div className="lg:pt-6" style={{ paddingBottom: `calc(${bottomInset + (desktop ? 32 : 16)}px + env(safe-area-inset-bottom))` }}>
          <Outlet />
        </div>
      </div>
      <DemoTray />
      <Toast />
      <Confetti />
    </div>
  );
}

/**
 * Criterion 2: /portfolio, /onboarding/quiz and /onboarding/allocation each redirect, with
 * query parameters preserved, and no screen in the app links to them. `AppRedirect` carries
 * the search string, so the demo parameters survive the redirect.
 */
function DeletedRoute() {
  const complete = useAppStore((s) => s.profile.onboardingComplete);
  const state = useAppStore();
  return <AppRedirect to={complete ? '/' : resumePath(state)} />;
}

/** A route change starts at the top of the new screen. */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export function AppRoutes() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/welcome" element={<OnboardingRoute step="welcome"><Welcome /></OnboardingRoute>} />
        <Route path="/onboarding/summer" element={<OnboardingRoute step="summer"><SummerMoney /></OnboardingRoute>} />
        <Route path="/onboarding/fear" element={<OnboardingRoute step="fear"><FearCheck /></OnboardingRoute>} />
        <Route path="/onboarding/quiz" element={<DeletedRoute />} />
        <Route path="/onboarding/allocation" element={<DeletedRoute />} />
        <Route element={<AppShell />}>
          <Route path="/" element={<Home />} />
          <Route path="/activity" element={<Activity />} />
          <Route path="/places" element={<Places />} />
          <Route path="/invest" element={<Invest />} />
          <Route path="/invest/capture" element={<InvestCapture />} />
          <Route path="/portfolio" element={<DeletedRoute />} />
          <Route path="/lessons" element={<Lessons />} />
          <Route path="/lessons/:id" element={<Lesson />} />
          {/* Plan v2 8.9. Ungated: neither route checks anything before rendering (R12.5). */}
          <Route path="/learn" element={<Learn />} />
          <Route path="/learn/:id" element={<LearnItem />} />
          {/*
            Plan v2 6.13 names Summer Money as a screen that needs a back control "when
            revisited after onboarding", which presupposes a way to revisit it. This is that
            way: the same screen, reached from the Home summer headline card.
          */}
          <Route path="/summer" element={<SummerMoney />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<AppRedirect to="/" />} />
      </Routes>
    </>
  );
}
