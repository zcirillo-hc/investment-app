// Plan v2 R13: the order of operations on a tick, exactly as listed, plus the actions that
// happen outside a tick. Pure: nothing here touches storage, React or a platform API.
import type { Cents, Paycheck, PlaceVisit, SimContext } from './interfaces';
import type { AppState, Deps, FearOption, Habit, LedgerEntry, LedgerEvent, Nudge, Place } from './types';
import { dayOfMonth, monthOf, simDate } from './dates';
import { roundUpsFor } from './roundup';
import { addToJar, emptiedJar } from './jar';
import { catchCents, clampCatchPct, paycheckCentsFor } from './catch';
import { deletePlace as deletePlaceRecords, deleteAllPlaces as clearPlaceRecords, pruneVisits, upsertPlaces } from './places';
import { recomputeHabits } from './habits';
import {
  cancelNudgesForPlace,
  expirePendingNudges,
  makeNudge,
  nudgeCandidates,
  selectNudge,
  selectNudgeIgnoringTime,
  setPlaceMuted,
} from './nudges';
import { makeEntry, removeEntry, replaceEntry, validateDraft, type LedgerDraft } from './ledger';
import { evaluateLearnSurfaces, evaluateLessonTriggers, evaluateMilestones } from './triggers';
import { hadKeptEventsInSummerEndingAt } from './summer';
import { FEAR_LESSON } from '../content/lessons';

interface Working {
  jar: Cents;
  events: LedgerEvent[];
  places: Place[];
  visits: PlaceVisit[];
  habits: Habit[];
  nudges: Nudge[];
  milestones: AppState['milestones'];
  pending: Paycheck[];
}

function eventId(kind: string, dayIndex: number, seq: number): string {
  return `${kind}:${dayIndex}:${seq}`;
}

/** Plan v2 R9: the kinds that count as money kept. */
export function sumByKind(events: LedgerEvent[], kind: LedgerEvent['kind']): Cents {
  let s = 0;
  for (const e of events) if (e.kind === kind && 'cents' in e) s += e.cents;
  return s;
}

function simContext(state: AppState): SimContext {
  return {
    seed: state.profile.seed,
    paycheckCents: paycheckCentsFor(state.profile.summerEarnedCents),
    startDate: state.clock.startDate,
  };
}

/**
 * R13 steps 10 and 11, which every jar credit runs after applying itself. The Learn surfacing
 * pass rides along with step 10 because it is evaluated from exactly the same facts, but it is
 * a separate function so that it can never be mistaken for an unlock (R12.5).
 */
function evaluateTriggersAndMilestones(state: AppState, summerJustEnded: boolean): AppState {
  return evaluateMilestones(evaluateLearnSurfaces(evaluateLessonTriggers(state)), { summerJustEnded });
}

/** Plan v2 R13, exactly this order. */
export function tick(state: AppState, deps: Deps): AppState {
  // 1. Advance dayIndex and recompute date.
  const dayIndex = state.clock.dayIndex + 1;
  const date = simDate(state.clock.startDate, dayIndex);
  const ctx = simContext(state);

  const w: Working = {
    jar: state.jarCents,
    events: state.events.slice(),
    places: state.places,
    visits: state.visits,
    habits: state.habits,
    // 2. Expire any pending nudge from the previous day (R4.6), silently.
    nudges: expirePendingNudges(state.nudges, dayIndex),
    milestones: state.milestones,
    pending: state.pendingPaychecks.slice(),
  };

  // 3. Generate the day's purchases (R2.4 gives each a minute of day).
  const purchases = deps.transactions.purchasesForDay(dayIndex, ctx);
  for (const p of purchases) {
    w.events.push({
      kind: 'Purchase',
      id: eventId('Purchase', dayIndex, w.events.length),
      dayIndex,
      date,
      purchaseId: p.id,
      merchant: p.merchant,
      category: p.category,
      cents: p.amountCents,
    });
  }

  // 4. Record visits for non subscription purchases (R2.3).
  const dayVisits = deps.location.visitsForDay(dayIndex, ctx, purchases);
  if (dayVisits.length > 0) {
    w.visits = [...w.visits, ...dayVisits];
    w.places = upsertPlaces(w.places, dayVisits, deps.location);
  }

  // 5. Apply round-ups to the jar (R2.1), unless paused.
  for (const r of roundUpsFor(purchases, state.settings.roundUpsPaused)) {
    w.events.push({
      kind: 'RoundUp',
      id: eventId('RoundUp', dayIndex, w.events.length),
      dayIndex,
      date,
      purchaseId: r.purchase.id,
      merchant: r.purchase.merchant,
      purchaseCents: r.purchase.amountCents,
      cents: r.cents,
    });
    w.jar = addToJar(w.jar, r.cents);
  }

  // 6. Queue a paycheck if one is due.
  const pc = deps.transactions.paycheckForDay(dayIndex, ctx);
  if (pc) {
    w.pending.push(pc);
    w.events.push({
      kind: 'Paycheck',
      id: eventId('Paycheck', dayIndex, w.events.length),
      dayIndex,
      date,
      paycheckId: pc.id,
      cents: pc.amountCents,
      source: pc.source,
    });
  }

  // 7. Prune visits older than 90 days (R2.5).
  w.visits = pruneVisits(w.visits, dayIndex);

  // 8. Recompute habit status for every place (R3).
  w.habits = recomputeHabits(w.places, w.visits, dayIndex);

  // 9. Select and create at most one nudge (R4).
  const candidates = nudgeCandidates(w.places, w.habits, w.nudges, state.settings, dayIndex);
  const chosen = selectNudge(candidates, state.settings.quietStartMinute, state.settings.quietEndMinute);
  if (chosen) w.nudges = [...w.nudges, makeNudge(chosen.candidate, dayIndex, chosen.nudgeMinute)];

  const next: AppState = {
    ...state,
    clock: { ...state.clock, dayIndex },
    jarCents: w.jar,
    places: w.places,
    visits: w.visits,
    habits: w.habits,
    nudges: w.nudges,
    events: w.events,
    pendingPaychecks: w.pending,
    milestones: w.milestones,
  };

  // 10 and 11. Lessons, then milestones.
  const summerJustEnded = monthOf(date) === 9 && dayOfMonth(date) === 1 && hadKeptEventsInSummerEndingAt(next.events, date);
  return evaluateTriggersAndMilestones(next, summerJustEnded);
}

export function tickN(state: AppState, deps: Deps, n: number): AppState {
  let s = state;
  for (let i = 0; i < n; i++) s = tick(s, deps);
  return s;
}

/**
 * Plan v2 R5.5 and R4.6: the user taking the skip action credits the jar by exactly the
 * estimate that was shown, writes one Skip event, and sets the nudge to skipped. A nudge that
 * is not pending is a no op, so a double tap or a skip on an expired nudge cannot double
 * credit. R5.3: the Skip event stores the estimate that was shown and nothing restates it.
 */
export function takeSkip(state: AppState, nudgeId: string): AppState {
  const nudge = state.nudges.find((n) => n.id === nudgeId);
  if (!nudge || nudge.status !== 'pending') return state;
  const dayIndex = state.clock.dayIndex;
  const date = simDate(state.clock.startDate, dayIndex);
  const events = state.events.slice();
  events.push({
    kind: 'Skip',
    id: eventId('Skip', dayIndex, events.length),
    dayIndex,
    date,
    nudgeId: nudge.id,
    placeId: nudge.placeId,
    displayName: nudge.displayName,
    cents: nudge.estimateCents,
  });
  const next: AppState = {
    ...state,
    jarCents: addToJar(state.jarCents, nudge.estimateCents),
    events,
    nudges: state.nudges.map((n) => (n.id === nudgeId ? { ...n, status: 'skipped' as const } : n)),
    milestones:
      state.milestones.firstSkipDayIndex === null
        ? { ...state.milestones, firstSkipDayIndex: dayIndex }
        : state.milestones,
  };
  return evaluateTriggersAndMilestones(next, false);
}

/**
 * Plan v2 R4.6 and R4.7: "Not today" expires the nudge. No event, no counter movement, no
 * copy anywhere. This is a requirement, not an omission.
 */
export function dismissNudge(state: AppState, nudgeId: string): AppState {
  const nudge = state.nudges.find((n) => n.id === nudgeId);
  if (!nudge || nudge.status !== 'pending') return state;
  return { ...state, nudges: state.nudges.map((n) => (n.id === nudgeId ? { ...n, status: 'expired' as const } : n)) };
}

/** Plan v2 R4.8. */
export function mutePlace(state: AppState, placeId: string, muted: boolean): AppState {
  const mutedPlaceIds = setPlaceMuted(state.settings.mutedPlaceIds, placeId, muted);
  const nudges = muted ? cancelNudgesForPlace(state.nudges, placeId) : state.nudges;
  return { ...state, settings: { ...state.settings, mutedPlaceIds }, nudges };
}

/** Plan v2 R4.5. Turning nudges off cancels a pending nudge; turning them on creates nothing. */
export function setNudgesEnabled(state: AppState, on: boolean): AppState {
  const nudges = on
    ? state.nudges
    : state.nudges.map((n) => (n.status === 'pending' ? { ...n, status: 'expired' as const } : n));
  return { ...state, settings: { ...state.settings, nudgesEnabled: on }, nudges };
}

/**
 * Plan v2 R11.3: removes the place, its visits and a pending nudge for it. Past Skip events
 * keep their stored place display name and amount, so this never touches `events`.
 */
export function deletePlace(state: AppState, placeId: string): AppState {
  const r = deletePlaceRecords(state.places, state.visits, state.settings.mutedPlaceIds, placeId);
  return {
    ...state,
    places: r.places,
    visits: r.visits,
    settings: { ...state.settings, mutedPlaceIds: r.mutedPlaceIds },
    habits: recomputeHabits(r.places, r.visits, state.clock.dayIndex),
    nudges: cancelNudgesForPlace(state.nudges, placeId),
  };
}

/** Plan v2 R11.4. */
export function deleteAllPlaces(state: AppState): AppState {
  const r = clearPlaceRecords();
  return {
    ...state,
    places: r.places,
    visits: r.visits,
    settings: { ...state.settings, mutedPlaceIds: r.mutedPlaceIds },
    habits: [],
    nudges: state.nudges.map((n) => (n.status === 'pending' ? { ...n, status: 'expired' as const } : n)),
  };
}

export type LedgerActionResult = { ok: true; state: AppState; entry: LedgerEntry } | { ok: false; state: AppState; problems: string[] };

/** Plan v2 R7.1 and R12.1: adding an entry validates first, and the first one unlocks L4. */
export function addLedgerEntry(state: AppState, draft: LedgerDraft, createdAt: string): LedgerActionResult {
  const currentDate = simDate(state.clock.startDate || '1970-01-01', state.clock.dayIndex);
  const v = validateDraft(draft, state.clock.startDate ? currentDate : '');
  if (!v.ok) return { ok: false, state, problems: v.problems };
  const entry = makeEntry(state.ledger, v.draft, createdAt);
  const next = evaluateTriggersAndMilestones({ ...state, ledger: [...state.ledger, entry] }, false);
  return { ok: true, state: next, entry };
}

/** Plan v2 R7.4. */
export function updateLedgerEntry(state: AppState, id: string, draft: LedgerDraft): LedgerActionResult {
  const existing = state.ledger.find((e) => e.id === id);
  if (!existing) return { ok: false, state, problems: ['missing'] };
  const currentDate = simDate(state.clock.startDate || '1970-01-01', state.clock.dayIndex);
  const v = validateDraft(draft, state.clock.startDate ? currentDate : '');
  if (!v.ok) return { ok: false, state, problems: v.problems };
  const ledger = replaceEntry(state.ledger, id, v.draft);
  return { ok: true, state: { ...state, ledger }, entry: ledger.find((e) => e.id === id) as LedgerEntry };
}

/** Plan v2 R7.4: deleting a jar sourced entry does not restore the jar. */
export function deleteLedgerEntry(state: AppState, id: string): AppState {
  return { ...state, ledger: removeEntry(state.ledger, id) };
}

/**
 * Plan v2 R6.4: one ledger entry with source "jar", one JarMove event for the full jar
 * amount, and jarCents = 0. Cancelling never reaches here, so it changes nothing.
 */
export function moveJarToLedger(state: AppState, draft: Omit<LedgerDraft, 'source' | 'amountCents'>, createdAt: string): LedgerActionResult {
  const amount = state.jarCents;
  if (amount <= 0) return { ok: false, state, problems: ['amount'] };
  const added = addLedgerEntry(state, { ...draft, amountCents: amount, source: 'jar' }, createdAt);
  if (!added.ok) return added;
  const dayIndex = state.clock.dayIndex;
  const date = simDate(state.clock.startDate, dayIndex);
  const events = added.state.events.slice();
  events.push({
    kind: 'JarMove',
    id: eventId('JarMove', dayIndex, events.length),
    dayIndex,
    date,
    ledgerEntryId: added.entry.id,
    cents: amount,
  });
  return { ok: true, state: { ...added.state, events, jarCents: emptiedJar() }, entry: added.entry };
}

/**
 * Plan v2 R6.5: sets jarCents to 0 and writes one JarEmptied event. No ledger entry, and the
 * Activity line is neutral (plan 9.7).
 */
export function emptyJar(state: AppState): AppState {
  const amount = state.jarCents;
  if (amount <= 0) return state;
  const dayIndex = state.clock.dayIndex;
  const date = simDate(state.clock.startDate, dayIndex);
  const events = state.events.slice();
  events.push({ kind: 'JarEmptied', id: eventId('JarEmptied', dayIndex, events.length), dayIndex, date, cents: amount });
  return { ...state, events, jarCents: emptiedJar() };
}

/** Plan v2 R6.1 accept: a Catch event, the jar credit, then R13 steps 10 and 11 only. */
export function acceptCatch(state: AppState, pct: number): AppState {
  const head = state.pendingPaychecks[0];
  if (!head) return state;
  const usedPct = clampCatchPct(pct);
  const cents = catchCents(head.amountCents, usedPct);
  const dayIndex = state.clock.dayIndex;
  const date = simDate(state.clock.startDate, dayIndex);
  const events = state.events.slice();
  events.push({
    kind: 'Catch',
    id: eventId('Catch', dayIndex, events.length),
    dayIndex,
    date,
    paycheckId: head.id,
    paycheckCents: head.amountCents,
    pct: usedPct,
    cents,
  });
  const next: AppState = {
    ...state,
    jarCents: addToJar(state.jarCents, cents),
    events,
    pendingPaychecks: state.pendingPaychecks.slice(1),
  };
  return evaluateTriggersAndMilestones(next, false);
}

/** Decline: pop the queue, emit nothing. */
export function declineCatch(state: AppState): AppState {
  if (state.pendingPaychecks.length === 0) return state;
  return { ...state, pendingPaychecks: state.pendingPaychecks.slice(1) };
}

/** Demo paycheck with the same amount, immediately, no day advance. */
export function landDemoPaycheck(state: AppState): AppState {
  const dayIndex = state.clock.dayIndex;
  const date = simDate(state.clock.startDate, dayIndex);
  const amountCents = paycheckCentsFor(state.profile.summerEarnedCents);
  const n = state.events.filter((e) => e.kind === 'Paycheck' && e.dayIndex === dayIndex && e.source === 'demo').length;
  const pc: Paycheck = { id: `pay-demo-${dayIndex}-${n}`, dayIndex, amountCents, source: 'demo' };
  const events = state.events.slice();
  events.push({
    kind: 'Paycheck',
    id: eventId('Paycheck', dayIndex, events.length),
    dayIndex,
    date,
    paycheckId: pc.id,
    cents: amountCents,
    source: 'demo',
  });
  return { ...state, pendingPaychecks: [...state.pendingPaychecks, pc], events };
}

/**
 * The demo tray's "Force a nudge now" and `?nudge=1` (plan 5.4). It ignores R4.2 and R4.3 but
 * not R4.1, so a muted place, an off switch or a day that already has a nudge still stops it.
 * Turning nudges on is the caller's job, and the tray and the url param both do it first.
 */
export function forceNudge(state: AppState): AppState {
  const dayIndex = state.clock.dayIndex;
  const habits = recomputeHabits(state.places, state.visits, dayIndex);
  const candidates = nudgeCandidates(state.places, habits, state.nudges, state.settings, dayIndex);
  const chosen = selectNudgeIgnoringTime(candidates);
  if (!chosen) return { ...state, habits };
  return { ...state, habits, nudges: [...state.nudges, makeNudge(chosen.candidate, dayIndex, chosen.nudgeMinute)] };
}

/**
 * The demo tray's "Make a habit" (plan 5.4): three visits at the same minute at a named
 * place, so a habit can be demonstrated without fourteen taps. Demo only; it writes visits
 * the same shape the feed writes.
 */
export function injectHabitVisits(state: AppState, displayName: string, minuteOfDay: number, amountCents: Cents): AppState {
  const dayIndex = state.clock.dayIndex;
  const placeId = displayName.trim().replace(/\s+/g, ' ').toLowerCase();
  const visits: PlaceVisit[] = [];
  for (let i = 0; i < 3; i++) {
    const day = Math.max(0, dayIndex - i);
    visits.push({
      id: `demo-${day}-${i}-${state.visits.length + i}`,
      placeId,
      displayName,
      dayIndex: day,
      date: simDate(state.clock.startDate, day),
      minuteOfDay,
      amountCents,
    });
  }
  const allVisits = [...state.visits, ...visits].sort((a, b) => a.dayIndex - b.dayIndex);
  const places = upsertPlaces(state.places, visits, null);
  return { ...state, visits: allVisits, places, habits: recomputeHabits(places, allVisits, dayIndex) };
}

/** Plan v2 R12.2: the fear check unlocks its mapped lesson at day 0, unchanged. */
export function completeOnboarding(
  state: AppState,
  opts: { startDate: string; todayLocal: string; seedOverride: number | null },
): AppState {
  let s: AppState = {
    ...state,
    profile: {
      ...state.profile,
      onboardingComplete: true,
      seed: opts.seedOverride !== null ? opts.seedOverride >>> 0 : state.profile.seed,
    },
    clock: { startDate: opts.startDate, dayIndex: 0, lastOpenedRealDate: opts.todayLocal },
  };
  const fear: FearOption | null = s.profile.fear;
  if (fear) {
    const id = FEAR_LESSON[fear];
    if (s.lessons[id].unlockedDay === null) {
      s = { ...s, lessons: { ...s.lessons, [id]: { ...s.lessons[id], unlockedDay: 0 } } };
    }
  }
  return s;
}

export function markLessonRead(state: AppState, id: keyof AppState['lessons'], nowIso: string): AppState {
  const l = state.lessons[id];
  if (l.unlockedDay === null || l.readAt !== null) return state;
  const next: AppState = { ...state, lessons: { ...state.lessons, [id]: { ...l, readAt: nowIso } } };
  return evaluateMilestones(next, { summerJustEnded: false });
}
