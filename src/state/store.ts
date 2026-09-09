import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { AppState, FearOption, LearnSurface, LessonId, PushErrorKind, PushSupportState, SummerOverride, Theme } from '../domain/types';
import { initialAppState, initialPushState } from '../domain/types';
import type { LedgerDraft } from '../domain/ledger';
import { fnv1a32 } from '../domain/prng';
import { todayLocal } from '../domain/dates';
import { clampAge } from '../domain/summer';
import { clampCatchPct } from '../domain/catch';
import { crossedGoal } from '../domain/jar';
import {
  acceptCatch as acceptCatchDomain,
  addLedgerEntry as addLedgerEntryDomain,
  completeOnboarding as completeOnboardingDomain,
  declineCatch as declineCatchDomain,
  deleteAllPlaces as deleteAllPlacesDomain,
  deleteLedgerEntry as deleteLedgerEntryDomain,
  deletePlace as deletePlaceDomain,
  dismissNudge as dismissNudgeDomain,
  emptyJar as emptyJarDomain,
  forceNudge as forceNudgeDomain,
  injectHabitVisits as injectHabitVisitsDomain,
  landDemoPaycheck as landDemoPaycheckDomain,
  markLessonRead as markLessonReadDomain,
  moveJarToLedger as moveJarToLedgerDomain,
  mutePlace as mutePlaceDomain,
  setNudgesEnabled as setNudgesEnabledDomain,
  takeSkip as takeSkipDomain,
  tick,
  tickN,
  updateLedgerEntry as updateLedgerEntryDomain,
} from '../domain/tick';
import {
  dismissLearnSurface as dismissLearnSurfaceDomain,
  markLearnSurface as markLearnSurfaceDomain,
  newlyFiredMilestones,
} from '../domain/triggers';
import { nudgeSchedulePayload, pendingNudge as pendingNudgeOf } from '../domain/nudges';
import { todayLocal as realTodayLocal } from '../domain/dates';
import { clearPendingNudge, writePendingNudge } from '../lib/pendingNudge';
import { syncSchedule } from '../lib/push';
import { STORAGE_KEY } from '../config';
import { deps } from './deps';
import { getUrlParams } from './urlParams';
import { clearPersistedState, idbStorage, installMirrorFlush, pickAppState } from './persistence';
import { useUiStore, type Outcome } from './uiStore';
import { runAutoAdvance } from './bootstrap';
import { clearThemeMirror, writeThemeMirror } from '../lib/theme';

export type LedgerSaveResult = { ok: true } | { ok: false; problems: string[] };

export interface AppActions {
  setProfile: (name: string, email: string) => void;
  setSummer: (earnedCents: number | null, leftCents: number | null, age: number) => void;
  setFear: (fear: FearOption) => void;
  completeOnboarding: () => void;
  nextDay: () => Outcome;
  skipWeek: () => Outcome;
  landPaycheck: () => void;
  acceptCatch: (pct: number) => Outcome;
  declineCatch: () => void;
  markLessonRead: (id: LessonId) => void;
  updateSettings: (patch: Partial<AppState['settings']>) => void;
  setTheme: (theme: Theme) => void;
  setSummerOverride: (v: SummerOverride) => void;
  autoAdvance: (today: string, freeze: boolean) => number;
  resetDemo: () => Promise<void>;
  replaceState: (state: AppState) => void;
  // Plan v2 5.3, new.
  takeSkip: (nudgeId: string) => Outcome;
  dismissNudge: (nudgeId: string) => void;
  mutePlace: (placeId: string, muted: boolean) => void;
  deletePlace: (placeId: string) => void;
  deleteAllPlaces: () => void;
  addLedgerEntry: (draft: LedgerDraft) => LedgerSaveResult;
  updateLedgerEntry: (id: string, draft: LedgerDraft) => LedgerSaveResult;
  deleteLedgerEntry: (id: string) => void;
  /** R6.4: the amount is always the whole jar, so it is deliberately not a parameter. */
  moveJarToLedger: (draft: Omit<LedgerDraft, 'source' | 'amountCents'>) => LedgerSaveResult;
  emptyJar: () => void;
  setNudgesEnabled: (on: boolean) => void;
  markFlag: (flag: keyof AppState['flags']) => void;
  // Plan v2 8.9 and R12.5. Reading a Learn piece, and the surfacing cards.
  markLearnRead: (id: string) => void;
  markLearnSurface: (key: LearnSurface) => void;
  dismissLearnSurface: (key: LearnSurface) => void;
  // Plan v2 5.6. Push lifecycle state. None of it is ever restored from an import.
  setPushSupport: (state: PushSupportState) => void;
  setPushSubscribed: (hash: string | null, tz: string) => void;
  clearPush: () => void;
  setPushError: (kind: PushErrorKind) => void;
  markServerPrivacySeen: () => void;
  markInstallExplainerSeen: () => void;
  // Demo only (plan 5.4).
  forceNudge: () => void;
  makeHabit: () => void;
}

export type AppStore = AppState & AppActions;

/** The demo tray's "Make a habit" plants three visits at this place, at this time (plan 5.4). */
export const DEMO_HABIT_PLACE = 'Demo Coffee';
export const DEMO_HABIT_MINUTE = 510;
export const DEMO_HABIT_CENTS = 435;

function outcomeBetween(before: AppState, after: AppState, ticks: number): Outcome {
  const movesBefore = before.events.filter((e) => e.kind === 'JarMove').length;
  const movesAfter = after.events.filter((e) => e.kind === 'JarMove');
  const newMoves = movesAfter.slice(movesBefore);
  return {
    ticks,
    jarMoves: newMoves.length,
    movedCents: newMoves.reduce((s, e) => s + e.cents, 0),
    // R6.3: fires once per crossing, and again after the jar is emptied and refills.
    crossedGoal: crossedGoal(before.jarCents, after.jarCents, after.settings.jarGoalCents),
    milestones: newlyFiredMilestones(before, after),
    newPaychecks: after.pendingPaychecks.length - before.pendingPaychecks.length,
  };
}

/**
 * Plan v2 5.6 and R14.2. Every action that creates, clears or resolves a pending nudge ends
 * here: the pending nudge record is written or cleared for the service worker (6.4), and the
 * schedule is published to the server.
 *
 * Fire and forget, on purpose. It is never awaited inside a reducer, it cannot fail the
 * action, and a rejection only sets `push.lastError` (R14.11: with the API unreachable the
 * whole product still works). Nothing here claims a nudge was scheduled when the call failed,
 * which is the exact failure mode risk 9 names.
 */
function publishNudgeSchedule(
  state: AppState,
  setPush: (patch: Partial<AppState['push']>) => void,
): void {
  const nudge = pendingNudgeOf(state.nudges, state.clock.dayIndex);

  // The record the worker reads. Written only while there is something to say (6.4).
  if (nudge && state.settings.nudgesEnabled) {
    void writePendingNudge({
      v: 2,
      date: realTodayLocal(),
      minute: nudge.nudgeMinute,
      placeName: nudge.displayName,
      estimateCents: nudge.estimateCents,
    });
  } else {
    void clearPendingNudge();
  }

  // R14.2: only while nudges are on and a subscription exists. `syncSchedule` returns
  // `no-subscription` rather than calling the API when there is none, so this is safe to run
  // unconditionally on a browser that has never opted in.
  if (!state.settings.nudgesEnabled) return;
  const payload = nudgeSchedulePayload(
    nudge,
    realTodayLocal(),
    state.settings.quietStartMinute,
    state.settings.quietEndMinute,
  );
  const next = { date: payload.nudgeLocalDate, minute: payload.nudgeLocalMinute };
  void syncSchedule(next, state.push.lastScheduleSent)
    .then((outcome) => {
      if (!outcome.sent) return;
      if (outcome.result.ok) setPush({ lastScheduleSent: next, lastError: null });
      else setPush({ lastError: outcome.result.kind });
    })
    .catch(() => setPush({ lastError: 'network' }));
}

export function createAppStore() {
  return create<AppStore>()(
    persist(
      (set, get) => {
        const patchPush = (patch: Partial<AppState['push']>): void => set((s) => ({ push: { ...s.push, ...patch } }));
        /** 5.6: the seven actions that can change the pending nudge all end here. */
        const publish = (state: AppState): void => publishNudgeSchedule(state, patchPush);
        const apply = (fn: (s: AppState) => AppState, ticks = 0): Outcome => {
          const before = pickAppState(get());
          const after = fn(before);
          const outcome = outcomeBetween(before, after, ticks);
          set(after);
          useUiStore.getState().applyOutcome(outcome);
          return outcome;
        };
        /** `set` plus the R14.2 publication, for the actions that are not tick shaped. */
        const setAndPublish = (fn: (s: AppState) => AppState): void => {
          const after = fn(pickAppState(get()));
          set(after);
          publish(after);
        };
        const applyAndPublish = (fn: (s: AppState) => AppState, ticks = 0): Outcome => {
          const outcome = apply(fn, ticks);
          publish(pickAppState(get()));
          return outcome;
        };
        return {
          ...initialAppState(),
          // The seed is derived from the profile during onboarding and frozen at completion.
          // Editing the name or email later must never re-derive it, or the ?seed override is
          // lost and every future simulated day comes from a new stream.
          setProfile: (name, email) =>
            set((s) => {
              const createdAt = s.profile.createdAt || new Date().toISOString();
              if (s.profile.onboardingComplete) return { profile: { ...s.profile, name, email, createdAt } };
              const seed = fnv1a32(`${name}|${email}|${createdAt}`);
              return { profile: { ...s.profile, name, email, createdAt, seed } };
            }),
          setSummer: (earnedCents, leftCents, age) =>
            set((s) => ({ profile: { ...s.profile, summerEarnedCents: earnedCents, summerLeftCents: leftCents, age: clampAge(age) } })),
          setFear: (fear) => set((s) => ({ profile: { ...s.profile, fear } })),
          completeOnboarding: () => {
            const params = getUrlParams();
            const today = todayLocal();
            set(completeOnboardingDomain(pickAppState(get()), { startDate: params.start ?? today, todayLocal: today, seedOverride: params.seed }));
          },
          nextDay: () => applyAndPublish((s) => tick(s, deps), 1),
          skipWeek: () => applyAndPublish((s) => tickN(s, deps, 7), 7),
          landPaycheck: () => set(landDemoPaycheckDomain(pickAppState(get()))),
          acceptCatch: (pct) => apply((s) => acceptCatchDomain(s, clampCatchPct(pct))),
          declineCatch: () => set(declineCatchDomain(pickAppState(get()))),
          markLessonRead: (id) => apply((s) => markLessonReadDomain(s, id, new Date().toISOString())),
          updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
          setTheme: (theme) => {
            writeThemeMirror(theme);
            set((s) => ({ settings: { ...s.settings, theme } }));
          },
          setSummerOverride: (v) => set((s) => ({ demo: { ...s.demo, summerOverride: v } })),
          autoAdvance: (today, freeze) => {
            const before = pickAppState(get());
            const r = runAutoAdvance(before, deps, today, freeze);
            if (r.ticks > 0) apply(() => r.state, r.ticks);
            else set(r.state);
            return r.ticks;
          },
          resetDemo: async () => {
            clearThemeMirror();
            set(initialAppState());
            await clearPersistedState();
          },
          replaceState: (state) => set(state),

          // R5.5.
          takeSkip: (nudgeId) => applyAndPublish((s) => takeSkipDomain(s, nudgeId)),
          // R4.6, R4.7: nothing is written and nothing moves.
          dismissNudge: (nudgeId) => setAndPublish((s) => dismissNudgeDomain(s, nudgeId)),
          mutePlace: (placeId, muted) => setAndPublish((s) => mutePlaceDomain(s, placeId, muted)),
          deletePlace: (placeId) => setAndPublish((s) => deletePlaceDomain(s, placeId)),
          deleteAllPlaces: () => setAndPublish((s) => deleteAllPlacesDomain(s)),
          addLedgerEntry: (draft) => {
            const r = addLedgerEntryDomain(pickAppState(get()), draft, new Date().toISOString());
            if (!r.ok) return { ok: false, problems: r.problems };
            apply(() => r.state);
            return { ok: true };
          },
          updateLedgerEntry: (id, draft) => {
            const r = updateLedgerEntryDomain(pickAppState(get()), id, draft);
            if (!r.ok) return { ok: false, problems: r.problems };
            set(r.state);
            return { ok: true };
          },
          deleteLedgerEntry: (id) => set(deleteLedgerEntryDomain(pickAppState(get()), id)),
          moveJarToLedger: (draft) => {
            const r = moveJarToLedgerDomain(pickAppState(get()), draft, new Date().toISOString());
            if (!r.ok) return { ok: false, problems: r.problems };
            apply(() => r.state);
            useUiStore.getState().startJarMoveAnimation(r.entry.amountCents);
            return { ok: true };
          },
          emptyJar: () => set(emptyJarDomain(pickAppState(get()))),
          setNudgesEnabled: (on) => setAndPublish((s) => setNudgesEnabledDomain(s, on)),
          markFlag: (flag) => set((s) => ({ flags: { ...s.flags, [flag]: true } })),

          // R12.5: reading a Learn piece records a read and nothing else. There is no unlock
          // to grant, because nothing in the library was ever locked.
          markLearnRead: (id) =>
            set((s) => {
              const existing = s.learn[id];
              if (!existing || existing.readAt !== null) return {};
              return { learn: { ...s.learn, [id]: { unlockedDay: 0, readAt: new Date().toISOString() } } };
            }),
          markLearnSurface: (key) => set(markLearnSurfaceDomain(pickAppState(get()), key)),
          dismissLearnSurface: (key) => set(dismissLearnSurfaceDomain(pickAppState(get()), key)),

          // Plan 5.6. `settings.nudgesEnabled` stays the single source of truth for whether
          // nudges are on; `push.subscribed` is transport state and the UI never reads it in
          // its place.
          setPushSupport: (supportState) => patchPush({ supportState }),
          setPushSubscribed: (endpointHash, tz) => patchPush({ subscribed: true, endpointHash, tz, lastError: null }),
          clearPush: () => set((s) => ({ push: { ...initialPushState(), supportState: s.push.supportState } })),
          setPushError: (lastError) => patchPush({ lastError }),
          markServerPrivacySeen: () => set((s) => ({ flags: { ...s.flags, serverPrivacySeen: true } })),
          markInstallExplainerSeen: () => set((s) => ({ flags: { ...s.flags, installExplainerSeen: true } })),
          forceNudge: () => setAndPublish((s) => forceNudgeDomain(setNudgesEnabledDomain(s, true))),
          makeHabit: () => set(injectHabitVisitsDomain(pickAppState(get()), DEMO_HABIT_PLACE, DEMO_HABIT_MINUTE, DEMO_HABIT_CENTS)),
        };
      },
      {
        name: STORAGE_KEY,
        version: 1,
        storage: createJSONStorage(() => idbStorage),
        partialize: (s) => pickAppState(s),
        migrate: (persisted) => persisted as AppStore,
        onRehydrateStorage: () => () => {
          useUiStore.getState().setHydrated(true);
        },
      },
    ),
  );
}

export const useAppStore = createAppStore();

/**
 * The synchronous localStorage mirror is written inside the storage adapter on every change,
 * and re-written here when the tab is hidden or is going away. The envelope shape must match
 * the one zustand's `createJSONStorage` writes.
 */
export function persistedEnvelopeJson(): string {
  return JSON.stringify({ state: pickAppState(useAppStore.getState()), version: 1 });
}

if (typeof window !== 'undefined') installMirrorFlush(persistedEnvelopeJson);
