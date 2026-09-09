import { useEffect, useRef } from 'react';
import { useAppStore } from '../state/store';
import { useUiStore } from '../state/uiStore';
import { getUrlParams } from '../state/urlParams';
import { S } from '../content/strings';
import { currentDate, habitPlaceCount, nudgeCountOn, pendingNudge } from '../domain/selectors';
import { formatDateLong } from '../domain/dates';
import { useAppNavigate } from '../lib/hooks';
import { Button } from './Button';

/**
 * Plan v2 section 5.4. Keeps Next day, Skip a week, Land a paycheck, Summer override and
 * Reset, and gains Force a nudge now and Make a habit, plus a readout of place count, habit
 * count and today's nudge status.
 *
 * The long press and `touch-action` handling below is deliberately untouched: it is fragile
 * and was reworked twice in v1.
 */
export function DemoTray() {
  const open = useUiStore((s) => s.trayOpen);
  const setOpen = useUiStore((s) => s.setTrayOpen);
  const setTrayHeight = useUiStore((s) => s.setTrayHeight);
  const box = useRef<HTMLDivElement>(null);
  const clock = useAppStore((s) => s.clock);
  const seed = useAppStore((s) => s.profile.seed);
  const summerOverride = useAppStore((s) => s.demo.summerOverride);
  const nextDay = useAppStore((s) => s.nextDay);
  const skipWeek = useAppStore((s) => s.skipWeek);
  const landPaycheck = useAppStore((s) => s.landPaycheck);
  const forceNudge = useAppStore((s) => s.forceNudge);
  const makeHabit = useAppStore((s) => s.makeHabit);
  const setSummerOverride = useAppStore((s) => s.setSummerOverride);
  const resetDemo = useAppStore((s) => s.resetDemo);
  const navigate = useAppNavigate();
  const state = useAppStore();
  const params = getUrlParams();

  // Report the tray height so sheets and modals can keep their buttons above it.
  useEffect(() => {
    if (!open || !box.current) {
      setTrayHeight(0);
      return;
    }
    const el = box.current;
    const report = () => setTrayHeight(el.getBoundingClientRect().height);
    report();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(report) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [open, setTrayHeight]);

  if (!open) {
    if (!params.demo) return null;
    return (
      <button
        type="button"
        data-testid="demo-open"
        onClick={() => setOpen(true)}
        className="press elev-3 fixed bottom-20 right-3 z-50 rounded-full bg-ink px-3.5 py-2 text-xs font-bold text-ground lg:bottom-4 lg:left-60 lg:right-auto"
        /* Plan v2 6.13: the tray is a fixed overlay, so its handle needs the bottom and side
           insets or it ends up pinned under the home indicator. */
        style={{
          bottom: 'calc(5rem + env(safe-area-inset-bottom))',
          right: 'calc(0.75rem + env(safe-area-inset-right))',
        }}
      >
        {S.demo.open}
      </button>
    );
  }

  const date = currentDate(state);
  const summerState = summerOverride ?? 'auto';
  const cycle = () => setSummerOverride(summerState === 'auto' ? 'on' : summerState === 'on' ? 'off' : null);
  const pending = pendingNudge(state);
  const todayNudges = nudgeCountOn(state, state.clock.dayIndex);
  const nudgeStatus = pending ? `pending ${pending.displayName}` : todayNudges > 0 ? 'done' : S.demo.nudgeNone;

  return (
    <div
      ref={box}
      data-testid="demo-tray"
      className="fixed inset-x-2 bottom-[68px] z-50 rounded-2xl bg-ink p-3 text-ground elev-3 dark:bg-card dark:text-ink dark:ring-1 dark:ring-line sm:inset-x-auto sm:left-1/2 sm:w-[560px] sm:-translate-x-1/2 lg:bottom-4 lg:left-[15.5rem] lg:translate-x-0"
      /* Plan v2 6.13, as above. The long press and touch-action handling is untouched (5.4). */
      style={{
        bottom: 'calc(68px + env(safe-area-inset-bottom))',
        marginLeft: 'env(safe-area-inset-left)',
        marginRight: 'env(safe-area-inset-right)',
      }}
    >
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="font-semibold uppercase tracking-wide opacity-80">{S.demo.title}</span>
        <button type="button" onClick={() => setOpen(false)} className="underline opacity-80" data-testid="demo-collapse">
          {S.demo.collapse}
        </button>
      </div>
      <dl className="mb-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs sm:grid-cols-4">
        <div>
          <dt className="opacity-60">{S.demo.date}</dt>
          <dd data-testid="demo-date" className="font-mono">{date ? formatDateLong(date) : ''}</dd>
        </div>
        <div>
          <dt className="opacity-60">{S.demo.dayIndex}</dt>
          <dd data-testid="demo-day-index" className="font-mono">{clock.dayIndex}</dd>
        </div>
        <div>
          <dt className="opacity-60">{S.demo.seed}</dt>
          <dd data-testid="demo-seed" className="font-mono">{seed}</dd>
        </div>
        <div>
          <dt className="opacity-60">{S.demo.places}</dt>
          <dd data-testid="demo-place-count" className="font-mono">{state.places.length}</dd>
        </div>
        <div>
          <dt className="opacity-60">{S.demo.habits}</dt>
          <dd data-testid="demo-habit-count" className="font-mono">{habitPlaceCount(state)}</dd>
        </div>
        <div className="col-span-2">
          <dt className="opacity-60">{S.demo.nudgeToday}</dt>
          <dd data-testid="demo-nudge-status" className="font-mono">{nudgeStatus}</dd>
        </div>
      </dl>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" data-testid="demo-next-day" onClick={() => nextDay()}>
          {S.demo.nextDay}
        </Button>
        <Button size="sm" data-testid="demo-skip-week" onClick={() => skipWeek()}>
          {S.demo.skipWeek}
        </Button>
        <Button size="sm" variant="amber" data-testid="demo-land-paycheck" onClick={() => landPaycheck()}>
          {S.demo.landPaycheck}
        </Button>
        <Button size="sm" variant="secondary" data-testid="demo-make-habit" onClick={() => makeHabit()}>
          {S.demo.makeHabit}
        </Button>
        <Button size="sm" variant="secondary" data-testid="demo-force-nudge" onClick={() => forceNudge()}>
          {S.demo.forceNudge}
        </Button>
        <Button size="sm" variant="secondary" data-testid="demo-force-summer" data-state={summerState} onClick={cycle}>
          {S.demo.forceSummer(summerState)}
        </Button>
        <Button
          size="sm"
          variant="danger"
          data-testid="demo-reset"
          onClick={async () => {
            await resetDemo();
            navigate('/welcome');
          }}
        >
          {S.demo.reset}
        </Button>
      </div>
    </div>
  );
}
