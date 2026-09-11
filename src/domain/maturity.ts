import type { Cents } from './interfaces';
import holdingRaw from '../../shared/content/holdingTypes.json';

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
// 25.00%. Was 5000. At 50% for 600 months a $1,000,000 entry matured past 2^53 cents, where a
// JavaScript number stops holding whole cents exactly (R1.1, V2-18). 25% for 50 years keeps the
// largest possible figure near 7e12 cents, exact, and still far above any real CD or bond.
export const MAX_YIELD_BPS = 2500;
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

/** R16.5. The holding type key for a bond or CD row. */
export const BONDS_CDS_KEY = 'bondsCds';
const BONDS_CDS_LABEL: string =
  (holdingRaw.holdingTypes as Array<{ key: string; label: string }>).find((h) => h.key === BONDS_CDS_KEY)?.label ?? 'Bonds or CDs';

/**
 * R16.5. Only a bonds or CDs row may carry a term and a rate. A row saved since the type was
 * stored answers by its `holdingType`. A row saved before that (R16 shipped one cycle earlier
 * without it) has no type, and is recognised by the label the capture wrote into `what`.
 */
export function isBondRow(e: { holdingType?: string; what: string }): boolean {
  if (e.holdingType !== undefined) return e.holdingType === BONDS_CDS_KEY;
  return e.what.trim().toLowerCase() === BONDS_CDS_LABEL.toLowerCase();
}

export type Parsed = { kind: 'empty' } | { kind: 'ok'; value: number } | { kind: 'invalid' };

/** R16.2, V2-11. Whole months only. "12.5" is refused rather than rounded to 13. */
export function parseTermMonths(text: string): Parsed {
  const t = text.trim();
  if (t === '') return { kind: 'empty' };
  if (!/^\d+$/.test(t)) return { kind: 'invalid' };
  const n = Number(t);
  return isUsableTerm(n) ? { kind: 'ok', value: n } : { kind: 'invalid' };
}

/**
 * R16.2, V2-11. A rate as people type it: "4.5", "4.5%", "4,5". Read as an exact decimal
 * string, never through floating point, because 1.005 * 100 is 100.49999 in a double and a
 * plain Math.round would store 1.00%. Rounded half away from zero to a whole basis point (R1.2).
 */
export function parseRateBps(text: string): Parsed {
  const t = text.trim().replace(/\s*%$/, '').replace(',', '.').trim();
  if (t === '') return { kind: 'empty' };
  const m = /^(\d+)(?:\.(\d+))?$/.exec(t);
  if (!m) return { kind: 'invalid' };
  const frac = m[2] ?? '';
  const bps = Number(m[1]) * 100 + Number((frac + '00').slice(0, 2)) + (frac.length > 2 && Number(frac[2]) >= 5 ? 1 : 0);
  return isUsableYield(bps) ? { kind: 'ok', value: bps } : { kind: 'invalid' };
}
