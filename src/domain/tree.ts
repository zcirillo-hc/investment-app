// Plan v2 R8. The tree grows with skips: its stage is a function of the lifetime Skip count.
import type { LedgerEvent } from './types';
import { TREE_STAGE_MIN_SKIPS } from '../config';

export type TreeStage = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * The day of the first RoundUp, Catch or Skip, or null before any of them. Events are appended
 * in day order, so the first match is the earliest. No longer drives the tree (R8.1 changed on
 * 2026-09-12); `firstKeptDay` still exposes it.
 */
export function firstKeptDayIndex(events: LedgerEvent[]): number | null {
  for (const e of events) {
    if (e.kind === 'RoundUp' || e.kind === 'Catch' || e.kind === 'Skip') return e.dayIndex;
  }
  return null;
}

/**
 * Plan v2 R8.1 and R8.2 (owner decision, 2026-09-12): stage is a function of the lifetime Skip
 * count only, never of time or of an amount. The count only rises, so the tree never shrinks,
 * and a quiet stretch changes nothing. A count that is not a whole, non negative number is
 * treated as the nearest safe value rather than trusted.
 */
export function treeStage(skips: number): TreeStage {
  const n = Number.isFinite(skips) ? Math.max(0, Math.floor(skips)) : 0;
  let stage = 0;
  for (let s = 1; s < TREE_STAGE_MIN_SKIPS.length; s++) {
    if (n >= TREE_STAGE_MIN_SKIPS[s]) stage = s;
  }
  return stage as TreeStage;
}
