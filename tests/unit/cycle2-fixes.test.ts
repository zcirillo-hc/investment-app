// Coder suite for the cycle 2 defect fixes that are not already covered by the tester's
// regression tests: D1's boot robustness.
//
// D9 (dust after a full liquidation) is DELETED with the simulated brokerage, along with its
// three cases and the `helpers.ts` price fixtures they used. There is nothing to liquidate in
// v2, and the module the cases exercised no longer exists.
import { describe, expect, it } from 'vitest';
import { createSimulatedTransactionSource } from '../../src/domain/simulator';
import { createSimulatedLocationSource } from '../../src/domain/places';
import { completeOnboarding } from '../../src/domain/tick';
import { initialAppState, type AppState, type Deps } from '../../src/domain/types';
import { computeAutoAdvanceTicks, runAutoAdvance } from '../../src/state/bootstrap';

function onboarded(over: Partial<AppState['clock']> = {}): AppState {
  const s = initialAppState();
  s.profile = { ...s.profile, name: 'Sam', seed: 42, createdAt: '2026-09-06T00:00:00.000Z', fear: 'pointless' };
  const done = completeOnboarding(s, { startDate: '2026-06-15', todayLocal: '2026-09-06', seedOverride: null });
  return { ...done, clock: { ...done.clock, ...over } };
}

function deps(): Deps {
  return { transactions: createSimulatedTransactionSource(), location: createSimulatedLocationSource() };
}

describe('D1: boot never throws on a damaged clock', () => {
  it('computeAutoAdvanceTicks returns 0 for dates it cannot parse', () => {
    expect(computeAutoAdvanceTicks('yesterday', '2026-09-06', false)).toBe(0);
    expect(computeAutoAdvanceTicks('2026-02-30', '2026-09-06', false)).toBe(0);
    expect(computeAutoAdvanceTicks('2026-09-04', 'today', false)).toBe(0);
    expect(computeAutoAdvanceTicks('2026-09-04', '2026-09-06', false)).toBe(2);
  });
  it('runAutoAdvance survives a garbage lastOpenedRealDate and rewrites it', () => {
    const s = onboarded({ lastOpenedRealDate: 'yesterday' });
    const r = runAutoAdvance(s, deps(), '2026-09-06', false);
    expect(r.ticks).toBe(0);
    expect(r.state.clock.dayIndex).toBe(0);
    expect(r.state.clock.lastOpenedRealDate).toBe('2026-09-06');
  });
  it('runAutoAdvance does not tick on an unparseable startDate', () => {
    const s = onboarded({ startDate: 'summer', lastOpenedRealDate: '2026-09-01' });
    const r = runAutoAdvance(s, deps(), '2026-09-06', false);
    expect(r.ticks).toBe(0);
    expect(r.state.clock.dayIndex).toBe(0);
  });
  it('still advances normally on a healthy clock', () => {
    const s = onboarded({ lastOpenedRealDate: '2026-09-04' });
    const r = runAutoAdvance(s, deps(), '2026-09-06', false);
    expect(r.ticks).toBe(2);
    expect(r.state.clock.dayIndex).toBe(2);
  });
});
