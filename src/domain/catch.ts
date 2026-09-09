import type { Cents } from './interfaces';
import { clamp, pctOfCents } from './money';
import {
  DEFAULT_SUMMER_EARNED_CENTS,
  MAX_CATCH_PCT,
  MIN_CATCH_PCT,
  PAYCHECK_DIVISOR,
  PAYCHECK_MAX_CENTS,
  PAYCHECK_MIN_CENTS,
} from '../config';

/** Plan 4.4: clamp(round(summerEarned / 6), $50, $5,000). Blank summer means $3,000 -> $500. */
export function paycheckCentsFor(summerEarnedCents: Cents | null): Cents {
  const earned = summerEarnedCents === null || summerEarnedCents <= 0 ? DEFAULT_SUMMER_EARNED_CENTS : summerEarnedCents;
  return clamp(Math.round(earned / PAYCHECK_DIVISOR), PAYCHECK_MIN_CENTS, PAYCHECK_MAX_CENTS);
}

export function clampCatchPct(pct: number): number {
  return clamp(Math.round(pct), MIN_CATCH_PCT, MAX_CATCH_PCT);
}

/** Plan 4.4: round(paycheck * pct / 100). */
export function catchCents(paycheckCents: Cents, pct: number): Cents {
  return pctOfCents(paycheckCents, clampCatchPct(pct));
}
