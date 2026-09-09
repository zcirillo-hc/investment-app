// Plan v2 sections 8.1 to 8.7a: what the screens read. No screen does arithmetic of its own.
import type { Cents } from './interfaces';
import type { AppState, Habit, LessonId, Nudge, Place, PlaceVisit } from './types';
import { LESSON_IDS } from './types';
import { safeSimDate } from './dates';
import { byThirtyDollars, isSummer, keptThisSummerCents } from './summer';
import { firstKeptDayIndex, treeStage } from './tree';
import { habitStatusOf, type HabitStatus } from './habits';
import { pendingNudge as pendingNudgeOf, isPlaceMuted } from './nudges';
import { visitCountInWindow } from './places';
import { ledgerEntryCount, ledgerTotalCents, firstEntryDate } from './ledger';
import { activeLearnSurfaces, totalKeptCents } from './triggers';
import { FEAR_LESSON } from '../content/lessons';
import { LEARN_IDS, LEARN_SURFACE_ITEM, LEARN_TOTAL, type LearnSurface } from '../content/learn';
import { HABIT_WINDOW_DAYS } from '../config';

/**
 * The simulated date, or '' when there is not a usable one. Guards an unparseable stored
 * `startDate` as well as the pre-onboarding empty string.
 */
export function currentDate(state: AppState): string {
  return safeSimDate(state.clock.startDate, state.clock.dayIndex) ?? '';
}

/** Plan v2 R9.1: RoundUp, Catch and Skip amounts with dayIndex > currentDay - 7. */
export function keptThisWeekCents(state: AppState): Cents {
  const cutoff = state.clock.dayIndex - 7;
  let sum = 0;
  for (const e of state.events) {
    if ((e.kind === 'RoundUp' || e.kind === 'Catch' || e.kind === 'Skip') && e.dayIndex > cutoff) sum += e.cents;
  }
  return sum;
}

/** Plan v2 R9.2. */
export function skipsThisWeek(state: AppState): number {
  const cutoff = state.clock.dayIndex - 7;
  let n = 0;
  for (const e of state.events) if (e.kind === 'Skip' && e.dayIndex > cutoff) n += 1;
  return n;
}

/**
 * R17. The habit metrics, and the shape of them is the point.
 *
 * The theme (.dev-team/06-theme.md section 2) defines success as "I have a habit and I saved
 * $X", and section 5 forbids a streak that breaks. So these count what the user DID and never
 * what they missed: a lifetime total that only rises, and a best week that is a high water mark
 * and can never fall. Nothing here can display a gap, a miss, or a broken run.
 */
export function skipCount(state: AppState): number {
  let n = 0;
  for (const e of state.events) if (e.kind === 'Skip') n += 1;
  return n;
}

/** R17.2. Money that came specifically from skipping, as opposed to a paycheck catch. */
export function keptFromSkipsCents(state: AppState): Cents {
  let sum = 0;
  for (const e of state.events) if (e.kind === 'Skip') sum += e.cents;
  return sum;
}

/**
 * R17.3. The most skips in any 7 day window so far. A record, not a streak: it is a maximum
 * over history, so a quiet week leaves it untouched rather than resetting it to zero.
 */
export function bestSkipWeek(state: AppState): number {
  const days: number[] = [];
  for (const e of state.events) if (e.kind === 'Skip') days.push(e.dayIndex);
  if (days.length === 0) return 0;
  days.sort((a, b) => a - b);
  let best = 0;
  let lo = 0;
  for (let hi = 0; hi < days.length; hi++) {
    while (days[hi] - days[lo] >= 7) lo += 1;
    best = Math.max(best, hi - lo + 1);
  }
  return best;
}

/** Plan v2 R9.3. */
export function keptSinceStartCents(state: AppState): Cents {
  return totalKeptCents(state);
}

export interface TodayStats {
  roundUps: number;
  catches: number;
  skips: number;
  keptCents: Cents;
}

export function todayStats(state: AppState): TodayStats {
  const d = state.clock.dayIndex;
  let roundUps = 0;
  let catches = 0;
  let skips = 0;
  let keptCents = 0;
  for (const e of state.events) {
    if (e.dayIndex !== d) continue;
    if (e.kind === 'RoundUp') {
      roundUps += 1;
      keptCents += e.cents;
    } else if (e.kind === 'Catch') {
      catches += 1;
      keptCents += e.cents;
    } else if (e.kind === 'Skip') {
      skips += 1;
      keptCents += e.cents;
    }
  }
  return { roundUps, catches, skips, keptCents };
}

export function summerActive(state: AppState): boolean {
  const date = currentDate(state);
  if (!date) return false;
  return isSummer(date, state.demo.summerOverride);
}

export function keptThisSummer(state: AppState): Cents {
  const date = currentDate(state);
  if (!date) return 0;
  return keptThisSummerCents(state.events, date);
}

/** Plan v2 R10.2. Applied to what was kept (plan 1.4). */
export function byThirty(state: AppState): number {
  const base = summerActive(state) ? keptThisSummer(state) : keptSinceStartCents(state);
  return byThirtyDollars(base, state.profile.age);
}

/** Plan v2 R8.1. */
export function firstKeptDay(state: AppState): number | null {
  return firstKeptDayIndex(state.events);
}

export function tree(state: AppState) {
  return treeStage(state.clock.dayIndex, firstKeptDay(state));
}

export function readCount(state: AppState): number {
  return LESSON_IDS.filter((id) => state.lessons[id].readAt !== null).length;
}

/**
 * Plan v2 8.9: the Learn library's header reads "N of 16 read". A plain count, not a ring, not
 * a percentage, and not a badge for finishing.
 */
export function learnReadCount(state: AppState): number {
  return LEARN_IDS.filter((id) => state.learn[id]?.readAt != null).length;
}

export function learnTotal(): number {
  return LEARN_TOTAL;
}

export function learnIsRead(state: AppState, id: string): boolean {
  return state.learn[id]?.readAt != null;
}

/**
 * R12.5. Deliberately not called `learnUiState`: there is no locked state to report, because
 * nothing in the library is ever locked.
 */
export interface LearnSurfaceCard {
  key: LearnSurface;
  itemId: string;
}

export function learnSurfaceCards(state: AppState): LearnSurfaceCard[] {
  return activeLearnSurfaces(state).map((key) => ({ key, itemId: LEARN_SURFACE_ITEM[key] }));
}

export type LessonUiState = 'locked' | 'new' | 'read';

export function lessonUiState(state: AppState, id: LessonId): LessonUiState {
  const l = state.lessons[id];
  if (l.unlockedDay === null) return 'locked';
  if (l.readAt === null) return 'new';
  return 'read';
}

/** The fear lesson until read, then the oldest unlocked unread lesson. */
export function nextLessonId(state: AppState): LessonId | null {
  const fear = state.profile.fear ? FEAR_LESSON[state.profile.fear] : null;
  if (fear && lessonUiState(state, fear) === 'new') return fear;
  let best: LessonId | null = null;
  let bestDay = Infinity;
  for (const id of LESSON_IDS) {
    const l = state.lessons[id];
    if (l.unlockedDay !== null && l.readAt === null && l.unlockedDay < bestDay) {
      best = id;
      bestDay = l.unlockedDay;
    }
  }
  return best;
}

// The ledger (R7.2). None of these is a value, a return, or a comparison (R7.3).
export function ledgerTotal(state: AppState): Cents {
  return ledgerTotalCents(state.ledger);
}
export function ledgerCount(state: AppState): number {
  return ledgerEntryCount(state.ledger);
}
export function ledgerFirstDate(state: AppState): string | null {
  return firstEntryDate(state.ledger);
}

/** Plan v2 R4.6: the one nudge the user can act on today, if any. */
export function pendingNudge(state: AppState): Nudge | null {
  return pendingNudgeOf(state.nudges, state.clock.dayIndex);
}

export function nudgeCountOn(state: AppState, dayIndex: number): number {
  return state.nudges.filter((n) => n.dayIndex === dayIndex).length;
}

export interface PlaceRow {
  place: Place;
  habit: Habit | null;
  status: HabitStatus;
  visitsInWindow: number;
  usualMinute: number | null;
  estimateCents: Cents | null;
  muted: boolean;
}

/**
 * Plan v2 section 8.6: one row per inferred place, in place id order (R1.4). A place that is
 * visited often but at irregular times reports that, so the user can see why it is not
 * nudging them.
 */
export function placeRows(state: AppState): PlaceRow[] {
  const habitById = new Map(state.habits.map((h) => [h.placeId, h]));
  return state.places.map((place) => {
    const habit = habitById.get(place.id) ?? null;
    return {
      place,
      habit,
      status: habitStatusOf(habit),
      visitsInWindow: visitCountInWindow(state.visits, place.id, state.clock.dayIndex, HABIT_WINDOW_DAYS),
      usualMinute: habit?.usualMinute ?? null,
      estimateCents: habit?.estimateCents ?? null,
      muted: isPlaceMuted(state.settings.mutedPlaceIds, place.id),
    };
  });
}

export function habitPlaceCount(state: AppState): number {
  return state.habits.filter((h) => h.isHabit).length;
}

export function visitsForPlace(state: AppState, placeId: string): PlaceVisit[] {
  return state.visits.filter((v) => v.placeId === placeId);
}
