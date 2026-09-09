import { describe, expect, it } from 'vitest';
import {
  byThirtyDollars,
  isSummer,
  keepOfLeftCents,
  keptThisSummerCents,
  summerCurves,
  hadKeptEventsInSummerEndingAt,
} from '../../src/domain/summer';
import type { LedgerEvent } from '../../src/domain/types';

describe('summer curves', () => {
  it('criterion 3 totals for $3,000', () => {
    const c = summerCurves(300000);
    expect(c.ages[0]).toBe(19);
    expect(c.ages[c.ages.length - 1]).toBe(65);
    expect(c.startNow[0]).toBe(0);
    expect(c.startAt30[11]).toBe(0); // age 30 still zero
    expect(c.endNow).toBeGreaterThanOrEqual(98000);
    expect(c.endNow).toBeLessThanOrEqual(99000);
    expect(c.endAt30).toBeGreaterThanOrEqual(44000);
    expect(c.endAt30).toBeLessThanOrEqual(45000);
    expect(c.diff).toBeGreaterThan(50000);
    expect(c.diff).toBeLessThan(60000);
    expect(c.extraPutIn).toBe(3300);
    expect(c.usedDefault).toBe(false);
  });
  it('blank or zero uses the $3,000 default and says so', () => {
    expect(summerCurves(null).usedDefault).toBe(true);
    expect(summerCurves(0).usedDefault).toBe(true);
    expect(summerCurves(null).endNow).toBe(summerCurves(300000).endNow);
  });
  it('left-over copy math', () => {
    expect(keepOfLeftCents(50000)).toBe(5000);
    expect(keepOfLeftCents(null)).toBe(0);
  });
});

describe('summer window', () => {
  it('June through August, with override', () => {
    expect(isSummer('2026-06-01', null)).toBe(true);
    expect(isSummer('2026-08-31', null)).toBe(true);
    expect(isSummer('2026-09-01', null)).toBe(false);
    expect(isSummer('2026-05-31', null)).toBe(false);
    expect(isSummer('2026-01-10', 'on')).toBe(true);
    expect(isSummer('2026-07-10', 'off')).toBe(false);
  });
  it('kept this summer sums round-ups and catches since June 1', () => {
    const ev = (kind: 'RoundUp' | 'Catch' | 'Sweep', date: string, cents: number) =>
      ({ kind, id: date + kind, dayIndex: 0, date, cents }) as unknown as LedgerEvent;
    const events = [ev('RoundUp', '2026-05-31', 100), ev('RoundUp', '2026-06-01', 65), ev('Catch', '2026-07-04', 2500), ev('Sweep', '2026-07-05', 9999), ev('RoundUp', '2026-07-20', 10)];
    expect(keptThisSummerCents(events, '2026-07-10')).toBe(2565);
    expect(hadKeptEventsInSummerEndingAt(events, '2026-09-01')).toBe(true);
    expect(hadKeptEventsInSummerEndingAt([ev('RoundUp', '2026-05-31', 100)], '2026-09-01')).toBe(false);
  });
  it('by 30 uses 7% for max(1, 30 - age) years', () => {
    expect(byThirtyDollars(10000, 19)).toBe(Math.round(100 * Math.pow(1.07, 11)));
    expect(byThirtyDollars(10000, 30)).toBe(107);
    expect(byThirtyDollars(10000, 24)).toBe(Math.round(100 * Math.pow(1.07, 6)));
  });
});
