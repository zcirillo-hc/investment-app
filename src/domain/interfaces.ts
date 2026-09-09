// Plan v2 section 5.1. The interfaces the app is written against. `LocationSource` is
// verbatim from the plan. The app ships only the simulated conformer (section 5.1); a future
// browser geolocation source would be a second conformer rather than a rewrite.

export type Cents = number; // integer

export type PurchaseCategory = 'coffee' | 'food' | 'groceries' | 'subscription' | 'transport' | 'campus' | 'fun';

export interface Purchase {
  id: string; // `${dayIndex}-${n}`
  dayIndex: number;
  merchant: string;
  category: PurchaseCategory;
  amountCents: Cents;
  /** 0..1439, R2.4. Present on every purchase; only non subscription purchases become visits. */
  minuteOfDay: number;
}

export interface Paycheck {
  id: string;
  dayIndex: number;
  amountCents: Cents;
  source: 'schedule' | 'demo';
}

export interface SimContext {
  seed: number;
  paycheckCents: Cents;
  /** Simulated start date (YYYY-MM-DD), so the simulator can compute weekday and day of month. */
  startDate: string;
}

export interface TransactionSource {
  purchasesForDay(dayIndex: number, ctx: SimContext): Purchase[];
  paycheckForDay(dayIndex: number, ctx: SimContext): Paycheck | null;
}

export interface PlaceVisit {
  id: string; // `${dayIndex}-${seq}`
  placeId: string; // R2.2 normalized merchant name
  displayName: string; // first spelling seen
  dayIndex: number;
  date: string; // YYYY-MM-DD
  minuteOfDay: number; // 0..1439, R2.4
  amountCents: Cents | null;
}

export type LocationSourceKind = 'simulated' | 'device' | 'unavailable';

export interface LocationSource {
  kind(): LocationSourceKind;
  /** True when the source can add a coordinate to a place. Never gates habit detection. */
  isAvailable(): boolean;
  /**
   * Visits for a simulated day. The simulated implementation derives them from the
   * same purchase feed the transaction source produces, so the loop works identically
   * with no location permission at all (R2.3).
   */
  visitsForDay(dayIndex: number, ctx: SimContext, purchases: Purchase[]): PlaceVisit[];
  /** Display only coarse label, or null. Never used in any rule (R3.7). */
  coarseLabelFor(placeId: string): string | null;
}
