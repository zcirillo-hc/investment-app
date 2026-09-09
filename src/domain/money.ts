import type { Cents } from './interfaces';

export function withCommas(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** $1,234.56 ; negatives render -$0.37 */
export function formatCents(cents: Cents): string {
  const rounded = Math.round(cents);
  const neg = rounded < 0;
  const abs = Math.abs(rounded);
  const dollars = Math.floor(abs / 100);
  const rem = abs % 100;
  return `${neg ? '-' : ''}$${withCommas(dollars)}.${String(rem).padStart(2, '0')}`;
}

/** +$0.37 or -$0.37. Zero renders +$0.00 (always signed, plan 4.8). */
export function formatSignedCents(cents: Cents): string {
  const rounded = Math.round(cents);
  return rounded < 0 ? formatCents(rounded) : `+${formatCents(rounded)}`;
}

/** Whole dollars with thousands separators: $98,460 */
export function formatDollars(dollars: number): string {
  const r = Math.round(dollars);
  return `${r < 0 ? '-' : ''}$${withCommas(Math.abs(r))}`;
}

export function formatPct(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`;
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** Math.round(cents * pct / 100), pct an integer 0..100 */
export function pctOfCents(cents: Cents, pct: number): Cents {
  return Math.round((cents * pct) / 100);
}

/** Parses "3000", "$3,000", "3000.50" to cents. Empty or invalid returns null. */
export function parseDollarInput(raw: string): Cents | null {
  const cleaned = raw.replace(/[$,\s]/g, '');
  if (cleaned === '') return null;
  if (!/^\d*(\.\d{0,2})?$/.test(cleaned)) return null;
  if (cleaned === '.') return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

export function isIntegerCents(n: number): boolean {
  return Number.isInteger(n);
}

/**
 * Plan v2 R1.2: rounding is half away from zero on non negative inputs, and the money path
 * rejects a negative. `Math.round` is half up, which is the same thing for a non negative
 * input.
 */
export function roundCents(value: number): Cents {
  if (!(value >= 0)) throw new Error(`roundCents: expected a non-negative amount, got ${value}`);
  return Math.round(value);
}

/**
 * Plan v2 R1.3: an average rounds per R1.2 after the division, never before. Both operands
 * are non negative integers, and a zero count is a caller error rather than a zero result.
 */
export function averageCents(sumCents: Cents, count: number): Cents {
  if (count <= 0) throw new Error(`averageCents: expected a positive count, got ${count}`);
  return roundCents(sumCents / count);
}

/** Plan v2 R1.4: ordinal (byte wise) string comparison, used wherever a rule names a tie break. */
export function compareOrdinal(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
