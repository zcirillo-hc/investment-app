import { describe, expect, it } from 'vitest';
import { treeStage } from '../../src/domain/tree';
import { skipCount, tree } from '../../src/domain/selectors';
import { initialAppState, type AppState } from '../../src/domain/types';
import { TREE_STAGE_MIN_SKIPS } from '../../src/config';

/** A state whose events are the given kinds, one per day, with the clock far past them. */
function withEvents(kinds: string[], clockDay = 200): AppState {
  const s = initialAppState();
  return {
    ...s,
    clock: { ...s.clock, dayIndex: clockDay },
    events: kinds.map((kind, n) => ({ kind, id: `${kind}:${n}`, dayIndex: n, date: '2026-06-15', cents: 435 })) as unknown as AppState['events'],
  };
}

describe('tree stage (R8; owner decision 2026-09-12: it grows with skips, not with time)', () => {
  it('is a seed until the first skip, then steps up at each threshold', () => {
    expect(TREE_STAGE_MIN_SKIPS).toEqual([0, 1, 3, 7, 14, 30, 60]);
    const cases: [skips: number, stage: number][] = [
      [0, 0],
      [1, 1],
      [2, 1],
      [3, 2],
      [6, 2],
      [7, 3],
      [13, 3],
      [14, 4],
      [29, 4],
      [30, 5],
      [59, 5],
      [60, 6],
      [1000, 6],
    ];
    for (const [skips, stage] of cases) expect(treeStage(skips), `${skips} skips`).toBe(stage);
  });

  it('treats a count that is not a whole, non negative number as the nearest safe value', () => {
    expect(treeStage(-3)).toBe(0);
    expect(treeStage(2.9)).toBe(1);
    expect(treeStage(Number.NaN)).toBe(0);
  });

  it('grows with skips only: time passing, paycheck catches and legacy round-ups change nothing', () => {
    expect(tree(withEvents(['Catch', 'RoundUp', 'Catch']))).toBe(0);
    const three = withEvents(['Skip', 'Catch', 'Skip', 'Skip']);
    expect(skipCount(three)).toBe(3);
    expect(tree(three)).toBe(2);
    expect(tree({ ...three, clock: { ...three.clock, dayIndex: 5 } })).toBe(2);
  });
});
