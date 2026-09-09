// Plan v2 R8. The tree grows from the first kept event of any kind, not from a sweep.
import type { LedgerEvent } from './types';
import { TREE_STAGE_MIN_DAYS } from '../config';

export type TreeStage = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Plan v2 R8.1: the day of the first RoundUp, Catch or Skip, or null before any of them.
 * Events are appended in day order, so the first match is the earliest.
 */
export function firstKeptDayIndex(events: LedgerEvent[]): number | null {
  for (const e of events) {
    if (e.kind === 'RoundUp' || e.kind === 'Catch' || e.kind === 'Skip') return e.dayIndex;
  }
  return null;
}

/**
 * Plan v2 R8.1 and R8.2: stage is a function of simulated days since the first kept event,
 * and never of an amount, so a small jar still visibly grows.
 */
export function treeStage(dayIndex: number, firstKeptDay: number | null): TreeStage {
  if (firstKeptDay === null) return 0;
  const days = Math.max(0, dayIndex - firstKeptDay);
  let stage = 1;
  for (let s = 2; s < TREE_STAGE_MIN_DAYS.length; s++) {
    if (days >= TREE_STAGE_MIN_DAYS[s]) stage = s;
  }
  return stage as TreeStage;
}

export function daysSinceFirstKept(dayIndex: number, firstKeptDay: number | null): number | null {
  if (firstKeptDay === null) return null;
  return Math.max(0, dayIndex - firstKeptDay);
}
