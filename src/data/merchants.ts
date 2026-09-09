// Plan v2 section 7.2: a thin loader over shared/content/merchants.json. The list itself
// lives in shared/ because the rule fixture and the copy lints read the same file, and a merchant list that
// differed between platforms would silently break the seed 42 comparison (criterion 22).
import raw from '../../shared/content/merchants.json';
import type { PurchaseCategory } from '../domain/interfaces';

export type Category = PurchaseCategory;

export interface Merchant {
  name: string;
  category: Exclude<Category, 'subscription'>;
  minCents: number;
  maxCents: number;
  /** R2.4: the centre of this merchant's visit time, in minutes past midnight. */
  usualMinute: number;
  /** R2.4: the standard deviation, in minutes, of the gaussian around `usualMinute`. */
  minuteSpread: number;
}

export interface Subscription {
  name: string;
  dayOfMonth: number;
  cents: number;
}

/**
 * R2.4: a merchant's index in this array is its `merchantIndex`, and it feeds the per visit
 * hash. Reordering this list changes every simulated visit time, so it is a plan revision.
 */
export const MERCHANTS: Merchant[] = raw.merchants as Merchant[];

/** Category weights when drawing a non grocery purchase. */
export const CATEGORY_WEIGHTS: Array<{ category: Merchant['category']; weight: number }> =
  raw.categoryWeights as Array<{ category: Merchant['category']; weight: number }>;

/** R2.3: subscriptions produce a purchase and a round-up but never a visit. */
export const SUBSCRIPTIONS: Subscription[] = raw.subscriptions as Subscription[];

export const SUBSCRIPTION_NAMES: string[] = SUBSCRIPTIONS.map((s) => s.name);

export function merchantIndexOf(name: string): number {
  return MERCHANTS.findIndex((m) => m.name === name);
}

export function merchantByName(name: string): Merchant | null {
  return MERCHANTS.find((m) => m.name === name) ?? null;
}
