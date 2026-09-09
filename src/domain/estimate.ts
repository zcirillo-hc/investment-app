// Plan v2 R5. The estimated amount a skip is worth. Pure TypeScript.
import type { Cents, PlaceVisit } from './interfaces';
import { averageCents, compareOrdinal } from './money';
import { ESTIMATE_MAX_VISITS, ESTIMATE_WINDOW_DAYS } from '../config';

/**
 * Plan v2 R5.1: the visits at `placeId` with a known amount inside the 60 day window ending
 * on `dayIndex`, ordered newest first. The tie break is `dayIndex` descending then visit id
 * descending, by ordinal string comparison (R1.4), so the same five are picked every time.
 */
export function pricedVisitsFor(visits: PlaceVisit[], placeId: string, dayIndex: number): PlaceVisit[] {
  const lo = dayIndex - ESTIMATE_WINDOW_DAYS;
  return visits
    .filter((v) => v.placeId === placeId && v.amountCents !== null && v.dayIndex >= lo && v.dayIndex <= dayIndex)
    .sort((a, b) => (b.dayIndex - a.dayIndex) || compareOrdinal(b.id, a.id));
}

/**
 * Plan v2 R5.1 and R5.2: the average of the last five priced visits, rounded per R1.2 and
 * R1.3. An empty set has no estimate, which is also what makes a place nudge ineligible
 * (R3.6).
 */
export function estimateCentsFor(visits: PlaceVisit[], placeId: string, dayIndex: number): Cents | null {
  const priced = pricedVisitsFor(visits, placeId, dayIndex).slice(0, ESTIMATE_MAX_VISITS);
  if (priced.length === 0) return null;
  let sum = 0;
  for (const v of priced) sum += v.amountCents ?? 0;
  return averageCents(sum, priced.length);
}

/** Plan v2 R3.6: a habit is nudge eligible only if it has at least one priced visit. */
export function hasPricedVisit(visits: PlaceVisit[], placeId: string, dayIndex: number): boolean {
  return pricedVisitsFor(visits, placeId, dayIndex).length > 0;
}

/**
 * Plan v2 R5.1, exposed for the rule fixture: the average of a list of amounts that has
 * already been windowed and truncated to five.
 */
export function estimateFromAmounts(amounts: Cents[]): Cents | null {
  if (amounts.length === 0) return null;
  let sum = 0;
  for (const a of amounts) sum += a;
  return averageCents(sum, amounts.length);
}
