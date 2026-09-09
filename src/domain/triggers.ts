// Plan v2 R12 (lesson triggers) and the milestones.
import type { AppState, LessonId } from './types';
import { FEAR_LESSON_DAY_10, FEAR_LESSON_DAY_20, FIRST_100_KEPT_CENTS, FIRST_MONTH_DAY } from '../config';
import { FEAR_LESSON_POOL, LESSON_BY_ID } from '../content/lessons';
import { LEARN_SURFACES, type LearnSurface } from '../content/learn';
import { LESSON_IDS } from './types';

function unlock(state: AppState, id: LessonId, day: number): AppState {
  if (state.lessons[id].unlockedDay !== null) return state;
  return { ...state, lessons: { ...state.lessons, [id]: { ...state.lessons[id], unlockedDay: day } } };
}

/**
 * Plan v2 R12.1 to R12.4. L3 retriggers on the first Skip and L4 on the first ledger entry
 * (plan 1.3), because the jar no longer becomes shares and there is no price to dip. Each
 * lesson unlocks once and is never relocked.
 */
export function evaluateLessonTriggers(state: AppState): AppState {
  let s = state;
  const day = s.clock.dayIndex;
  const has = (kind: string) => s.events.some((e) => e.kind === kind);
  if (has('RoundUp')) s = unlock(s, 'L1', day);
  if (has('Catch')) s = unlock(s, 'L2', day);
  if (has('Skip')) s = unlock(s, 'L3', day);
  if (s.ledger.length > 0) s = unlock(s, 'L4', day);
  if (day >= FIRST_MONTH_DAY) s = unlock(s, 'L5', day);
  // R12.3: the first still-locked fear pool lesson on day 10, any remaining on day 20.
  if (day >= FEAR_LESSON_DAY_10) {
    const dayTenDone = FEAR_LESSON_POOL.some((id) => (s.lessons[id].unlockedDay ?? -1) >= FEAR_LESSON_DAY_10);
    const locked = FEAR_LESSON_POOL.filter((id) => s.lessons[id].unlockedDay === null);
    if (!dayTenDone && locked.length > 0) s = unlock(s, locked[0], day);
  }
  if (day >= FEAR_LESSON_DAY_20) {
    for (const id of FEAR_LESSON_POOL) s = unlock(s, id, day);
  }
  return s;
}

/**
 * Plan v2 R12.5. The three surfacing moments, evaluated the same way every tick and on the
 * two actions that can cause one. A surfacing moment records that it happened; it never
 * unlocks, never relocks and never changes what is reachable, which is why it writes to
 * `learnSurfaces` and cannot touch `learn`.
 *
 * The first Invest visit is recorded by the Invest screen through `markLearnSurface`, because
 * it is a navigation and not a state change the domain can see.
 */
export function evaluateLearnSurfaces(state: AppState): AppState {
  let s = state;
  const day = s.clock.dayIndex;
  const fire = (k: LearnSurface): void => {
    if (s.learnSurfaces[k].firedDay === null) {
      s = { ...s, learnSurfaces: { ...s.learnSurfaces, [k]: { ...s.learnSurfaces[k], firedDay: day } } };
    }
  };
  if (s.ledger.length > 0) fire('firstLedgerEntry');
  if (day >= FIRST_MONTH_DAY) fire('dayThirty');
  return s;
}

/** R12.5: recording a moment. Idempotent, so a repeat visit cannot re-surface a dismissed card. */
export function markLearnSurface(state: AppState, key: LearnSurface): AppState {
  if (state.learnSurfaces[key].firedDay !== null) return state;
  return {
    ...state,
    learnSurfaces: { ...state.learnSurfaces, [key]: { ...state.learnSurfaces[key], firedDay: state.clock.dayIndex } },
  };
}

/** R12.5: dismissing the card. The piece it linked to was readable before and stays readable. */
export function dismissLearnSurface(state: AppState, key: LearnSurface): AppState {
  if (state.learnSurfaces[key].dismissed) return state;
  return {
    ...state,
    learnSurfaces: { ...state.learnSurfaces, [key]: { ...state.learnSurfaces[key], dismissed: true } },
  };
}

/** The surfacing cards Home should render right now, in a fixed order (R1.4). */
export function activeLearnSurfaces(state: AppState): LearnSurface[] {
  return LEARN_SURFACES.filter((k) => state.learnSurfaces[k].firedDay !== null && !state.learnSurfaces[k].dismissed);
}

/** Plan v2 R9.3: every RoundUp, Catch and Skip amount. */
export function totalKeptCents(state: AppState): number {
  let sum = 0;
  for (const e of state.events) if (e.kind === 'RoundUp' || e.kind === 'Catch' || e.kind === 'Skip') sum += e.cents;
  return sum;
}

export type MilestoneKey = 'first100Kept' | 'firstSummer' | 'pathFinished';

/** Plan v2 section 1.1: the milestones keep first100Kept, firstSummer and pathFinished. */
export function evaluateMilestones(state: AppState, opts: { summerJustEnded: boolean }): AppState {
  let s = state;
  const day = s.clock.dayIndex;
  if (s.milestones.first100Kept === null && totalKeptCents(s) >= FIRST_100_KEPT_CENTS) {
    s = { ...s, milestones: { ...s.milestones, first100Kept: day } };
  }
  if (s.milestones.firstSummer === null && opts.summerJustEnded) {
    s = { ...s, milestones: { ...s.milestones, firstSummer: day } };
  }
  if (s.milestones.pathFinished === null && LESSON_IDS.every((id) => s.lessons[id].readAt !== null)) {
    s = { ...s, milestones: { ...s.milestones, pathFinished: day } };
  }
  return s;
}

export function newlyFiredMilestones(before: AppState, after: AppState): MilestoneKey[] {
  const out: MilestoneKey[] = [];
  for (const k of ['first100Kept', 'firstSummer', 'pathFinished'] as MilestoneKey[]) {
    if (before.milestones[k] === null && after.milestones[k] !== null) out.push(k);
  }
  return out;
}

export function lessonTitle(id: LessonId): string {
  return LESSON_BY_ID[id].title;
}
