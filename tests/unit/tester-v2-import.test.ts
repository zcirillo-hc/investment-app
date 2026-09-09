/**
 * TESTER v2, job 1: fresh regression cover for D1 (the critical v1 import-validator hole)
 * against the v2 validator, plus the classes the deleted `tester-*` files used to assert.
 *
 * Every case here is hostile input. Nothing in this file asserts a happy path except the two
 * round-trip guards, which exist so a validator that rejects everything cannot pass.
 */
import { describe, expect, it } from 'vitest';
import { validateImportedState } from '../../src/state/validate';
import { exportStateJson, parseImport, pickAppState } from '../../src/state/persistence';
import {
  addLedgerEntry,
  completeOnboarding,
  forceNudge,
  injectHabitVisits,
  setNudgesEnabled,
  takeSkip,
  tickN,
} from '../../src/domain/tick';
import { initialAppState, type AppState, type Deps } from '../../src/domain/types';
import { createSimulatedTransactionSource } from '../../src/domain/simulator';
import { createSimulatedLocationSource } from '../../src/domain/places';

function deps(): Deps {
  return { transactions: createSimulatedTransactionSource(), location: createSimulatedLocationSource() };
}

function lived(): AppState {
  const s0 = initialAppState();
  s0.profile = { ...s0.profile, name: 'Sam', seed: 42, createdAt: '2026-09-06T00:00:00.000Z', fear: 'pointless', summerEarnedCents: 300000 };
  s0.settings = { ...s0.settings, nudgesEnabled: true };
  let s = tickN(completeOnboarding(s0, { startDate: '2026-06-15', todayLocal: '2026-09-06', seedOverride: null }), deps(), 20);
  s = forceNudge(setNudgesEnabled(injectHabitVisits(s, 'Demo Coffee', 510, 435), true));
  const n = s.nudges.find((x) => x.status === 'pending');
  if (n) s = takeSkip(s, n.id);
  const r = addLedgerEntry(s, { date: '2026-07-01', amountCents: 5000, what: 'Index fund', note: 'n', source: 'manual' }, '2026-07-01T10:00:00.000Z');
  return r.ok ? r.state : s;
}

const BASE = JSON.parse(JSON.stringify(pickAppState(lived()))) as AppState;
const clone = () => JSON.parse(JSON.stringify(BASE)) as Record<string, unknown>;

function mutate(fn: (g: any) => void): unknown {
  const g = clone();
  fn(g);
  return g;
}

function rejects(label: string, fn: (g: any) => void) {
  it(`rejects: ${label}`, () => {
    const r = validateImportedState(mutate(fn));
    expect(r.ok, `ACCEPTED hostile file: ${label}`).toBe(false);
  });
}

describe('D1 regression: the v2 import validator against the v1 attack set', () => {
  it('a genuine export still round-trips (the validator is not just rejecting everything)', () => {
    const r = parseImport(exportStateJson(BASE as AppState));
    expect(r.ok).toBe(true);
  });

  it('the fixture has every array populated', () => {
    expect(BASE.events.length).toBeGreaterThan(0);
    expect(BASE.places.length).toBeGreaterThan(0);
    expect(BASE.visits.length).toBeGreaterThan(0);
    expect(BASE.nudges.length).toBeGreaterThan(0);
    expect(BASE.ledger.length).toBeGreaterThan(0);
  });

  // --- the exact v1 D1 shapes, translated to v2 ---
  rejects('clock.lastOpenedRealDate = "yesterday" (v1 D1 boot-brick)', (g) => { g.clock.lastOpenedRealDate = 'yesterday'; });
  rejects('clock.startDate = "someday" (v1 D10 render-brick)', (g) => { g.clock.startDate = 'someday'; });
  rejects('pendingPaychecks: [{}] (v1 D1 NaN money)', (g) => { g.pendingPaychecks = [{}]; });
  rejects('lessons.L1 = null (typeof null === "object")', (g) => { g.lessons.L1 = null; });
  rejects('negative jarCents', (g) => { g.jarCents = -1; });
  rejects('jarCents as a string', (g) => { g.jarCents = '500'; });
  rejects('jarCents NaN', (g) => { g.jarCents = Number.NaN; });
  rejects('jarCents Infinity', (g) => { g.jarCents = Number.POSITIVE_INFINITY; });
  rejects('jarCents fractional', (g) => { g.jarCents = 12.5; });
  rejects('events[0].cents as a string', (g) => { g.events[0].cents = '100'; });
  rejects('negative clock.dayIndex', (g) => { g.clock.dayIndex = -1; });
  rejects('settings.catchPct = 999', (g) => { g.settings.catchPct = 999; });
  rejects('settings.theme = "purple"', (g) => { g.settings.theme = 'purple'; });
  rejects('profile.age = 900', (g) => { g.profile.age = 900; });
  rejects('a 5000 character name', (g) => { g.profile.name = 'x'.repeat(5000); });
  rejects('profile.seed = -1', (g) => { g.profile.seed = -1; });
  rejects('profile.seed = 2**53', (g) => { g.profile.seed = 2 ** 53; });

  // --- v2 surface: places, visits, nudges, ledger ---
  rejects('visit.minuteOfDay = 1440 (one past max)', (g) => { g.visits[0].minuteOfDay = 1440; });
  rejects('visit.minuteOfDay = -1', (g) => { g.visits[0].minuteOfDay = -1; });
  rejects('visit.amountCents negative', (g) => { g.visits[0].amountCents = -5; });
  rejects('visit.date = "2026-02-30" (not a real day)', (g) => { g.visits[0].date = '2026-02-30'; });
  rejects('visit.dayIndex past clock.dayIndex', (g) => { g.visits[g.visits.length - 1].dayIndex = 9999; });
  rejects('visits out of dayIndex order', (g) => { g.visits.reverse(); });
  rejects('events out of dayIndex order', (g) => { g.events.reverse(); });
  rejects('place.lastSeenDay before firstSeenDay', (g) => { g.places[0].lastSeenDay = -1; });
  rejects('nudge.estimateCents negative', (g) => { g.nudges[0].estimateCents = -1; });
  rejects('nudge.status = "yolo"', (g) => { g.nudges[0].status = 'yolo'; });
  rejects('nudge.nudgeMinute = 5000', (g) => { g.nudges[0].nudgeMinute = 5000; });
  rejects('ledger amountCents 0', (g) => { g.ledger[0].amountCents = 0; });
  rejects('ledger amountCents negative', (g) => { g.ledger[0].amountCents = -100; });
  rejects('ledger amountCents over the R7.1 ceiling', (g) => { g.ledger[0].amountCents = 100_000_001; });
  rejects('ledger what empty after trim', (g) => { g.ledger[0].what = '   '; });
  rejects('ledger what 61 characters', (g) => { g.ledger[0].what = 'x'.repeat(61); });
  rejects('ledger note 201 characters', (g) => { g.ledger[0].note = 'x'.repeat(201); });
  rejects('ledger source = "brokerage"', (g) => { g.ledger[0].source = 'brokerage'; });
  rejects('learn map with an unknown id', (g) => { g.learn = { ...(g.learn ?? {}), NOPE: { unlockedDay: 0, readAt: null } }; });
  rejects('milestones.firstSkipDayIndex with no matching Skip', (g) => { g.milestones.firstSkipDayIndex = 4242; });
  rejects('settings.mutedPlaceIds contains a number', (g) => { g.settings.mutedPlaceIds = [7]; });
  rejects('settings.jarGoalCents off the preset list', (g) => { g.settings.jarGoalCents = 3333; });
  rejects('quiet window that wraps midnight', (g) => { g.settings.quietStartMinute = 1200; g.settings.quietEndMinute = 300; });
  rejects('a v1 envelope', (g) => { g.schemaVersion = 1; });
  rejects('schemaVersion 3', (g) => { g.schemaVersion = 3; });
  it('rejects: root is an array / a string / null / a number', () => {
    for (const v of [[], 'x', null, 7, true]) expect(validateImportedState(v).ok, String(v)).toBe(false);
  });

  it('drops push state entirely on import (5.5)', () => {
    const g = clone();
    (g as any).push = { supportState: 'ready', endpointHash: 'someone-elses-hash', subscribed: true, lastError: null };
    const r = validateImportedState(g);
    expect(r.ok).toBe(true);
    if (r.ok) expect(JSON.stringify(r.state.push)).not.toContain('someone-elses-hash');
  });

  it('recomputes habits rather than trusting the file (R3.5)', () => {
    const g = clone();
    (g as any).habits = [{ placeId: 'forged', isHabit: true, visitCount: 999, usualMinute: 600, spreadMinutes: 0, estimateCents: 999999 }];
    const r = validateImportedState(g);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.state.habits.find((h) => h.placeId === 'forged')).toBeUndefined();
  });

  it('strips a coordinate off a place record (R11.1)', () => {
    const g = clone();
    (g as any).places[0].lat = 37.77;
    (g as any).places[0].lon = -122.41;
    const r = validateImportedState(g);
    expect(r.ok).toBe(true);
    if (r.ok) expect(Object.keys(r.state.places[0])).toEqual(['id', 'displayName', 'firstSeenDay', 'lastSeenDay', 'coarseLabel']);
  });
});

/**
 * Holes I am probing for specifically: things a validator of this shape typically misses.
 * A failure here is a NEW defect, not a D1 regression.
 */
describe('D1 neighbourhood: cross-field rules the v2 validator may not cover', () => {
  it('AUDIT: a ledger entry dated after the current simulated date (R7.1)', () => {
    const g = clone();
    (g as any).ledger[0].date = '2099-01-01';
    const r = validateImportedState(g);
    // R7.1: "`date` may not be later than the current simulated date."
    expect(r.ok, 'AUDIT-RESULT accepted-future-ledger-date=' + r.ok).toBe(false);
  });

  it('AUDIT: two places sharing one id', () => {
    const g = clone();
    (g as any).places.push(JSON.parse(JSON.stringify((g as any).places[0])));
    const r = validateImportedState(g);
    expect(r.ok, 'AUDIT-RESULT accepted-duplicate-place-id=' + r.ok).toBe(false);
  });

  it('AUDIT: a visit whose placeId names no place', () => {
    const g = clone();
    const v = JSON.parse(JSON.stringify((g as any).visits[0]));
    v.placeId = 'ghost-place';
    v.id = 'ghost-visit';
    v.dayIndex = (g as any).clock.dayIndex;
    (g as any).visits.push(v);
    const r = validateImportedState(g);
    expect(r.ok, 'AUDIT-RESULT accepted-orphan-visit=' + r.ok).toBe(false);
  });

  it('AUDIT: two ledger entries sharing one id', () => {
    const g = clone();
    (g as any).ledger.push(JSON.parse(JSON.stringify((g as any).ledger[0])));
    const r = validateImportedState(g);
    expect(r.ok, 'AUDIT-RESULT accepted-duplicate-ledger-id=' + r.ok).toBe(false);
  });

  it('AUDIT: a lesson unlockedDay far past the clock', () => {
    const g = clone();
    (g as any).lessons.L1 = { unlockedDay: 999999, readAt: null };
    const r = validateImportedState(g);
    expect(r.ok, 'AUDIT-RESULT accepted-future-lesson-unlock=' + r.ok).toBe(false);
  });

  it('AUDIT: two nudges on the same dayIndex (R4.4 daily cap)', () => {
    const g = clone();
    const n = JSON.parse(JSON.stringify((g as any).nudges[0]));
    n.id = 'nudge:dup';
    (g as any).nudges.push(n);
    const r = validateImportedState(g);
    expect(r.ok, 'AUDIT-RESULT accepted-two-nudges-one-day=' + r.ok).toBe(false);
  });
});
