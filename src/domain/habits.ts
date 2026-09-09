// Plan v2 R3. Habit detection and the usual time. Pure TypeScript, no float arithmetic.
import type { Habit, Place, PlaceVisit } from './types';
import { estimateCentsFor } from './estimate';
import { visitsInWindow } from './places';
import { compareOrdinal } from './money';
import { HABIT_MAX_SPREAD_MINUTES, HABIT_MIN_VISITS, HABIT_WINDOW_DAYS } from '../config';

/**
 * Plan v2 R3.3: sort the window's visit minutes ascending and take the element at index
 * floor((n - 1) / 2). This lower median is used rather than an averaged median so that both
 * languages produce the same integer with no float.
 */
export function usualMinuteOf(minutes: number[]): number | null {
  if (minutes.length === 0) return null;
  const sorted = minutes.slice().sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

/**
 * Plan v2 R3.4: the absolute deviation of each visit minute from the usual minute, sorted
 * ascending, taking the element at index floor((n - 1) / 2). The same lower median, for the
 * same reason.
 */
export function spreadMinutesOf(minutes: number[], usualMinute: number): number | null {
  if (minutes.length === 0) return null;
  const devs = minutes.map((m) => Math.abs(m - usualMinute)).sort((a, b) => a - b);
  return devs[Math.floor((devs.length - 1) / 2)];
}

/** Plan v2 R3.2 and R3.4: the two thresholds, together. */
export function isHabitFrom(minutes: number[]): boolean {
  if (minutes.length < HABIT_MIN_VISITS) return false;
  const usual = usualMinuteOf(minutes);
  if (usual === null) return false;
  const spread = spreadMinutesOf(minutes, usual);
  if (spread === null) return false;
  return spread <= HABIT_MAX_SPREAD_MINUTES;
}

/**
 * Plan v2 R3.5: habit status is recomputed from scratch every tick from the window. There is
 * no stored streak and no hysteresis, so a place stops being a habit the day its window falls
 * below R3.2 or above R3.4. R3.7: no coordinate is read here, ever.
 */
export function habitFor(place: Place, visits: PlaceVisit[], dayIndex: number): Habit {
  const inWindow = visitsInWindow(visits, place.id, dayIndex, HABIT_WINDOW_DAYS);
  const minutes = inWindow.map((v) => v.minuteOfDay);
  const usualMinute = usualMinuteOf(minutes);
  const spreadMinutes = usualMinute === null ? null : spreadMinutesOf(minutes, usualMinute);
  const isHabit = isHabitFrom(minutes);
  return {
    placeId: place.id,
    isHabit,
    visitCount: inWindow.length,
    usualMinute,
    spreadMinutes,
    // R5.1: the estimate is computed over its own 60 day window, not the habit window.
    estimateCents: estimateCentsFor(visits, place.id, dayIndex),
  };
}

/**
 * Plan v2 R3.5: recomputed for every place, in place id order (R1.4) so the array is stable
 * across runs.
 */
export function recomputeHabits(places: Place[], visits: PlaceVisit[], dayIndex: number): Habit[] {
  return places
    .slice()
    .sort((a, b) => compareOrdinal(a.id, b.id))
    .map((p) => habitFor(p, visits, dayIndex));
}

export function habitFor_placeId(habits: Habit[], placeId: string): Habit | null {
  return habits.find((h) => h.placeId === placeId) ?? null;
}

/** Plan v2 R3.2 and R3.4 in words, for the Places screen (plan 8.6). */
export type HabitStatus = 'habit' | 'irregular' | 'notEnough';

export function habitStatusOf(habit: Habit | null): HabitStatus {
  if (!habit || habit.visitCount < HABIT_MIN_VISITS) return 'notEnough';
  return habit.isHabit ? 'habit' : 'irregular';
}
