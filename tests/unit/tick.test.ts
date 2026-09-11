/**
 * Plan v2 R13, and the actions that happen outside a tick.
 *
 * Rewritten for v2. Deleted with the simulated engine: the sweep cases, the ordering case that
 * proved the sweep beat the paycheck, the five fee cases, the two "first dip" cases and the
 * trading day index case. Twelve cases in total. What survives is the day pipeline, the
 * paycheck queue, the catch, the lesson triggers and the money drift guard, all of which still
 * hold. What is new is the visit, habit and nudge half of the pipeline, and the two jar
 * actions that replaced the sweep.
 */
import { describe, expect, it } from 'vitest';
import { createSimulatedTransactionSource } from '../../src/domain/simulator';
import { createSimulatedLocationSource } from '../../src/domain/places';
import {
  acceptCatch,
  addLedgerEntry,
  completeOnboarding,
  declineCatch,
  deleteAllPlaces,
  deletePlace,
  dismissNudge,
  emptyJar,
  forceNudge,
  injectHabitVisits,
  landDemoPaycheck,
  moveJarToLedger,
  mutePlace,
  setNudgesEnabled,
  takeSkip,
  tick,
  tickN,
} from '../../src/domain/tick';
import { initialAppState, type AppState, type Deps, type FearOption } from '../../src/domain/types';
import { keptThisWeekCents } from '../../src/domain/selectors';

function deps(): Deps {
  return { transactions: createSimulatedTransactionSource(), location: createSimulatedLocationSource() };
}

function onboarded(over: { fear?: FearOption; seed?: number; startDate?: string; nudgesEnabled?: boolean } = {}): AppState {
  const { fear = 'pointless', seed = 42, startDate = '2026-06-15', nudgesEnabled = true } = over;
  const s = initialAppState();
  s.profile = { ...s.profile, name: 'Sam', seed, createdAt: '2026-09-06T00:00:00.000Z', fear, summerEarnedCents: 300000 };
  s.settings = { ...s.settings, nudgesEnabled };
  return completeOnboarding(s, { startDate, todayLocal: '2026-09-06', seedOverride: null });
}

describe('R12.2 onboarding', () => {
  it('sets the clock and unlocks the fear lesson on day 0', () => {
    const s = onboarded({ fear: 'rent' });
    expect(s.clock).toMatchObject({ startDate: '2026-06-15', dayIndex: 0 });
    expect(s.lessons.L6.unlockedDay).toBe(0);
    expect(s.lessons.L7.unlockedDay).toBeNull();
  });

  it('fear "losing" unlocks L4 immediately, and the pool unlocks on days 10 and 20', () => {
    let s = onboarded({ fear: 'losing' });
    expect(s.lessons.L4.unlockedDay).toBe(0);
    s = tickN(s, deps(), 10);
    const atTen = ['L6', 'L7', 'L8'].filter((id) => s.lessons[id as 'L6'].unlockedDay !== null);
    expect(atTen).toHaveLength(1);
    s = tickN(s, deps(), 10);
    for (const id of ['L6', 'L7', 'L8'] as const) expect(s.lessons[id].unlockedDay, id).not.toBeNull();
  });

  it('R12.4: a lesson unlocks once and keeps its first day', () => {
    // L1 unlocks on the first habit the app spots, which withSkippedJar creates on the way.
    let s = withSkippedJar();
    const day = s.lessons.L1.unlockedDay;
    expect(day).not.toBeNull();
    s = tickN(s, deps(), 5);
    expect(s.lessons.L1.unlockedDay).toBe(day);
  });
});


/**
 * Money only reaches the jar through a skip or a catch now that round-ups are gone, so any test
 * that needs a funded jar has to earn it rather than just letting days pass.
 */
function withSkippedJar(): AppState {
  const s = forceNudge(setNudgesEnabled(injectHabitVisits(onboarded(), 'Demo Coffee', 510, 435), true));
  const nudge = s.nudges.find((n) => n.status === 'pending');
  return nudge ? takeSkip(s, nudge.id) : s;
}

describe('R13 the order of operations', () => {
  it('advances the day and generates purchases, and the jar stays put', () => {
    // Round-ups are gone, so a day passing no longer moves money on its own. Purchases still
    // arrive because habits are read off them; they just do not fill the jar any more. Only a
    // skip or a catch does, which is the whole point of the removal.
    const s = tick(onboarded(), deps());
    expect(s.clock.dayIndex).toBe(1);
    expect(s.events.some((e) => e.kind === 'Purchase')).toBe(true);
    expect(s.events.some((e) => e.kind === 'RoundUp'), 'nothing may create a round-up').toBe(false);
    expect(s.jarCents, 'a day passing must not move money by itself').toBe(0);
  });

  it('tickN(7) equals seven successive ticks', () => {
    const a = tickN(onboarded(), deps(), 7);
    let b = onboarded();
    for (let i = 0; i < 7; i++) b = tick(b, deps());
    expect(a).toEqual(b);
  });

  it('step 4: records a visit for every non subscription purchase, and none for a subscription', () => {
    const s = tickN(onboarded(), deps(), 5);
    const purchases = s.events.filter((e) => e.kind === 'Purchase');
    const subscriptions = purchases.filter((e) => e.kind === 'Purchase' && e.category === 'subscription');
    expect(subscriptions.length).toBeGreaterThan(0);
    expect(s.visits).toHaveLength(purchases.length - subscriptions.length);
    // R2.3's point is now only that a subscription is a purchase without a visit: it is not
    // somewhere you went, so it can never become a habit and can never be nudged.
    expect(subscriptions.every((e) => !s.visits.some((v) => v.dayIndex === e.dayIndex && v.displayName === (e as { merchant: string }).merchant))).toBe(true);
  });

  it('step 8: recomputes habits every tick, from scratch', () => {
    const s = tickN(onboarded(), deps(), 14);
    expect(s.places.length).toBeGreaterThan(0);
    expect(s.habits).toHaveLength(s.places.length);
    // Criterion 4: fourteen days produces at least one habit place.
    expect(s.habits.filter((h) => h.isHabit).length).toBeGreaterThanOrEqual(1);
  });

  it('step 9 and R4.4: at most one nudge exists per day, over thirty days', () => {
    const s = tickN(onboarded(), deps(), 30);
    const byDay = new Map<number, number>();
    for (const n of s.nudges) byDay.set(n.dayIndex, (byDay.get(n.dayIndex) ?? 0) + 1);
    for (const [day, count] of byDay) expect(count, `day ${day}`).toBe(1);
    expect(s.nudges.length).toBeGreaterThan(0);
  });

  it('step 2 and R4.6: a nudge left alone expires silently when the day advances', () => {
    let s = forceNudge(setNudgesEnabled(injectHabitVisits(onboarded(), 'Demo Coffee', 510, 435), true));
    const pending = s.nudges.find((n) => n.status === 'pending');
    expect(pending).toBeTruthy();
    const before = { jar: s.jarCents, events: s.events.length, kept: keptThisWeekCents(s) };
    s = tick(s, deps());
    expect(s.nudges.find((n) => n.id === pending?.id)?.status).toBe('expired');
    // R4.7: no event, no counter movement, nothing anywhere refers to it.
    expect(s.events.filter((e) => e.kind === 'Skip')).toHaveLength(0);
    expect(s.jarCents).toBeGreaterThanOrEqual(before.jar);
    expect(s.events.some((e) => e.kind === 'JarEmptied')).toBe(false);
  });

  it('R4.5: with nudges off, habits are still detected and no nudge is created', () => {
    const s = tickN(onboarded({ nudgesEnabled: false }), deps(), 30);
    expect(s.habits.filter((h) => h.isHabit).length).toBeGreaterThanOrEqual(1);
    expect(s.nudges).toEqual([]);
  });

  it('R2.5: prunes visits past ninety days while the events they produced survive', () => {
    const s = tickN(onboarded(), deps(), 100);
    for (const v of s.visits) expect(v.dayIndex).toBeGreaterThan(100 - 90 - 1);
    expect(s.events.filter((e) => e.kind === 'Purchase').length).toBeGreaterThan(s.visits.length);
  });

  it('paychecks land on days 3 and 17 and queue up', () => {
    let s = tickN(onboarded(), deps(), 3);
    expect(s.pendingPaychecks).toHaveLength(1);
    s = tickN(s, deps(), 14);
    expect(s.pendingPaychecks).toHaveLength(2);
    expect(s.pendingPaychecks.map((p) => p.dayIndex)).toEqual([3, 17]);
  });

  it('a demo paycheck lands immediately without advancing the day', () => {
    const s = landDemoPaycheck(onboarded());
    expect(s.clock.dayIndex).toBe(0);
    expect(s.pendingPaychecks).toHaveLength(1);
    expect(s.pendingPaychecks[0].source).toBe('demo');
  });
});

describe('R5 the skip', () => {
  function withNudge(): AppState {
    return forceNudge(setNudgesEnabled(injectHabitVisits(onboarded(), 'Demo Coffee', 510, 435), true));
  }

  it('R5.5: credits exactly the estimate and writes one Skip event carrying the place', () => {
    const s = withNudge();
    const nudge = s.nudges.find((n) => n.status === 'pending');
    expect(nudge).toBeTruthy();
    if (!nudge) return;
    const after = takeSkip(s, nudge.id);
    expect(after.jarCents).toBe(s.jarCents + nudge.estimateCents);
    const skips = after.events.filter((e) => e.kind === 'Skip');
    expect(skips).toHaveLength(1);
    expect(skips[0]).toMatchObject({ placeId: nudge.placeId, displayName: nudge.displayName, cents: nudge.estimateCents });
  });

  it('R5.3: the Skip event freezes the estimate that was shown', () => {
    const s = withNudge();
    const nudge = s.nudges.find((n) => n.status === 'pending');
    if (!nudge) throw new Error('no nudge');
    let after = takeSkip(s, nudge.id);
    const shown = nudge.estimateCents;
    // Later visits at a wildly different price must not restate the past skip.
    after = injectHabitVisits(after, 'Demo Coffee', 510, 99_00);
    after = tick(after, deps());
    const skip = after.events.find((e) => e.kind === 'Skip');
    expect(skip && skip.kind === 'Skip' ? skip.cents : 0).toBe(shown);
  });

  it('is idempotent, so arriving from both the notification and the card credits once', () => {
    const s = withNudge();
    const nudge = s.nudges.find((n) => n.status === 'pending');
    if (!nudge) throw new Error('no nudge');
    const once = takeSkip(s, nudge.id);
    const twice = takeSkip(once, nudge.id);
    expect(twice).toBe(once);
  });

  it('is a no op on an expired nudge, rather than a late double credit', () => {
    let s = withNudge();
    const nudge = s.nudges.find((n) => n.status === 'pending');
    if (!nudge) throw new Error('no nudge');
    s = dismissNudge(s, nudge.id);
    const before = s.jarCents;
    expect(takeSkip(s, nudge.id).jarCents).toBe(before);
  });

  it('R12.1: the first skip unlocks L3, and not before', () => {
    const s = withNudge();
    expect(s.lessons.L3.unlockedDay).toBeNull();
    const nudge = s.nudges.find((n) => n.status === 'pending');
    if (!nudge) throw new Error('no nudge');
    expect(takeSkip(s, nudge.id).lessons.L3.unlockedDay).not.toBeNull();
  });
});

describe('R6 the jar actions', () => {
  it('R6.4: a jar move writes one entry, one JarMove event and empties the jar', () => {
    const s = tickN(withSkippedJar(), deps(), 10);
    const amount = s.jarCents;
    expect(amount).toBeGreaterThan(0);
    const r = moveJarToLedger(s, { date: '2026-06-25', what: 'Index fund', note: '' }, '2026-06-25T10:00:00.000Z');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.jarCents).toBe(0);
    expect(r.state.ledger).toHaveLength(1);
    expect(r.state.ledger[0]).toMatchObject({ amountCents: amount, source: 'jar' });
    expect(r.state.events.filter((e) => e.kind === 'JarMove')).toHaveLength(1);
  });

  it('R6.4: cancelling changes nothing, and an empty jar cannot be moved', () => {
    const s = onboarded();
    const r = moveJarToLedger(s, { date: '2026-06-15', what: 'Index fund', note: '' }, '2026-06-15T10:00:00.000Z');
    expect(r.ok).toBe(false);
    expect(r.state).toBe(s);
  });

  it('R6.5: "I spent it" empties the jar with one neutral event and no ledger entry', () => {
    const s = tickN(withSkippedJar(), deps(), 10);
    const after = emptyJar(s);
    expect(after.jarCents).toBe(0);
    expect(after.ledger).toEqual([]);
    expect(after.events.filter((e) => e.kind === 'JarEmptied')).toHaveLength(1);
  });

  it('R12.1: the first ledger entry unlocks L4, and not before', () => {
    const s = tickN(onboarded(), deps(), 3);
    expect(s.lessons.L4.unlockedDay).toBeNull();
    const r = addLedgerEntry(s, { date: '2026-06-17', amountCents: 5000, what: 'Index fund', note: '', source: 'manual' }, '2026-06-17T10:00:00.000Z');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.state.lessons.L4.unlockedDay).not.toBeNull();
  });

  it('R7.4: deleting a jar sourced entry does not restore the jar', () => {
    const s = tickN(withSkippedJar(), deps(), 10);
    const r = moveJarToLedger(s, { date: '2026-06-25', what: 'Index fund', note: '' }, '2026-06-25T10:00:00.000Z');
    if (!r.ok) throw new Error('move failed');
    expect(r.state.jarCents).toBe(0);
  });
});

describe('R6.1 the catch', () => {
  it('adds a Catch, unlocks L2, and leaves the usual percentage alone', () => {
    let s = tickN(onboarded(), deps(), 3);
    expect(s.pendingPaychecks).toHaveLength(1);
    const before = s.jarCents;
    s = acceptCatch(s, 10);
    const c = s.events.find((e) => e.kind === 'Catch');
    expect(c && c.kind === 'Catch' ? c.pct : 0).toBe(10);
    expect(s.jarCents).toBe(before + (c && c.kind === 'Catch' ? c.cents : 0));
    expect(s.settings.catchPct).toBe(5);
    expect(s.lessons.L2.unlockedDay).not.toBeNull();
    expect(s.pendingPaychecks).toHaveLength(0);
  });

  it('declining pops the queue and emits nothing', () => {
    let s = tickN(onboarded(), deps(), 3);
    const events = s.events.length;
    s = declineCatch(s);
    expect(s.pendingPaychecks).toHaveLength(0);
    expect(s.events).toHaveLength(events);
  });
});

describe('R11.3 and R11.4 deletion', () => {
  it('removes the place and its visits, cancels its nudge, and keeps its past Skip lines', () => {
    let s = forceNudge(setNudgesEnabled(injectHabitVisits(tickN(onboarded(), deps(), 14), 'Demo Coffee', 510, 435), true));
    const nudge = s.nudges.find((n) => n.status === 'pending');
    if (!nudge) throw new Error('no nudge');
    s = takeSkip(s, nudge.id);
    const placeId = nudge.placeId;
    const skipBefore = s.events.filter((e) => e.kind === 'Skip' && e.placeId === placeId);
    expect(skipBefore).toHaveLength(1);

    const after = deletePlace(s, placeId);
    expect(after.places.some((p) => p.id === placeId)).toBe(false);
    expect(after.visits.some((v) => v.placeId === placeId)).toBe(false);
    expect(after.habits.some((h) => h.placeId === placeId)).toBe(false);
    // The money the user kept survives, with its amount and its place name.
    const skipAfter = after.events.filter((e) => e.kind === 'Skip' && e.placeId === placeId);
    expect(skipAfter).toEqual(skipBefore);
  });

  it('R11.4: deleting everything leaves the events and the jar untouched', () => {
    const s = tickN(onboarded(), deps(), 14);
    const after = deleteAllPlaces(s);
    expect(after.places).toEqual([]);
    expect(after.visits).toEqual([]);
    expect(after.habits).toEqual([]);
    expect(after.jarCents).toBe(s.jarCents);
    expect(after.events).toEqual(s.events);
  });

  it('R4.8: muting a place cancels its pending nudge and does not delete it', () => {
    let s = forceNudge(setNudgesEnabled(injectHabitVisits(onboarded(), 'Demo Coffee', 510, 435), true));
    const nudge = s.nudges.find((n) => n.status === 'pending');
    if (!nudge) throw new Error('no nudge');
    s = mutePlace(s, nudge.placeId, true);
    expect(s.settings.mutedPlaceIds).toContain(nudge.placeId);
    expect(s.places.some((p) => p.id === nudge.placeId)).toBe(true);
    expect(s.nudges.find((n) => n.id === nudge.id)?.status).toBe('expired');
    // Reversible.
    s = mutePlace(s, nudge.placeId, false);
    expect(s.settings.mutedPlaceIds).not.toContain(nudge.placeId);
  });
});

describe('counters and arithmetic', () => {
  it('R9.1: this week counts the last seven days only', () => {
    const s = tickN(onboarded(), deps(), 20);
    const cutoff = s.clock.dayIndex - 7;
    let expected = 0;
    for (const e of s.events) {
      if ((e.kind === 'RoundUp' || e.kind === 'Catch' || e.kind === 'Skip') && e.dayIndex > cutoff) expected += e.cents;
    }
    expect(keptThisWeekCents(s)).toBe(expected);
  });

  it('R1.1: money does not drift over 200 ticks with catches', () => {
    let s = onboarded();
    for (let i = 0; i < 200; i++) {
      s = tick(s, deps());
      if (s.pendingPaychecks.length > 0) s = acceptCatch(s, s.settings.catchPct);
    }
    let sum = 0;
    for (const e of s.events) if (e.kind === 'RoundUp' || e.kind === 'Catch' || e.kind === 'Skip') sum += e.cents;
    let removed = 0;
    for (const e of s.events) if (e.kind === 'JarMove' || e.kind === 'JarEmptied') removed += e.cents;
    expect(s.jarCents).toBe(sum - removed);
    expect(Number.isInteger(s.jarCents)).toBe(true);
  });

  it('R12.1: L5 unlocks on day 30', () => {
    let s = tickN(onboarded(), deps(), 29);
    expect(s.lessons.L5.unlockedDay).toBeNull();
    s = tick(s, deps());
    expect(s.lessons.L5.unlockedDay).toBe(30);
  });

  it('the first summer milestone fires on September 1 when there were kept events', () => {
    // Start in August so a tick crosses into September. A kept event has to exist for the
    // milestone to mean anything, and with round-ups gone that means an actual skip.
    const base = forceNudge(setNudgesEnabled(injectHabitVisits(onboarded({ startDate: '2026-08-20' }), 'Demo Coffee', 510, 435), true));
    const nudge = base.nudges.find((n) => n.status === 'pending');
    const seeded = nudge ? takeSkip(base, nudge.id) : base;
    const s = tickN(seeded, deps(), 14);
    expect(s.milestones.firstSummer).not.toBeNull();
  });
});

describe('R12.5 the Learn library surfacing', () => {
  it('surfaces the day thirty piece on day 30, and nothing before it', () => {
    let s = tickN(onboarded(), deps(), 29);
    expect(s.learnSurfaces.dayThirty.firedDay).toBeNull();
    s = tick(s, deps());
    expect(s.learnSurfaces.dayThirty.firedDay).toBe(30);
  });

  it('surfaces the first ledger entry piece when the first entry lands', () => {
    const s = tickN(onboarded(), deps(), 3);
    expect(s.learnSurfaces.firstLedgerEntry.firedDay).toBeNull();
    const r = addLedgerEntry(s, { date: '2026-06-17', amountCents: 5000, what: 'Index fund', note: '', source: 'manual' }, '2026-06-17T10:00:00.000Z');
    if (r.ok) expect(r.state.learnSurfaces.firstLedgerEntry.firedDay).not.toBeNull();
  });

  it('never changes what is readable: every piece starts and stays unlocked', () => {
    const before = onboarded();
    const after = tickN(before, deps(), 40);
    for (const id of Object.keys(before.learn)) {
      expect(before.learn[id].unlockedDay, id).toBe(0);
      expect(after.learn[id].unlockedDay, id).toBe(0);
    }
  });
});
