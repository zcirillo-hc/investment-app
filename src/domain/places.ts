// Plan v2 R2.2, R2.3, R2.5, R11.3. Place identity, visit recording, pruning and deletion.
// Pure TypeScript: no React, no platform imports.
import type { Cents, LocationSource, LocationSourceKind, PlaceVisit, Purchase, SimContext } from './interfaces';
import type { Place } from './types';
import { simDate } from './dates';
import { SUBSCRIPTION_NAMES } from '../data/merchants';
import { VISIT_RETENTION_DAYS } from '../config';

/**
 * Plan v2 R2.2: a place id is the merchant name normalized. Trim, collapse internal
 * whitespace runs to a single space, then lowercase. Merchant names are ASCII by
 * construction, so there is no locale sensitive casing to worry about.
 */
export function placeIdFor(merchantName: string): string {
  return merchantName.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Plan v2 R2.3: a recurring charge is not somewhere you went. */
export function isSubscriptionMerchant(merchantName: string): boolean {
  return SUBSCRIPTION_NAMES.includes(merchantName);
}

/**
 * Plan v2 R2.3: every simulated purchase produces exactly one visit at that place, except
 * subscriptions. This is the mechanism by which habit detection works with no location
 * permission at all, so it lives in the domain rather than behind the location source.
 */
export function visitsForPurchases(purchases: Purchase[], startDate: string): PlaceVisit[] {
  const out: PlaceVisit[] = [];
  for (const p of purchases) {
    if (p.category === 'subscription' || isSubscriptionMerchant(p.merchant)) continue;
    out.push({
      id: `${p.dayIndex}-${out.length}`,
      placeId: placeIdFor(p.merchant),
      displayName: p.merchant,
      dayIndex: p.dayIndex,
      date: simDate(startDate, p.dayIndex),
      minuteOfDay: p.minuteOfDay,
      amountCents: p.amountCents,
    });
  }
  return out;
}

/**
 * Plan v2 R2.2: the display name is the first spelling seen, so an existing place keeps its
 * name even if a later feed spells it differently.
 */
export function upsertPlaces(places: Place[], visits: PlaceVisit[], location: LocationSource | null): Place[] {
  if (visits.length === 0) return places;
  const byId = new Map(places.map((p) => [p.id, p]));
  for (const v of visits) {
    const existing = byId.get(v.placeId);
    if (existing) {
      byId.set(v.placeId, {
        ...existing,
        lastSeenDay: Math.max(existing.lastSeenDay, v.dayIndex),
        firstSeenDay: Math.min(existing.firstSeenDay, v.dayIndex),
      });
    } else {
      byId.set(v.placeId, {
        id: v.placeId,
        displayName: v.displayName,
        firstSeenDay: v.dayIndex,
        lastSeenDay: v.dayIndex,
        // R3.7: display only, and null on web. It never decides anything.
        coarseLabel: location ? location.coarseLabelFor(v.placeId) : null,
      });
    }
  }
  // R1.4: a total, explicit order so the two implementations cannot differ by iteration order.
  return [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * Plan v2 R2.5: visits are retained for 90 simulated days and older ones are pruned on tick.
 * Pruning never removes a Skip event or a ledger entry, which is why it only ever sees visits.
 */
export function pruneVisits(visits: PlaceVisit[], dayIndex: number): PlaceVisit[] {
  const cutoff = dayIndex - VISIT_RETENTION_DAYS;
  if (visits.length === 0 || visits[0].dayIndex > cutoff) return visits;
  return visits.filter((v) => v.dayIndex > cutoff);
}

/** Plan v2 R3.1: the visits at one place inside the 14 day window ending on `dayIndex`. */
export function visitsInWindow(visits: PlaceVisit[], placeId: string, dayIndex: number, windowDays: number): PlaceVisit[] {
  const lo = dayIndex - (windowDays - 1);
  return visits.filter((v) => v.placeId === placeId && v.dayIndex >= lo && v.dayIndex <= dayIndex);
}

export function visitCountInWindow(visits: PlaceVisit[], placeId: string, dayIndex: number, windowDays: number): number {
  return visitsInWindow(visits, placeId, dayIndex, windowDays).length;
}

export interface PlaceDeletion {
  places: Place[];
  visits: PlaceVisit[];
  mutedPlaceIds: string[];
}

/**
 * Plan v2 R11.3: deleting a place removes the place record, its coordinate and all of its
 * visits. Past Skip events keep their stored display name and amount, because they are the
 * user's record of money they kept, so this function never touches the event log.
 */
export function deletePlace(places: Place[], visits: PlaceVisit[], mutedPlaceIds: string[], placeId: string): PlaceDeletion {
  return {
    places: places.filter((p) => p.id !== placeId),
    visits: visits.filter((v) => v.placeId !== placeId),
    mutedPlaceIds: mutedPlaceIds.filter((id) => id !== placeId),
  };
}

/** Plan v2 R11.4: the same, for every place at once. */
export function deleteAllPlaces(): PlaceDeletion {
  return { places: [], visits: [], mutedPlaceIds: [] };
}

/**
 * Plan v2 section 5.1. The web ships this implementation only. It derives visits from the
 * same purchase feed the transaction source produces, so nothing about the loop depends on a
 * location permission ever being granted.
 */
export function createSimulatedLocationSource(): LocationSource {
  return {
    kind(): LocationSourceKind {
      return 'simulated';
    },
    isAvailable(): boolean {
      return false;
    },
    visitsForDay(_dayIndex: number, ctx: SimContext, purchases: Purchase[]): PlaceVisit[] {
      return visitsForPurchases(purchases, ctx.startDate);
    },
    coarseLabelFor(): string | null {
      return null;
    },
  };
}

/** Total amount seen at a place, for the Places screen. Never used in a rule. */
export function totalSpentAtPlace(visits: PlaceVisit[], placeId: string): Cents {
  let sum = 0;
  for (const v of visits) if (v.placeId === placeId && v.amountCents !== null) sum += v.amountCents;
  return sum;
}
