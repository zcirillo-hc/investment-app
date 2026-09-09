import type { Cents } from './interfaces';
import type { LedgerEvent, SummerOverride } from './types';
import { isSummerMonth, yearOf } from './dates';
import {
  ASSUMED_ANNUAL_RETURN,
  CURVE_END_AGE,
  CURVE_LATE_START_AGE,
  CURVE_START_AGE,
  DEFAULT_AGE,
  DEFAULT_SUMMER_EARNED_CENTS,
  MAX_AGE,
  MIN_AGE,
  SUMMER_KEEP_RATE,
} from '../config';

export interface SummerCurves {
  ages: number[];
  startNow: number[];
  startAt30: number[];
  endNow: number;
  endAt30: number;
  diff: number;
  extraPutIn: number;
  yearlyKeep: number;
  earnedDollars: number;
  usedDefault: boolean;
}

export function effectiveSummerEarnedDollars(earnedCents: Cents | null): { dollars: number; usedDefault: boolean } {
  if (earnedCents === null || earnedCents <= 0) return { dollars: DEFAULT_SUMMER_EARNED_CENTS / 100, usedDefault: true };
  return { dollars: earnedCents / 100, usedDefault: false };
}

/** Plan v2 R10.1. Curves always start at 19 regardless of the entered age. */
export function summerCurves(earnedCents: Cents | null): SummerCurves {
  const { dollars, usedDefault } = effectiveSummerEarnedDollars(earnedCents);
  const K = SUMMER_KEEP_RATE * dollars;
  const ages: number[] = [];
  const startNow: number[] = [];
  const startAt30: number[] = [];
  let a = 0;
  let b = 0;
  for (let age = CURVE_START_AGE; age <= CURVE_END_AGE; age++) {
    ages.push(age);
    startNow.push(a);
    startAt30.push(b);
    if (age < CURVE_END_AGE) {
      a = (a + K) * (1 + ASSUMED_ANNUAL_RETURN);
      b = age >= CURVE_LATE_START_AGE ? (b + K) * (1 + ASSUMED_ANNUAL_RETURN) : 0;
    }
  }
  const endNow = startNow[startNow.length - 1];
  const endAt30 = startAt30[startAt30.length - 1];
  return {
    ages,
    startNow,
    startAt30,
    endNow,
    endAt30,
    diff: endNow - endAt30,
    extraPutIn: (CURVE_LATE_START_AGE - CURVE_START_AGE) * K,
    yearlyKeep: K,
    earnedDollars: dollars,
    usedDefault,
  };
}

export interface YourMoneyCurve {
  ages: number[];
  values: number[];
  putInDollars: number;
  endValue: number;
  fromAge: number;
  hasMoney: boolean;
}

/**
 * Plan v2 R10.4. What the user has ACTUALLY put in, left alone at the assumed rate.
 *
 * The two curves in `summerCurves` are a story about a hypothetical summer job and never move.
 * This one is grounded: it takes the money the user really kept and really recorded moving into
 * investments, and grows it from their current age to `CURVE_END_AGE`.
 *
 * Deliberately a lump sum growing, not an assumed future contribution rate. The app does not
 * know whether the user will keep going, and inventing a rate would be exactly the kind of made
 * up number v2 deleted the price series to avoid.
 */
export function yourMoneyCurve(putInCents: Cents, age: number): YourMoneyCurve {
  const fromAge = clampAge(age);
  const putInDollars = Math.max(0, putInCents) / 100;
  const ages: number[] = [];
  const values: number[] = [];
  let v = putInDollars;
  for (let a = fromAge; a <= CURVE_END_AGE; a++) {
    ages.push(a);
    values.push(v);
    if (a < CURVE_END_AGE) v = v * (1 + ASSUMED_ANNUAL_RETURN);
  }
  return {
    ages,
    values,
    putInDollars,
    endValue: values.length > 0 ? values[values.length - 1] : putInDollars,
    fromAge,
    hasMoney: putInCents > 0,
  };
}

export function clampAge(age: number): number {
  if (!Number.isFinite(age)) return DEFAULT_AGE;
  return Math.min(MAX_AGE, Math.max(MIN_AGE, Math.round(age)));
}

/** Copy only line for "how much is left" (plan v2 R10). */
export function keepOfLeftCents(leftCents: Cents | null): Cents {
  if (leftCents === null || leftCents <= 0) return 0;
  return Math.round(leftCents * SUMMER_KEEP_RATE);
}

/** Plan v2 R10, summer window. */
export function isSummer(date: string, override: SummerOverride): boolean {
  if (override === 'on') return true;
  if (override === 'off') return false;
  return isSummerMonth(date);
}

export function summerStartFor(date: string): string {
  return `${yearOf(date)}-06-01`;
}

export function summerEndFor(date: string): string {
  return `${yearOf(date)}-08-31`;
}

/** R9: sum of RoundUp, Catch and Skip amounts dated June 1 of the current simulated year through the current date. */
export function keptThisSummerCents(events: LedgerEvent[], currentDate: string): Cents {
  const start = summerStartFor(currentDate);
  let sum = 0;
  for (const e of events) {
    if ((e.kind === 'RoundUp' || e.kind === 'Catch' || e.kind === 'Skip') && e.date >= start && e.date <= currentDate) sum += e.cents;
  }
  return sum;
}

/** Whether any kept event is dated within the summer that ends just before `septemberFirstDate`. */
export function hadKeptEventsInSummerEndingAt(events: LedgerEvent[], septemberFirstDate: string): boolean {
  const start = summerStartFor(septemberFirstDate);
  const end = summerEndFor(septemberFirstDate);
  return events.some((e) => (e.kind === 'RoundUp' || e.kind === 'Catch' || e.kind === 'Skip') && e.date >= start && e.date <= end);
}

/** Plan v2 R10.2: kept * 1.07 ^ max(1, 30 - age), whole dollars. */
export function byThirtyDollars(keptCents: Cents, age: number): number {
  const years = Math.max(1, CURVE_LATE_START_AGE - age);
  return Math.round((keptCents / 100) * Math.pow(1 + ASSUMED_ANNUAL_RETURN, years));
}
