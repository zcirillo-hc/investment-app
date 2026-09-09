import { describe, expect, it } from 'vitest';
import { bestSkipWeek, keptFromSkipsCents, skipCount } from '../../src/domain/selectors';
import type { AppState, LedgerEvent } from '../../src/domain/types';

/** R17: habit metrics. They count what happened and can never show a gap or a broken run. */
function stateWith(events: Partial<LedgerEvent>[], dayIndex = 100): AppState {
  return { events: events as LedgerEvent[], clock: { dayIndex } } as unknown as AppState;
}
const skip = (dayIndex: number, cents = 435) => ({ kind: 'Skip' as const, dayIndex, cents, date: '2026-06-15' });
const other = (dayIndex: number, cents = 2500) => ({ kind: 'Catch' as const, dayIndex, cents, date: '2026-06-15' });

describe('skipCount', () => {
  it('counts every skip ever and nothing else', () => {
    expect(skipCount(stateWith([skip(1), skip(2), other(3), skip(4)]))).toBe(3);
  });
  it('is zero with no skips', () => {
    expect(skipCount(stateWith([]))).toBe(0);
    expect(skipCount(stateWith([other(1)]))).toBe(0);
  });
  it('never decreases as history grows', () => {
    let events: Partial<LedgerEvent>[] = [];
    let last = 0;
    for (let d = 1; d <= 30; d++) {
      if (d % 3 === 0) events = [...events, skip(d)];
      const n = skipCount(stateWith(events, d));
      expect(n).toBeGreaterThanOrEqual(last);
      last = n;
    }
  });
});

describe('keptFromSkipsCents', () => {
  it('sums skip amounts only, leaving catches out', () => {
    expect(keptFromSkipsCents(stateWith([skip(1, 435), other(2, 2500), skip(3, 500)]))).toBe(935);
  });
  it('is zero with no skips', () => {
    expect(keptFromSkipsCents(stateWith([other(1)]))).toBe(0);
  });
});

describe('bestSkipWeek', () => {
  it('is the most skips inside any 7 day window', () => {
    // Days 1,2,3 are within a week of each other. Day 40 is alone.
    expect(bestSkipWeek(stateWith([skip(1), skip(2), skip(3), skip(40)]))).toBe(3);
  });

  it('treats the window as 7 days wide, not 8', () => {
    // 1 and 7 are 6 apart, so both count. 1 and 8 are 7 apart, so they do not.
    expect(bestSkipWeek(stateWith([skip(1), skip(7)]))).toBe(2);
    expect(bestSkipWeek(stateWith([skip(1), skip(8)]))).toBe(1);
  });

  it('is a record, so a quiet stretch afterwards never lowers it', () => {
    const busy = [skip(1), skip(2), skip(3), skip(4)];
    const best = bestSkipWeek(stateWith(busy, 4));
    expect(best).toBe(4);
    // Sixty quiet days later it is still the same number.
    expect(bestSkipWeek(stateWith(busy, 64))).toBe(best);
  });

  it('counts several skips landing on one day', () => {
    expect(bestSkipWeek(stateWith([skip(5), skip(5), skip(5)]))).toBe(3);
  });

  it('is zero with no skips and one with a single skip', () => {
    expect(bestSkipWeek(stateWith([]))).toBe(0);
    expect(bestSkipWeek(stateWith([other(2)]))).toBe(0);
    expect(bestSkipWeek(stateWith([skip(9)]))).toBe(1);
  });

  it('finds the best window when it is not the first or the last', () => {
    const events = [skip(1), skip(20), skip(21), skip(22), skip(23), skip(50)];
    expect(bestSkipWeek(stateWith(events))).toBe(4);
  });

  it('does not care what order the events arrive in', () => {
    const a = bestSkipWeek(stateWith([skip(3), skip(1), skip(2)]));
    const b = bestSkipWeek(stateWith([skip(1), skip(2), skip(3)]));
    expect(a).toBe(b);
    expect(a).toBe(3);
  });
});
