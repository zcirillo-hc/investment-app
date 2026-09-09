// Plan v2 R5.1 and R5.2. The estimate, its window, its ordering and its rounding.
import { describe, expect, it } from 'vitest';
import type { PlaceVisit } from '../../src/domain/interfaces';
import { estimateCentsFor, estimateFromAmounts, hasPricedVisit, pricedVisitsFor } from '../../src/domain/estimate';

function v(id: string, dayIndex: number, amountCents: number | null, placeId = 'p'): PlaceVisit {
  return { id, placeId, displayName: 'P', dayIndex, date: '2026-06-15', minuteOfDay: 480, amountCents };
}

describe('R5.1 which visits count', () => {
  it('takes only the named place', () => {
    const visits = [v('a', 10, 500), v('b', 10, 900, 'other')];
    expect(pricedVisitsFor(visits, 'p', 10).map((x) => x.id)).toEqual(['a']);
  });

  it('takes only visits with a known amount', () => {
    const visits = [v('a', 10, 500), v('b', 10, null)];
    expect(pricedVisitsFor(visits, 'p', 10).map((x) => x.id)).toEqual(['a']);
  });

  it('is the 60 day window ending on the day, inclusive at both ends', () => {
    const visits = [v('old', 39, 500), v('edge', 40, 500), v('today', 100, 500)];
    expect(pricedVisitsFor(visits, 'p', 100).map((x) => x.id)).toEqual(['today', 'edge']);
  });

  it('excludes a visit dated after today', () => {
    expect(pricedVisitsFor([v('future', 11, 500)], 'p', 10)).toHaveLength(0);
  });

  it('orders by day descending, then by visit id descending', () => {
    const visits = [v('10-0', 10, 500), v('10-1', 10, 500), v('9-0', 9, 500)];
    expect(pricedVisitsFor(visits, 'p', 10).map((x) => x.id)).toEqual(['10-1', '10-0', '9-0']);
  });
});

describe('R5.1 the average', () => {
  it('averages the last five and rounds half away from zero', () => {
    expect(estimateFromAmounts([435, 500, 389])).toBe(441);
  });

  it('rounds a half cent up rather than to even', () => {
    // 883 / 2 = 441.5.
    expect(estimateFromAmounts([441, 442])).toBe(442);
  });

  it('divides then rounds, never the other way round', () => {
    // Rounding each of these first would give 1, and their average is 0.67 which rounds to 1
    // either way; the case that separates the two is a sum that is not a multiple of the count.
    expect(estimateFromAmounts([1, 1, 2])).toBe(1);
    expect(estimateFromAmounts([1, 2, 2])).toBe(2);
  });

  it('uses at most five visits, so a sixth cannot move it', () => {
    const five = [v('20-0', 20, 500), v('19-0', 19, 500), v('18-0', 18, 500), v('17-0', 17, 500), v('16-0', 16, 500)];
    expect(estimateCentsFor(five, 'p', 20)).toBe(500);
    expect(estimateCentsFor([...five, v('15-0', 15, 100_000)], 'p', 20)).toBe(500);
  });

  it('uses fewer than five when that is all there is', () => {
    expect(estimateCentsFor([v('20-0', 20, 435)], 'p', 20)).toBe(435);
  });
});

describe('R5.2 no priced visit, no estimate and no nudge', () => {
  it('is null for an empty set', () => {
    expect(estimateFromAmounts([])).toBeNull();
    expect(estimateCentsFor([], 'p', 20)).toBeNull();
  });

  it('is null when every visit is unpriced', () => {
    expect(estimateCentsFor([v('a', 20, null)], 'p', 20)).toBeNull();
  });

  it('is null when every priced visit is outside the window', () => {
    expect(estimateCentsFor([v('a', 20, 500)], 'p', 100)).toBeNull();
  });

  it('R3.6: eligibility is exactly "there is a priced visit"', () => {
    expect(hasPricedVisit([v('a', 20, 500)], 'p', 20)).toBe(true);
    expect(hasPricedVisit([v('a', 20, null)], 'p', 20)).toBe(false);
    expect(hasPricedVisit([v('a', 20, 500)], 'p', 100)).toBe(false);
  });
});
