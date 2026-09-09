import { describe, expect, it } from 'vitest';
import { clamp, formatCents, formatDollars, formatSignedCents, parseDollarInput, pctOfCents } from '../../src/domain/money';

describe('money', () => {
  it('formats cents with commas and two decimals', () => {
    expect(formatCents(123456)).toBe('$1,234.56');
    expect(formatCents(0)).toBe('$0.00');
    expect(formatCents(5)).toBe('$0.05');
    expect(formatCents(100000000)).toBe('$1,000,000.00');
  });
  it('formats negatives as -$0.37', () => {
    expect(formatCents(-37)).toBe('-$0.37');
    expect(formatCents(-123456)).toBe('-$1,234.56');
  });
  it('signed formatting', () => {
    expect(formatSignedCents(37)).toBe('+$0.37');
    expect(formatSignedCents(-37)).toBe('-$0.37');
    expect(formatSignedCents(0)).toBe('+$0.00');
  });
  it('whole dollars', () => {
    expect(formatDollars(98460.4)).toBe('$98,460');
    expect(formatDollars(0)).toBe('$0');
  });
  it('clamp', () => {
    expect(clamp(5, 1, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(clamp(2, 0, 3)).toBe(2);
  });
  it('percent of cents rounds half away from zero on positives', () => {
    expect(pctOfCents(50000, 5)).toBe(2500);
    expect(pctOfCents(1001, 5)).toBe(50); // 50.05 -> 50
    expect(pctOfCents(1010, 5)).toBe(51); // 50.5 -> 51
    expect(pctOfCents(999, 20)).toBe(200); // 199.8 -> 200
  });
  it('parses dollar input', () => {
    expect(parseDollarInput('3000')).toBe(300000);
    expect(parseDollarInput('$3,000')).toBe(300000);
    expect(parseDollarInput('12.5')).toBe(1250);
    expect(parseDollarInput('')).toBeNull();
    expect(parseDollarInput('abc')).toBeNull();
    expect(parseDollarInput('1.234')).toBeNull();
  });
});
