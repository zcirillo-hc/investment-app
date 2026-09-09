// Plan v2 R2.2, R2.3, R2.5, R3.7, R11.3 and R11.4.
import { describe, expect, it } from 'vitest';
import type { PlaceVisit, Purchase } from '../../src/domain/interfaces';
import type { Place } from '../../src/domain/types';
import {
  createSimulatedLocationSource,
  deleteAllPlaces,
  deletePlace,
  isSubscriptionMerchant,
  placeIdFor,
  pruneVisits,
  totalSpentAtPlace,
  upsertPlaces,
  visitCountInWindow,
  visitsForPurchases,
  visitsInWindow,
} from '../../src/domain/places';

function purchase(over: Partial<Purchase> = {}): Purchase {
  return { id: '1-0', dayIndex: 1, merchant: 'Corner Espresso', category: 'coffee', amountCents: 435, minuteOfDay: 480, ...over };
}

function visit(over: Partial<PlaceVisit> = {}): PlaceVisit {
  return {
    id: '1-0',
    placeId: 'corner espresso',
    displayName: 'Corner Espresso',
    dayIndex: 1,
    date: '2026-06-16',
    minuteOfDay: 480,
    amountCents: 435,
    ...over,
  };
}

describe('R2.2 place identity', () => {
  it('trims, collapses whitespace runs and lowercases', () => {
    expect(placeIdFor('  Corner   Espresso  ')).toBe('corner espresso');
  });

  it('is stable across spellings that differ only in case and spacing', () => {
    expect(placeIdFor('CORNER ESPRESSO')).toBe(placeIdFor('corner espresso'));
    expect(placeIdFor('Corner\tEspresso')).toBe('corner espresso');
  });

  it('keeps the first spelling seen as the display name', () => {
    const first = upsertPlaces([], [visit({ displayName: 'Corner Espresso' })], null);
    const second = upsertPlaces(first, [visit({ dayIndex: 2, displayName: 'CORNER ESPRESSO' })], null);
    expect(second).toHaveLength(1);
    expect(second[0].displayName).toBe('Corner Espresso');
  });

  it('widens first and last seen rather than overwriting them', () => {
    const a = upsertPlaces([], [visit({ dayIndex: 5 })], null);
    const b = upsertPlaces(a, [visit({ dayIndex: 2 })], null);
    const c = upsertPlaces(b, [visit({ dayIndex: 9 })], null);
    expect(c[0].firstSeenDay).toBe(2);
    expect(c[0].lastSeenDay).toBe(9);
  });

  it('R1.4: returns places in place id order, so iteration order cannot change a result', () => {
    const out = upsertPlaces(
      [],
      [visit({ placeId: 'zed diner', displayName: 'Zed Diner' }), visit({ placeId: 'alpha cafe', displayName: 'Alpha Cafe' })],
      null,
    );
    expect(out.map((p) => p.id)).toEqual(['alpha cafe', 'zed diner']);
  });

  it('returns the same array when there is nothing to add', () => {
    const places: Place[] = [];
    expect(upsertPlaces(places, [], null)).toBe(places);
  });
});

describe('R2.3 visits', () => {
  it('makes exactly one visit per non subscription purchase', () => {
    const out = visitsForPurchases([purchase(), purchase({ id: '1-1', merchant: 'Campus Coffee' })], '2026-06-15');
    expect(out).toHaveLength(2);
    expect(out.map((v) => v.placeId)).toEqual(['corner espresso', 'campus coffee']);
  });

  it('makes no visit for a subscription, because a recurring charge is not somewhere you went', () => {
    const out = visitsForPurchases([purchase({ merchant: 'Spotify', category: 'subscription' })], '2026-06-15');
    expect(out).toHaveLength(0);
  });

  it('carries the day, the date, the minute and the amount onto the visit', () => {
    const [v] = visitsForPurchases([purchase({ dayIndex: 3, minuteOfDay: 512, amountCents: 389 })], '2026-06-15');
    expect(v).toMatchObject({ dayIndex: 3, date: '2026-06-18', minuteOfDay: 512, amountCents: 389 });
  });

  it('names every subscription merchant the feed can produce', () => {
    expect(isSubscriptionMerchant('Spotify')).toBe(true);
    expect(isSubscriptionMerchant('Corner Espresso')).toBe(false);
  });
});

describe('R2.5 pruning', () => {
  it('keeps visits inside the 90 day window and drops the rest', () => {
    const visits = [visit({ dayIndex: 5 }), visit({ dayIndex: 11 }), visit({ dayIndex: 95 })];
    expect(pruneVisits(visits, 100).map((v) => v.dayIndex)).toEqual([11, 95]);
  });

  it('keeps a visit exactly on the boundary out and the next one in', () => {
    // cutoff is dayIndex - 90, and the filter is strictly greater than the cutoff.
    expect(pruneVisits([visit({ dayIndex: 10 })], 100)).toHaveLength(0);
    expect(pruneVisits([visit({ dayIndex: 11 })], 100)).toHaveLength(1);
  });

  it('returns the same array when nothing is old enough to prune', () => {
    const visits = [visit({ dayIndex: 99 })];
    expect(pruneVisits(visits, 100)).toBe(visits);
  });
});

describe('R3.1 the window', () => {
  const visits = [visit({ dayIndex: 0 }), visit({ dayIndex: 6 }), visit({ dayIndex: 7 }), visit({ dayIndex: 20 })];

  it('is the 14 days ending on the current day, inclusive at both ends', () => {
    expect(visitsInWindow(visits, 'corner espresso', 20, 14).map((v) => v.dayIndex)).toEqual([7, 20]);
  });

  it('counts only the named place', () => {
    const mixed = [...visits, visit({ dayIndex: 20, placeId: 'other' })];
    expect(visitCountInWindow(mixed, 'corner espresso', 20, 14)).toBe(2);
  });
});

describe('R11.3 and R11.4 deletion', () => {
  const places: Place[] = [
    { id: 'a', displayName: 'A', firstSeenDay: 0, lastSeenDay: 1, coarseLabel: null },
    { id: 'b', displayName: 'B', firstSeenDay: 0, lastSeenDay: 1, coarseLabel: null },
  ];
  const visits = [visit({ placeId: 'a' }), visit({ placeId: 'b' })];

  it('removes the place, its visits and its mute, and leaves the others', () => {
    const r = deletePlace(places, visits, ['a', 'b'], 'a');
    expect(r.places.map((p) => p.id)).toEqual(['b']);
    expect(r.visits.map((v) => v.placeId)).toEqual(['b']);
    expect(r.mutedPlaceIds).toEqual(['b']);
  });

  it('never touches the event log, because past Skip lines are the user record of money kept', () => {
    // The function has no access to events at all, which is the structural guarantee. This
    // asserts the signature stays that way.
    expect(deletePlace.length).toBe(4);
  });

  it('R11.4 clears everything at once', () => {
    expect(deleteAllPlaces()).toEqual({ places: [], visits: [], mutedPlaceIds: [] });
  });
});

describe('the simulated location source', () => {
  const src = createSimulatedLocationSource();

  it('reports itself as simulated and unavailable, and never labels a place', () => {
    expect(src.kind()).toBe('simulated');
    expect(src.isAvailable()).toBe(false);
    expect(src.coarseLabelFor('corner espresso')).toBeNull();
  });

  it('R3.7: derives visits from the purchase feed, so no permission gates habit detection', () => {
    const out = src.visitsForDay(1, { seed: 42, paycheckCents: 0, startDate: '2026-06-15' }, [purchase()]);
    expect(out).toHaveLength(1);
    expect(out[0]).not.toHaveProperty('lat');
    expect(out[0]).not.toHaveProperty('lon');
  });
});

describe('totals', () => {
  it('sums only priced visits at the named place', () => {
    const visits = [visit({ amountCents: 435 }), visit({ amountCents: null }), visit({ placeId: 'other', amountCents: 900 })];
    expect(totalSpentAtPlace(visits, 'corner espresso')).toBe(435);
  });
});
