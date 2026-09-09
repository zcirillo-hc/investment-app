import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAppStore } from '../state/store';
import { useUiStore } from '../state/uiStore';
import { getUrlParams } from '../state/urlParams';
import { S } from '../content/strings';
import { LESSON_BY_ID } from '../content/lessons';
import { LEARN_ITEM_BY_ID } from '../content/learn';
import { Screen } from '../components/Screen';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Money } from '../components/Money';
import { Jar } from '../components/Jar';
import { Tree } from '../components/Tree';
import { RichText } from '../components/Term';
import { CatchSheet } from '../components/CatchSheet';
import { NudgeCard } from '../components/NudgeCard';
import { LedgerForm } from '../components/LedgerForm';
import { JarMoveAnimation } from '../components/JarMoveAnimation';
import { JarCatch } from '../components/JarCatch';
import { MilestoneModal } from '../components/MilestoneCard';
import { AppLink, useAppNavigate, usePrefersReducedMotion } from '../lib/hooks';
import { formatDateLongSafe, safeSimDate } from '../domain/dates';
import { jarFillRatio } from '../domain/jar';
import {
  byThirty,
  currentDate,
  keptSinceStartCents,
  keptThisSummer,
  keptThisWeekCents,
  ledgerTotal,
  nextLessonId,
  pendingNudge,
  skipsThisWeek,
  summerActive,
  todayStats,
  tree,
  firstKeptDay,
  learnSurfaceCards,
} from '../domain/selectors';
import { daysSinceFirstKept } from '../domain/tree';
import type { MilestoneKey } from '../domain/triggers';

/** The corner mark on the hero card. Sits in its own absolutely positioned box, and the copy
 *  beside it is padded clear of it, so no text node ever resolves its contrast through it. */
function HeroMark() {
  return (
    <svg width="72" height="72" viewBox="0 0 72 72" aria-hidden="true" className="pointer-events-none">
      <circle cx="36" cy="36" r="34" className="fill-leaf" opacity="0.1" />
      <rect x="27" y="14" width="18" height="7" rx="3" className="fill-leaf" />
      <rect x="21" y="22" width="30" height="36" rx="10" className="fill-card stroke-leaf" strokeWidth="3" />
      <rect x="25" y="38" width="22" height="16" rx="7" className="fill-coral" />
      <circle cx="36" cy="32" r="3" className="fill-amber" />
    </svg>
  );
}

function StatTile({ label, children, testId }: { label: string; children: ReactNode; testId?: string }) {
  return (
    <Card padded={false} className="flex h-full flex-col items-center justify-center px-2 py-3 text-center" data-testid={testId}>
      <div className="text-[19px] font-extrabold leading-tight num sm:text-xl">{children}</div>
      <div className="mt-0.5 text-[11px] font-semibold uppercase leading-tight tracking-wide text-muted">{label}</div>
    </Card>
  );
}

export function Home() {
  const state = useAppStore();
  const acceptCatch = useAppStore((s) => s.acceptCatch);
  const declineCatch = useAppStore((s) => s.declineCatch);
  const takeSkip = useAppStore((s) => s.takeSkip);
  const dismissNudge = useAppStore((s) => s.dismissNudge);
  const moveJarToLedger = useAppStore((s) => s.moveJarToLedger);
  const emptyJar = useAppStore((s) => s.emptyJar);
  const markFlag = useAppStore((s) => s.markFlag);
  const dismissLearnSurface = useAppStore((s) => s.dismissLearnSurface);
  const showToast = useUiStore((s) => s.showToast);
  const firedMilestone = useUiStore((s) => s.milestoneModal);
  const closeMilestone = useUiStore((s) => s.closeMilestone);
  const reduced = usePrefersReducedMotion();
  const navigate = useAppNavigate();
  const [milestonesOpen, setMilestonesOpen] = useState(false);
  const [movingJar, setMovingJar] = useState(false);
  const [confirmSpent, setConfirmSpent] = useState(false);

  const summer = summerActive(state);
  const summerKept = keptThisSummer(state);
  const keptAll = keptSinceStartCents(state);
  const week = keptThisWeekCents(state);
  const skips = skipsThisWeek(state);
  const today = todayStats(state);
  const stage = tree(state);
  const days = daysSinceFirstKept(state.clock.dayIndex, firstKeptDay(state));
  const next = nextLessonId(state);
  const pending = state.pendingPaychecks[0];
  const nudge = pendingNudge(state);
  const moved = ledgerTotal(state);
  const params = getUrlParams();
  const date = currentDate(state);
  const showCapturePrompt = !state.flags.investCapturePromptSeen && state.ledger.length === 0;
  const surfaces = learnSurfaceCards(state);
  const nudgeRef = useRef<HTMLDivElement>(null);
  const jarRatio = jarFillRatio(state.jarCents, state.settings.jarGoalCents);

  /**
   * Plan 6.3 and criterion 23. Arriving from the notification lands on the nudge card. The
   * skip itself is still taken here, by the user, through `takeSkip`: neither the URL nor a
   * message from the service worker ever applies it, because a money action must not be
   * something a link can do on its own.
   */
  useEffect(() => {
    const focusNudge = () => {
      const el = nudgeRef.current;
      if (!el) return;
      el.scrollIntoView({ block: 'center', behavior: 'auto' });
      el.querySelector<HTMLButtonElement>('[data-testid="nudge-skip"]')?.focus();
    };
    if (new URLSearchParams(window.location.search).get('from') === 'nudge') focusNudge();
    // The value, not the key: in an insecure context the property exists and is undefined.
    if (!navigator.serviceWorker) return;
    const onMessage = (e: MessageEvent) => {
      if ((e.data as { type?: string } | null)?.type === 'focus-nudge') focusNudge();
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [nudge]);

  const achieved = useMemo(() => {
    const out: { milestone: MilestoneKey; dateLabel: string }[] = [];
    for (const k of ['first100Kept', 'firstSummer', 'pathFinished'] as MilestoneKey[]) {
      const d = state.milestones[k];
      if (d !== null) out.push({ milestone: k, dateLabel: formatDateLongSafe(safeSimDate(state.clock.startDate, d)) });
    }
    return out;
  }, [state.milestones, state.clock.startDate]);

  return (
    <Screen id="home">
      {/* Plan 1.4 and 9.3: two facts the app owns, plus one projection it labels an assumption.
          No percent, no arrow, no colour coded delta, no chart of a value the app cannot see. */}
      <Card tone="leaf" elevation="high" className="relative mt-2 overflow-hidden">
        <div className="pointer-events-none absolute right-3 top-3" aria-hidden="true">
          <HeroMark />
        </div>
        {/* Padded clear of the corner mark, so the mark is never underneath a line of text. */}
        <div className="relative pr-[76px]">
          <div className="text-xs font-bold uppercase tracking-[0.14em] text-muted" data-testid="kept-headline-label">
            {summer ? S.home.keptThisSummer : S.home.keptSinceStart}
          </div>
          <Money
            cents={summer ? summerKept : keptAll}
            countUp
            testId="stat-kept"
            className="mt-1 block text-[44px] font-extrabold leading-none num sm:text-6xl"
          />
        </div>
        <p className="mt-3 text-base font-semibold" data-testid="stat-by-thirty">
          {S.home.byThirty(byThirty(state))}{' '}
          <span className="text-sm font-normal text-muted">
            <RichText text={S.home.byThirtyTip} />
          </span>
        </p>
        <div className="mt-4 rounded-2xl bg-card/70 p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-2">
            <span className="text-sm font-semibold text-muted">
              <RichText text={S.home.movedLabel} />
            </span>
            <Money cents={moved} testId="stat-moved" className="text-2xl font-extrabold num" />
          </div>
          <p className="mt-1 text-sm leading-snug text-muted" data-testid="home-honest-line">
            {S.home.movedLine(moved)}
          </p>
        </div>
        {/* Plan 6.13: the way back into Summer Money once onboarding is behind the user. */}
        <AppLink
          to="/summer"
          data-testid="summer-link"
          className="press mt-3 inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-card px-4 text-sm font-semibold text-leaf ring-1 ring-line/70"
        >
          {S.home.summerLink}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 5l7 7-7 7" />
          </svg>
        </AppLink>
      </Card>

      {nudge && (
        <div ref={nudgeRef}>
          <NudgeCard
            nudge={nudge}
            onSkip={() => {
              takeSkip(nudge.id);
              showToast(S.nudge.toast(nudge.estimateCents));
            }}
            onDismiss={() => dismissNudge(nudge.id)}
          />
        </div>
      )}

      {/*
        Plan R12.5 and 8.9: the three surfacing moments. A card with a one line reason and a
        dismiss, linking to a piece that was readable before this appeared and stays readable
        after it is dismissed. Surfacing never unlocks and never gates.
      */}
      {surfaces.map((s2) => (
        <Card key={s2.key} className="mt-4" data-testid={`learn-surface-${s2.key}`}>
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-leaf-soft" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-leaf" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v14H6.5A2.5 2.5 0 0 0 4 19.5z" />
              </svg>
            </span>
            <div className="text-xs font-bold uppercase tracking-[0.14em] text-muted">{S.learn.title}</div>
          </div>
          <p className="mt-2 text-base font-bold leading-snug">{S.learn.surface[s2.key]}</p>
          <p className="mt-1 text-sm text-muted">{LEARN_ITEM_BY_ID[s2.itemId].title}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" data-testid={`learn-surface-open-${s2.key}`} onClick={() => navigate(`/learn/${s2.itemId}`)}>
              {S.learn.surfaceOpen}
            </Button>
            <Button size="sm" variant="secondary" data-testid={`learn-surface-dismiss-${s2.key}`} onClick={() => dismissLearnSurface(s2.key)}>
              {S.common.dismiss}
            </Button>
          </div>
        </Card>
      ))}

      {showCapturePrompt && (
        <Card className="mt-4" data-testid="invest-capture-prompt">
          <h2 className="text-base font-bold">{S.capture.promptTitle}</h2>
          <p className="mt-1 text-sm text-muted">{S.capture.promptBody}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              data-testid="invest-capture-prompt-add"
              onClick={() => {
                markFlag('investCapturePromptSeen');
                navigate('/invest/capture');
              }}
            >
              {S.capture.promptAdd}
            </Button>
            <Button variant="secondary" data-testid="invest-capture-skip" onClick={() => markFlag('investCapturePromptSeen')}>
              {S.capture.promptSkip}
            </Button>
          </div>
        </Card>
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Card className="relative overflow-hidden">
          <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-muted">
            <RichText text={S.home.jarTitle} />
          </h2>
          <div className="mx-auto mt-1 h-[200px] w-[160px]">
            <Jar jarCents={state.jarCents} goalCents={state.settings.jarGoalCents} />
          </div>
          <div className="mt-1 text-center">
            <Money cents={state.jarCents} testId="jar-amount" className="text-3xl font-extrabold num" />
            <div className="text-xs font-semibold text-muted" data-testid="jar-label">
              {S.home.jarLabel(state.jarCents, state.settings.jarGoalCents)}
            </div>
          </div>
          {/* The same ratio the jar draws, as a bar, because a bar reads a small value more
              precisely than a liquid level does. Decorative: the figures above say it in words. */}
          <div className="mx-auto mt-2.5 h-1.5 w-full max-w-[220px] overflow-hidden rounded-full bg-line" aria-hidden="true">
            <div
              className="h-full rounded-full bg-leaf"
              style={{ width: `${Math.round(jarRatio * 100)}%`, transition: reduced ? 'none' : 'width 0.7s cubic-bezier(0.2, 0.8, 0.2, 1)' }}
            />
          </div>
          <p className="mt-3 rounded-2xl bg-ground px-3 py-2 text-center text-sm ring-1 ring-line/60" data-testid="today-strip">
            <RichText text={today.roundUps === 0 && today.catches === 0 && today.skips === 0 ? S.home.todayNothing : S.home.today(today.roundUps, today.catches, today.skips, today.keptCents)} />
          </p>
          {/* R6.4 and R6.5: the two user actions. Nothing else moves the jar. */}
          {/* Full width and stacked: the primary label is a whole sentence, so a side by side
              pair either wraps raggedly or squeezes the secondary into two lines. */}
          <div className="mt-3 flex flex-col gap-2">
            <Button size="sm" full data-testid="jar-move" disabled={state.jarCents <= 0} onClick={() => setMovingJar(true)}>
              {S.home.moveToInvestment}
            </Button>
            <Button size="sm" full variant="secondary" data-testid="jar-spent" disabled={state.jarCents <= 0} onClick={() => setConfirmSpent(true)}>
              {S.home.spentIt}
            </Button>
          </div>
          {state.jarCents <= 0 && <p className="mt-2 text-xs text-muted">{S.home.jarEmpty}</p>}
          <JarMoveAnimation />
          {/* The arrival half of the same animation: money landing, rather than leaving. */}
          <JarCatch jarCents={state.jarCents} />
        </Card>
        <Card className="flex flex-col">
          <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-muted">{S.home.treeTitle}</h2>
          {/* Centred in whatever height the jar card sets, rather than pinned to the top with
              the caption pushed to the floor, which left a hole in the middle at desktop widths. */}
          <div className="mx-auto my-auto h-[200px] w-[200px] py-2">
            <Tree stage={stage} />
          </div>
          <p className="pt-2 text-center text-sm font-semibold text-muted" data-testid="tree-caption">
            {S.home.treeCaption(S.tree.stages[stage], days)}
          </p>
        </Card>
      </div>

      {movingJar && (
        <LedgerForm
          testIdPrefix="jar-ledger"
          title={S.jarMove.title}
          initial={{ amountCents: state.jarCents, date }}
          currentDate={date}
          source="jar"
          lockAmount
          onSave={(draft) => {
            const r = moveJarToLedger({ date: draft.date, what: draft.what, note: draft.note });
            if (r.ok) setMovingJar(false);
            return r;
          }}
          onCancel={() => setMovingJar(false)}
        />
      )}

      {confirmSpent && (
        <Card className="mt-3" tone="coral" data-testid="jar-spent-confirm">
          <h2 className="text-base font-bold">{S.jarMove.spentTitle}</h2>
          <p className="mt-1 text-sm">{S.jarMove.spentBody}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="danger"
              data-testid="jar-spent-yes"
              onClick={() => {
                emptyJar();
                setConfirmSpent(false);
                showToast(S.jarMove.spentDone);
              }}
            >
              {S.jarMove.spentConfirm}
            </Button>
            <Button variant="secondary" data-testid="jar-spent-cancel" onClick={() => setConfirmSpent(false)}>
              {S.common.cancel}
            </Button>
          </div>
        </Card>
      )}

      <div className="mt-4 grid grid-cols-3 gap-2">
        <StatTile label={S.home.weekKept}>
          <Money cents={week} testId="stat-week-kept" />
        </StatTile>
        <StatTile label={S.home.skipsThisWeek}>
          <span data-testid="stat-skips-week">{skips}</span>
        </StatTile>
        <StatTile label={S.home.daysIn}>
          <span data-testid="stat-days-in">{state.clock.dayIndex}</span>
        </StatTile>
      </div>

      <div className="mt-4">
        {next ? (
          <AppLink to={`/lessons/${next}`} data-testid="next-lesson-card" className="block">
            <div className={`lift rounded-card bg-coral-soft p-4 ring-2 ring-coral/60 elev-1 ${reduced ? '' : 'breathe'}`} data-testid="lesson-pulse">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-[0.14em] text-muted">{S.home.nextLesson}</span>
                <span className="rounded-full bg-coral px-2.5 py-0.5 text-xs font-bold text-on-coral">{S.home.nextLessonNew}</span>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <span className="min-w-0 flex-1 text-lg font-extrabold leading-tight">{LESSON_BY_ID[next].title}</span>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="shrink-0 text-coral-ink" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>
          </AppLink>
        ) : (
          <Card data-testid="next-lesson-card">
            <div className="text-xs font-bold uppercase tracking-[0.14em] text-muted">{S.home.nextLesson}</div>
            <div className="mt-1 text-base">{S.home.noLesson}</div>
          </Card>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <AppLink
          to="/activity"
          data-testid="activity-link"
          className="press flex min-h-[56px] items-center justify-center gap-2 rounded-card bg-card px-3 text-center text-sm font-bold text-leaf ring-1 ring-line/70 elev-1"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h10" />
          </svg>
          {S.home.activityLink}
        </AppLink>
        <button
          type="button"
          data-testid="milestones-link"
          className="press flex min-h-[56px] items-center justify-center gap-2 rounded-card bg-card px-3 text-center text-sm font-bold text-leaf ring-1 ring-line/70 elev-1"
          onClick={() => setMilestonesOpen(true)}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z" />
          </svg>
          {S.home.milestonesLink}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted">{formatDateLongSafe(date)}</p>
        {!params.demo && <span className="text-xs text-muted">{S.home.demoHint}</span>}
      </div>

      {pending && <CatchSheet paycheck={pending} defaultPct={state.settings.catchPct} onAccept={(pct) => acceptCatch(pct)} onDecline={declineCatch} />}
      {/* A fired milestone waits until the paycheck prompt is answered so the two never stack. */}
      {((firedMilestone && !pending) || milestonesOpen) && (
        <MilestoneModal
          items={firedMilestone ? achieved.filter((a) => a.milestone === firedMilestone) : achieved}
          name={state.profile.name}
          onClose={() => {
            closeMilestone();
            setMilestonesOpen(false);
          }}
        />
      )}
    </Screen>
  );
}
