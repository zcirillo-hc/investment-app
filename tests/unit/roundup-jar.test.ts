import { describe, expect, it } from 'vitest';
import { roundUpCents, roundUpsFor } from '../../src/domain/roundup';
import { catchCents, paycheckCentsFor } from '../../src/domain/catch';

describe('round-up rule', () => {
  it('matches the 4.2 examples', () => {
    expect(roundUpCents(435)).toBe(65);
    expect(roundUpCents(999)).toBe(1);
    expect(roundUpCents(4500)).toBe(0);
    expect(roundUpCents(1)).toBe(99);
  });
  it('exact dollars emit no event and paused emits nothing', () => {
    // R2.4: every purchase now carries a minute of day, so it can become a visit (R2.3).
    const ps = [
      { id: '1-0', dayIndex: 1, merchant: 'Phone plan', category: 'subscription' as const, amountCents: 4500, minuteOfDay: 600 },
      { id: '1-1', dayIndex: 1, merchant: 'Campus Coffee', category: 'coffee' as const, amountCents: 435, minuteOfDay: 480 },
    ];
    expect(roundUpsFor(ps, false)).toEqual([{ purchase: ps[1], cents: 65 }]);
    expect(roundUpsFor(ps, true)).toEqual([]);
  });
});

// The two sweep cases that used to live here are deleted with R6.2: there is no threshold
// that moves money by itself any more, and no automatic destination replaced it. The jar's
// surviving behaviour, the goal and the two user actions, is covered by tests/unit/jar.test.ts.

describe('catch', () => {
  it('paycheck from summer earnings, clamped, default $500', () => {
    expect(paycheckCentsFor(null)).toBe(50000);
    expect(paycheckCentsFor(0)).toBe(50000);
    expect(paycheckCentsFor(300000)).toBe(50000);
    expect(paycheckCentsFor(100)).toBe(5000);
    expect(paycheckCentsFor(99_000_000)).toBe(500000);
    expect(paycheckCentsFor(100001)).toBe(16667);
  });
  it('catch rounding', () => {
    expect(catchCents(50000, 5)).toBe(2500);
    expect(catchCents(50000, 10)).toBe(5000);
    expect(catchCents(16667, 5)).toBe(833); // 833.35
    expect(catchCents(16667, 3)).toBe(500); // 500.01
    expect(catchCents(5010, 5)).toBe(251); // 250.5 -> 251
    expect(catchCents(50000, 99)).toBe(10000); // clamped to 20
  });
});
