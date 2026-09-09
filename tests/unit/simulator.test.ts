import { describe, expect, it } from 'vitest';
import { createSimulatedTransactionSource, isPaycheckDue } from '../../src/domain/simulator';
import { MERCHANTS } from '../../src/data/merchants';

const src = createSimulatedTransactionSource();
const ctx = (seed: number) => ({ seed, paycheckCents: 50000, startDate: '2026-06-15' });

describe('simulator', () => {
  it('is deterministic for the same seed and day', () => {
    const a = src.purchasesForDay(9, ctx(42));
    const b = src.purchasesForDay(9, ctx(42));
    expect(a).toEqual(b);
    expect(src.purchasesForDay(9, ctx(7))).not.toEqual(a);
  });
  it('is per-day independent (day 9 identical whether or not days 0 to 8 ran)', () => {
    const fresh = createSimulatedTransactionSource();
    const direct = fresh.purchasesForDay(9, ctx(42));
    const other = createSimulatedTransactionSource();
    for (let d = 0; d <= 8; d++) other.purchasesForDay(d, ctx(42));
    expect(other.purchasesForDay(9, ctx(42))).toEqual(direct);
  });
  it('day 0 has no purchases; weekdays 2 to 4, weekends 1 to 3 (plus subscriptions)', () => {
    expect(src.purchasesForDay(0, ctx(42))).toEqual([]);
    for (let d = 1; d < 60; d++) {
      const ps = src.purchasesForDay(d, ctx(42)).filter((p) => p.category !== 'subscription');
      const date = new Date(Date.UTC(2026, 5, 15 + d)).getUTCDay();
      const weekday = date >= 1 && date <= 5;
      expect(ps.length).toBeGreaterThanOrEqual(weekday ? 2 : 1);
      expect(ps.length).toBeLessThanOrEqual(weekday ? 4 : 3);
      ps.forEach((p, i) => expect(p.id).toBe(`${d}-${i}`));
    }
  });
  it('subscriptions land on fixed days of month, phone plan is an exact dollar', () => {
    // start 2026-06-15: 20th is day 5, July 5 is day 20, July 12 is day 27
    const d5 = src.purchasesForDay(5, ctx(42)).find((p) => p.merchant === 'Phone plan');
    expect(d5?.amountCents).toBe(4500);
    expect(src.purchasesForDay(20, ctx(42)).some((p) => p.merchant === 'Spotify' && p.amountCents === 1199)).toBe(true);
    expect(src.purchasesForDay(27, ctx(42)).some((p) => p.merchant === 'Streaming' && p.amountCents === 1549)).toBe(true);
    expect(src.purchasesForDay(6, ctx(42)).some((p) => p.category === 'subscription')).toBe(false);
  });
  it('groceries at most twice a week', () => {
    for (const seed of [42, 7, 1]) {
      for (let w = 0; w < 12; w++) {
        let count = 0;
        for (let d = w * 7; d < w * 7 + 7; d++) {
          count += src.purchasesForDay(d, ctx(seed)).filter((p) => p.category === 'groceries').length;
        }
        expect(count).toBeLessThanOrEqual(2);
      }
    }
  });
  it('paychecks are due on days 3, 17, 31 and not 0 or 16', () => {
    expect(isPaycheckDue(0)).toBe(false);
    expect(isPaycheckDue(3)).toBe(true);
    expect(isPaycheckDue(16)).toBe(false);
    expect(isPaycheckDue(17)).toBe(true);
    expect(isPaycheckDue(31)).toBe(true);
    expect(src.paycheckForDay(3, ctx(42))).toEqual({ id: 'pay-3', dayIndex: 3, amountCents: 50000, source: 'schedule' });
    expect(src.paycheckForDay(4, ctx(42))).toBeNull();
  });
  /**
   * The v1 version of this counted sweeps. There is no sweep in v2 (R6.2), so it counts what
   * the feed actually produces instead: the jar still fills from round-ups at a rate that
   * crosses the default $25 goal several times over sixty days, which is the property the
   * original case was really protecting.
   */
  it('60 days produces a purchase feed dense enough to find habits at seeds 42 and 7', () => {
    // Round-ups used to be what this guarded: their total over 60 days proved the feed was
    // tuned. Nothing rounds up any more, but the feed still has to be dense enough for a place
    // to reach the 3 visits in 14 days that makes it a habit, so the same tuning still matters
    // and this now measures it directly.
    for (const seed of [42, 7]) {
      let purchases = 0;
      for (let d = 1; d <= 60; d++) purchases += src.purchasesForDay(d, ctx(seed)).length;
      expect(purchases, `seed ${seed}`).toBeGreaterThan(60);
      expect(purchases, `seed ${seed}`).toBeLessThan(600);
    }
  });

  /** Plan v2 R2.4: every purchase carries a minute of day, and the same seed gives the same one. */
  describe('R2.4 minute of day', () => {
    it('puts a minute on every purchase, inside the day', () => {
      for (const p of src.purchasesForDay(3, ctx(42))) {
        expect(Number.isInteger(p.minuteOfDay), p.merchant).toBe(true);
        expect(p.minuteOfDay).toBeGreaterThanOrEqual(0);
        expect(p.minuteOfDay).toBeLessThanOrEqual(1439);
      }
    });

    it('is deterministic for a seed, a day and a merchant', () => {
      const a = src.purchasesForDay(3, ctx(42)).map((p) => [p.merchant, p.minuteOfDay]);
      const b = src.purchasesForDay(3, ctx(42)).map((p) => [p.merchant, p.minuteOfDay]);
      expect(a).toEqual(b);
    });

    it('differs across days and across seeds, so the feed is not one repeated day', () => {
      const day3 = src.purchasesForDay(3, ctx(42)).map((p) => p.minuteOfDay);
      const day4 = src.purchasesForDay(4, ctx(42)).map((p) => p.minuteOfDay);
      const otherSeed = src.purchasesForDay(3, ctx(7)).map((p) => p.minuteOfDay);
      expect(day3.join()).not.toBe(day4.join());
      expect(day3.join()).not.toBe(otherSeed.join());
    });

    it('clusters around the merchant usual minute, which is what makes habits detectable', () => {
      const minutes: number[] = [];
      for (let d = 1; d <= 40; d++) {
        for (const p of src.purchasesForDay(d, ctx(42))) {
          if (p.merchant === MERCHANTS[0].name) minutes.push(p.minuteOfDay);
        }
      }
      expect(minutes.length).toBeGreaterThan(3);
      const usual = MERCHANTS[0].usualMinute;
      const far = minutes.filter((m) => Math.abs(m - usual) > MERCHANTS[0].minuteSpread * 4);
      expect(far).toEqual([]);
    });
  });
});
