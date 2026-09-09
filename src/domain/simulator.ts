import type { Paycheck, Purchase, PurchaseCategory, SimContext, TransactionSource } from './interfaces';
import { dayOfMonth, isWeekday, simDate } from './dates';
import { gaussianFrom, hash, mulberry32, pick, randInt, roundTiesUp } from './prng';
import { CATEGORY_WEIGHTS, MERCHANTS, SUBSCRIPTIONS } from '../data/merchants';
import { MAX_MINUTE_OF_DAY, PAYCHECK_FIRST_DAY, PAYCHECK_INTERVAL_DAYS } from '../config';

const WEEK_SALT = 1_000_003;

/** R2.4 keys the per visit hash on `dayIndex * 1000 + merchantIndex`. */
const DAY_STRIDE = 1000;

/** Two grocery-eligible weekday offsets (0..6) for the week containing dayIndex, chosen from the seed only. */
function groceryDaysForWeek(seed: number, weekIndex: number): [number, number] {
  const rng = mulberry32(hash(seed, WEEK_SALT + weekIndex));
  const a = randInt(rng, 0, 6);
  let b = randInt(rng, 0, 5);
  if (b >= a) b += 1;
  return [a, b];
}

function drawCategory(rng: () => number) {
  const total = CATEGORY_WEIGHTS.reduce((s, c) => s + c.weight, 0);
  let r = rng() * total;
  for (const c of CATEGORY_WEIGHTS) {
    if (r < c.weight) return c.category;
    r -= c.weight;
  }
  return CATEGORY_WEIGHTS[CATEGORY_WEIGHTS.length - 1].category;
}

/**
 * Plan v2 R2.4: the minute of a visit at merchant index `merchantIndex` on day `dayIndex`
 * with seed `seed`. `clamp(round(gaussianFrom(hash(seed, dayIndex * 1000 + merchantIndex)) *
 * minuteSpread) + usualMinute, 0, 1439)`. The rounding is ties toward positive infinity
 * (`roundTiesUp`), not the money rule, because the gaussian offset can be negative.
 */
export function visitMinuteFor(seed: number, dayIndex: number, merchantIndex: number, usualMinute: number, minuteSpread: number): number {
  const g = gaussianFrom(hash(seed, dayIndex * DAY_STRIDE + merchantIndex));
  const raw = roundTiesUp(g * minuteSpread) + usualMinute;
  return Math.min(MAX_MINUTE_OF_DAY, Math.max(0, raw));
}

export function isPaycheckDue(dayIndex: number): boolean {
  return dayIndex >= PAYCHECK_FIRST_DAY && (dayIndex - PAYCHECK_FIRST_DAY) % PAYCHECK_INTERVAL_DAYS === 0;
}

/**
 * SimulatedTransactionSource. Each day is generated from hash(seed, dayIndex) so any day is
 * reproducible on its own. Purchases now carry a minute of day (R2.4) so that the non
 * subscription ones can become visits (R2.3).
 */
export function createSimulatedTransactionSource(): TransactionSource {
  return {
    purchasesForDay(dayIndex, ctx) {
      const out: Purchase[] = [];
      if (dayIndex <= 0) return out;
      const date = simDate(ctx.startDate, dayIndex);
      const rng = mulberry32(hash(ctx.seed, dayIndex));
      const n = isWeekday(date) ? randInt(rng, 2, 4) : randInt(rng, 1, 3);
      const weekIndex = Math.floor(dayIndex / 7);
      const [g1, g2] = groceryDaysForWeek(ctx.seed, weekIndex);
      const offset = dayIndex % 7;
      const groceryAllowed = offset === g1 || offset === g2;
      let groceryDone = false;
      for (let i = 0; i < n; i++) {
        let category: PurchaseCategory;
        if (groceryAllowed && !groceryDone && rng() < 0.6) {
          category = 'groceries';
          groceryDone = true;
        } else {
          category = drawCategory(rng);
        }
        const candidates = MERCHANTS.filter((m) => m.category === category);
        const m = pick(rng, candidates);
        const merchantIndex = MERCHANTS.indexOf(m);
        out.push({
          id: `${dayIndex}-${out.length}`,
          dayIndex,
          merchant: m.name,
          category,
          amountCents: randInt(rng, m.minCents, m.maxCents),
          minuteOfDay: visitMinuteFor(ctx.seed, dayIndex, merchantIndex, m.usualMinute, m.minuteSpread),
        });
      }
      const dom = dayOfMonth(date);
      SUBSCRIPTIONS.forEach((sub, subIndex) => {
        if (sub.dayOfMonth !== dom) return;
        out.push({
          id: `${dayIndex}-${out.length}`,
          dayIndex,
          merchant: sub.name,
          category: 'subscription',
          amountCents: sub.cents,
          // R2.3: a subscription never becomes a visit, so this minute is never read by a
          // rule. It is still derived deterministically, from an index that continues past
          // the merchant list, so an export is reproducible field by field.
          minuteOfDay: visitMinuteFor(ctx.seed, dayIndex, MERCHANTS.length + subIndex, 0, 0),
        });
      });
      return out;
    },
    paycheckForDay(dayIndex, ctx): Paycheck | null {
      if (!isPaycheckDue(dayIndex)) return null;
      return { id: `pay-${dayIndex}`, dayIndex, amountCents: ctx.paycheckCents, source: 'schedule' };
    },
  };
}

export function simContextFor(seed: number, paycheckCents: number, startDate: string): SimContext {
  return { seed, paycheckCents, startDate };
}
