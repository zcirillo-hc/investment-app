import type { AppState, Deps } from '../domain/types';
import { daysBetween, isValidDate } from '../domain/dates';
import { tickN } from '../domain/tick';
import { AUTO_ADVANCE_CAP_DAYS } from '../config';

/**
 * Plan 4.15. Defensive about the stored date: a state that predates the import
 * validator (or was hand-edited in storage) can carry an unparseable
 * `lastOpenedRealDate`, and boot must never throw over it. An unusable date is
 * treated as "no previous open": no ticks, and the date is rewritten below.
 */
export function computeAutoAdvanceTicks(lastOpenedRealDate: string, today: string, freeze: boolean): number {
  if (freeze) return 0;
  if (!lastOpenedRealDate) return 0;
  if (!isValidDate(lastOpenedRealDate) || !isValidDate(today)) return 0;
  const elapsed = daysBetween(lastOpenedRealDate, today);
  if (elapsed <= 0) return 0;
  return Math.min(elapsed, AUTO_ADVANCE_CAP_DAYS);
}

export function runAutoAdvance(state: AppState, deps: Deps, today: string, freeze: boolean): { state: AppState; ticks: number } {
  if (!state.profile.onboardingComplete) return { state, ticks: 0 };
  // A start date we cannot parse would throw inside every tick, so do not advance on it.
  if (!isValidDate(state.clock.startDate)) return { state, ticks: 0 };
  const ticks = computeAutoAdvanceTicks(state.clock.lastOpenedRealDate, today, freeze);
  let next = ticks > 0 ? tickN(state, deps, ticks) : state;
  if (freeze) return { state: next, ticks };
  next = { ...next, clock: { ...next.clock, lastOpenedRealDate: today } };
  return { state: next, ticks };
}
