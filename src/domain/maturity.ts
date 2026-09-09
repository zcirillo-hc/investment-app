import type { Cents } from './interfaces';

/**
 * Plan v2 R16. What a CD or bond pays if it is held to the end.
 *
 * This is deliberately NOT the same kind of number as the 7% curves in `summer.ts`, and the
 * distinction is the whole reason it is allowed to exist under R15. A stock projection is a
 * guess about markets. A CD's rate is a contract: the user types the rate their bank is
 * actually paying and the term they actually signed up for, and this does the arithmetic on
 * their own two numbers. Nothing here predicts anything.
 *
 * What it still cannot promise is stated in the copy next to it: holding to the end is an
 * assumption, and an issuer that does not pay is a real thing that this does not model.
 */
export interface Maturity {
  principalCents: Cents;
  yieldBps: number;
  termMonths: number;
  years: number;
  valueAtMaturityCents: Cents;
  interestCents: Cents;
}

/** Rates above this are almost certainly a typo (a user typing 450 meaning 4.50%). */
export const MAX_YIELD_BPS = 5000; // 50.00%
export const MAX_TERM_MONTHS = 600; // 50 years

export function isUsableTerm(termMonths: number | null | undefined): boolean {
  return typeof termMonths === 'number' && Number.isInteger(termMonths) && termMonths > 0 && termMonths <= MAX_TERM_MONTHS;
}

export function isUsableYield(yieldBps: number | null | undefined): boolean {
  return typeof yieldBps === 'number' && Number.isInteger(yieldBps) && yieldBps > 0 && yieldBps <= MAX_YIELD_BPS;
}

/**
 * R16.1. `value = principal * (1 + apy) ^ (months / 12)`, rounded to whole cents.
 * An APY already accounts for the compounding the bank does, so raising it to the term in
 * years is the right shape and does not need a compounding frequency of its own.
 */
export function maturityOf(principalCents: Cents, yieldBps: number, termMonths: number): Maturity | null {
  if (!Number.isFinite(principalCents) || principalCents <= 0) return null;
  if (!isUsableYield(yieldBps) || !isUsableTerm(termMonths)) return null;
  const years = termMonths / 12;
  const apy = yieldBps / 10000;
  const value = Math.round(principalCents * Math.pow(1 + apy, years));
  return {
    principalCents,
    yieldBps,
    termMonths,
    years,
    valueAtMaturityCents: value,
    interestCents: value - principalCents,
  };
}

/** R16.2. "4.50%" from 450 basis points, without floating point drift in the display. */
export function formatYield(yieldBps: number): string {
  return `${(yieldBps / 100).toFixed(2)}%`;
}

/** R16.2. "18 months" or "2 years" where the term divides evenly, which is how people say it. */
export function formatTerm(termMonths: number): string {
  if (termMonths % 12 === 0) {
    const y = termMonths / 12;
    return y === 1 ? '1 year' : `${y} years`;
  }
  return termMonths === 1 ? '1 month' : `${termMonths} months`;
}
