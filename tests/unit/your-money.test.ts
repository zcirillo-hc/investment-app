import { describe, expect, it } from 'vitest';
import { yourMoneyCurve } from '../../src/domain/summer';
import { ASSUMED_ANNUAL_RETURN, CURVE_END_AGE, MAX_AGE, MIN_AGE } from '../../src/config';

/** R10.4: money actually put in, grown at the assumed rate to 65. */
describe('yourMoneyCurve', () => {
  it('starts at the money actually put in, not at zero', () => {
    const c = yourMoneyCurve(4149, 19);
    expect(c.values[0]).toBeCloseTo(41.49, 6);
    expect(c.putInDollars).toBeCloseTo(41.49, 6);
    expect(c.hasMoney).toBe(true);
  });

  it('runs from the current age to 65 inclusive', () => {
    const c = yourMoneyCurve(10000, 22);
    expect(c.fromAge).toBe(22);
    expect(c.ages[0]).toBe(22);
    expect(c.ages[c.ages.length - 1]).toBe(CURVE_END_AGE);
    expect(c.ages).toHaveLength(CURVE_END_AGE - 22 + 1);
  });

  it('compounds at exactly the assumed rate, no more and no less', () => {
    // MAX_AGE is 24, so an age is clamped into the app's 18 to 24 audience before it is used.
    const c = yourMoneyCurve(10000, MAX_AGE);
    expect(c.fromAge).toBe(MAX_AGE);
    expect(c.values[0]).toBeCloseTo(100, 6);
    expect(c.values[1]).toBeCloseTo(100 * (1 + ASSUMED_ANNUAL_RETURN), 6);
    expect(c.endValue).toBeCloseTo(100 * Math.pow(1 + ASSUMED_ANNUAL_RETURN, CURVE_END_AGE - MAX_AGE), 4);
  });

  it('matches a closed form over the full run', () => {
    const c = yourMoneyCurve(50000, 19);
    const years = CURVE_END_AGE - 19;
    expect(c.endValue).toBeCloseTo(500 * Math.pow(1 + ASSUMED_ANNUAL_RETURN, years), 4);
  });

  it('reports no money for zero and never goes negative', () => {
    for (const cents of [0, -1, -99999]) {
      const c = yourMoneyCurve(cents, 20);
      expect(c.hasMoney).toBe(false);
      expect(c.putInDollars).toBe(0);
      expect(Math.min(...c.values)).toBe(0);
    }
  });

  it('clamps an out of range or broken age instead of producing a bad series', () => {
    for (const age of [0, 5, 200, Number.NaN, Number.POSITIVE_INFINITY]) {
      const c = yourMoneyCurve(1000, age as number);
      expect(c.fromAge).toBeGreaterThanOrEqual(MIN_AGE);
      expect(c.fromAge).toBeLessThanOrEqual(MAX_AGE);
      expect(c.ages.length).toBeGreaterThan(0);
      expect(c.values.every((v) => Number.isFinite(v))).toBe(true);
    }
  });

  it('is monotonically increasing when there is money in', () => {
    const c = yourMoneyCurve(2500, 21);
    for (let i = 1; i < c.values.length; i++) expect(c.values[i]).toBeGreaterThan(c.values[i - 1]);
  });

  it('grows more the earlier you start, which is the whole point', () => {
    const early = yourMoneyCurve(10000, MIN_AGE);
    const late = yourMoneyCurve(10000, MAX_AGE);
    expect(early.endValue).toBeGreaterThan(late.endValue);
  });
});
