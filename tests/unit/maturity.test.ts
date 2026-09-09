import { describe, expect, it } from 'vitest';
import { MAX_TERM_MONTHS, MAX_YIELD_BPS, formatTerm, formatYield, isUsableTerm, isUsableYield, maturityOf } from '../../src/domain/maturity';

/** R16: what a CD or bond pays if held to the end. Arithmetic on the user's own two numbers. */
describe('maturityOf', () => {
  it('pays exactly the rate over one year', () => {
    const m = maturityOf(100000, 450, 12)!; // $1,000 at 4.50% for 12 months
    expect(m.valueAtMaturityCents).toBe(104500);
    expect(m.interestCents).toBe(4500);
    expect(m.years).toBe(1);
  });

  it('compounds over multiple years rather than adding simple interest', () => {
    const m = maturityOf(100000, 500, 24)!; // 5% for 2 years
    expect(m.valueAtMaturityCents).toBe(110250); // 1000 * 1.05^2, not 1100
    expect(m.interestCents).toBe(10250);
  });

  it('handles a part year term', () => {
    const m = maturityOf(100000, 400, 6)!; // 4% for 6 months
    expect(m.valueAtMaturityCents).toBe(Math.round(100000 * Math.pow(1.04, 0.5)));
    expect(m.interestCents).toBeGreaterThan(0);
    expect(m.interestCents).toBeLessThan(4000);
  });

  it('returns whole cents, never a fraction', () => {
    for (const [p, y, t] of [[3333, 437, 7], [99999, 123, 13], [1, 1, 1]] as const) {
      const m = maturityOf(p, y, t);
      if (m) expect(Number.isInteger(m.valueAtMaturityCents)).toBe(true);
    }
  });

  it('refuses nonsense instead of showing a number', () => {
    expect(maturityOf(0, 450, 12)).toBeNull();
    expect(maturityOf(-100, 450, 12)).toBeNull();
    expect(maturityOf(100000, 0, 12)).toBeNull();
    expect(maturityOf(100000, -5, 12)).toBeNull();
    expect(maturityOf(100000, 450, 0)).toBeNull();
    expect(maturityOf(100000, 450, -3)).toBeNull();
    expect(maturityOf(Number.NaN, 450, 12)).toBeNull();
    expect(maturityOf(Number.POSITIVE_INFINITY, 450, 12)).toBeNull();
    expect(maturityOf(100000, 450.5, 12)).toBeNull();
    expect(maturityOf(100000, 450, 12.5)).toBeNull();
  });

  it('rejects a rate or term past the sanity ceiling, which is usually a typo', () => {
    expect(maturityOf(100000, MAX_YIELD_BPS + 1, 12)).toBeNull();
    expect(maturityOf(100000, 450, MAX_TERM_MONTHS + 1)).toBeNull();
    expect(maturityOf(100000, MAX_YIELD_BPS, 12)).not.toBeNull();
    expect(maturityOf(100000, 450, MAX_TERM_MONTHS)).not.toBeNull();
  });

  it('never pays less than the principal for a positive rate', () => {
    for (const t of [1, 6, 12, 60, 120]) {
      const m = maturityOf(50000, 300, t)!;
      expect(m.valueAtMaturityCents).toBeGreaterThanOrEqual(50000);
      expect(m.interestCents).toBeGreaterThanOrEqual(0);
    }
  });

  it('guards agree with the calculator', () => {
    expect(isUsableYield(450)).toBe(true);
    expect(isUsableYield(0)).toBe(false);
    expect(isUsableTerm(12)).toBe(true);
    expect(isUsableTerm(0)).toBe(false);
  });
});

describe('formatting', () => {
  it('shows a rate to two places without float drift', () => {
    expect(formatYield(450)).toBe('4.50%');
    expect(formatYield(5)).toBe('0.05%');
    expect(formatYield(1234)).toBe('12.34%');
  });

  it('says years when the term divides evenly and months when it does not', () => {
    expect(formatTerm(12)).toBe('1 year');
    expect(formatTerm(24)).toBe('2 years');
    expect(formatTerm(18)).toBe('18 months');
    expect(formatTerm(1)).toBe('1 month');
    expect(formatTerm(6)).toBe('6 months');
  });
});
