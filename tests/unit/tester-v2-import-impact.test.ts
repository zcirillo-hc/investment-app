/**
 * TESTER v2: the import shapes that used to be accepted, and the damage they did.
 *
 * INVERTED 2026-09-09 after V2-6 was fixed. As originally written these cases asserted
 * `ok === true` in order to demonstrate the gap and then measure the downstream harm
 * (a duplicate ledger id took $149 to $0 on a single delete). `validateImportedState`
 * now rejects all four, so asserting acceptance would assert the bug.
 *
 * They now assert REJECTION, and where the reason is specific they assert the reason,
 * so the coverage still guards the same four shapes rather than being deleted.
 */
import { describe, expect, it } from 'vitest';
import { validateImportedState } from '../../src/state/validate';
import { addLedgerEntry } from '../../src/domain/tick';
import { pickAppState } from '../../src/state/persistence';
import { completeOnboarding, tickN } from '../../src/domain/tick';
import { initialAppState, type AppState, type Deps } from '../../src/domain/types';
import { createSimulatedTransactionSource } from '../../src/domain/simulator';
import { createSimulatedLocationSource } from '../../src/domain/places';

function deps(): Deps {
  return { transactions: createSimulatedTransactionSource(), location: createSimulatedLocationSource() };
}
function base(): AppState {
  const s = initialAppState();
  s.profile = { ...s.profile, name: 'Sam', seed: 42, createdAt: '2026-09-06T00:00:00.000Z', fear: 'pointless', summerEarnedCents: 300000 };
  let st = tickN(completeOnboarding(s, { startDate: '2026-06-15', todayLocal: '2026-09-06', seedOverride: null }), deps(), 5);
  const r = addLedgerEntry(st, { date: '2026-06-16', amountCents: 5000, what: 'Index fund', note: '', source: 'manual' }, '2026-06-16T10:00:00.000Z');
  return r.ok ? r.state : st;
}

describe('impact of the accepted-but-wrong import shapes', () => {
  it('two ledger entries with one id are rejected (used to let one delete zero both)', () => {
    const g = JSON.parse(JSON.stringify(pickAppState(base()))) as any;
    const dup = JSON.parse(JSON.stringify(g.ledger[0]));
    dup.amountCents = 9900;
    dup.what = 'Something else';
    g.ledger.push(dup); // same id
    const r = validateImportedState(g);
    expect(r.ok, 'a duplicate ledger id must be rejected: one delete used to zero both entries').toBe(false);
    if (r.ok) return;
    expect(r.problems.join(' | ')).toMatch(/unique id/i);
  });

  it('a future-dated ledger entry is rejected (used to sort to the top of Invest)', () => {
    const g = JSON.parse(JSON.stringify(pickAppState(base()))) as any;
    g.ledger[0].date = '2099-01-01';
    const r = validateImportedState(g);
    expect(r.ok, 'a ledger entry dated after the simulated date must be rejected').toBe(false);
    if (r.ok) return;
    expect(r.problems.join(' | ')).toMatch(/at or before the current simulated date/i);
  });

  it('an orphan visit is rejected (used to survive into state and into a later export)', () => {
    const g = JSON.parse(JSON.stringify(pickAppState(base()))) as any;
    const v = JSON.parse(JSON.stringify(g.visits[0]));
    v.id = 'orphan';
    v.placeId = 'a-place-that-was-deleted';
    v.displayName = 'A Place That Was Deleted';
    v.dayIndex = g.clock.dayIndex;
    g.visits.push(v);
    const r = validateImportedState(g);
    expect(r.ok, 'a visit pointing at a place that does not exist must be rejected').toBe(false);
  });

  it('two nudges on one dayIndex are rejected (only the first was ever actionable)', () => {
    const g = JSON.parse(JSON.stringify(pickAppState(base()))) as any;
    g.nudges = [
      { id: 'nudge:a', placeId: 'p', displayName: 'P', dayIndex: g.clock.dayIndex, nudgeMinute: 500, estimateCents: 100, status: 'pending' },
      { id: 'nudge:b', placeId: 'q', displayName: 'Q', dayIndex: g.clock.dayIndex, nudgeMinute: 600, estimateCents: 200, status: 'pending' },
    ];
    const r = validateImportedState(g);
    expect(r.ok, 'two nudges on one dayIndex breaks the one-a-day rule (R4.4) and must be rejected').toBe(false);
  });
});
