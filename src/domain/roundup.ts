import type { Cents, Purchase } from './interfaces';

/** Plan 4.2: (100 - amount % 100) % 100. Exact dollars give 0 (no event). */
export function roundUpCents(amountCents: Cents): Cents {
  return (100 - (amountCents % 100)) % 100;
}

export interface RoundUpResult {
  purchase: Purchase;
  cents: Cents;
}

/** Round-ups for a day's purchases. Returns only nonzero round-ups, or nothing when paused. */
export function roundUpsFor(purchases: Purchase[], paused: boolean): RoundUpResult[] {
  if (paused) return [];
  const out: RoundUpResult[] = [];
  for (const p of purchases) {
    const cents = roundUpCents(p.amountCents);
    if (cents > 0) out.push({ purchase: p, cents });
  }
  return out;
}
