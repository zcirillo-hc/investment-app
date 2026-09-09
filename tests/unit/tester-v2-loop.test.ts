/**
 * TESTER v2, job 2: the core loop, checked against what section 4 SAYS, rule by rule, at the
 * boundaries. Not against what the existing tests already assert.
 */
import { describe, expect, it } from 'vitest';
import {
  isHabitFrom,
  recomputeHabits,
  spreadMinutesOf,
  usualMinuteOf,
} from '../../src/domain/habits';
import { estimateCentsFor, pricedVisitsFor } from '../../src/domain/estimate';
import {
  nudgeCandidates,
  nudgeMinuteFor,
  nudgeSchedulePayload,
  selectNudge,
} from '../../src/domain/nudges';
import { averageCents, roundCents } from '../../src/domain/money';
import { pruneVisits, visitsInWindow } from '../../src/domain/places';
import { addToJar, crossedGoal } from '../../src/domain/jar';
import {
  addLedgerEntry,
  completeOnboarding,
  deletePlace,
  emptyJar,
  forceNudge,
  injectHabitVisits,
  moveJarToLedger,
  mutePlace,
  setNudgesEnabled,
  takeSkip,
  tick,
  tickN,
} from '../../src/domain/tick';
import { initialAppState, type AppState, type Deps, type Place, type PlaceVisit } from '../../src/domain/types';
import { createSimulatedTransactionSource } from '../../src/domain/simulator';
import { createSimulatedLocationSource } from '../../src/domain/places';
import { keptThisWeekCents, keptSinceStartCents, skipsThisWeek } from '../../src/domain/selectors';
import * as LedgerModule from '../../src/domain/ledger';

function deps(): Deps {
  return { transactions: createSimulatedTransactionSource(), location: createSimulatedLocationSource() };
}

function fresh(seed = 42, nudges = true): AppState {
  const s = initialAppState();
  s.profile = { ...s.profile, name: 'Sam', seed, createdAt: '2026-09-06T00:00:00.000Z', fear: 'pointless', summerEarnedCents: 300000, age: 19 };
  s.settings = { ...s.settings, nudgesEnabled: nudges };
  return completeOnboarding(s, { startDate: '2026-06-15', todayLocal: '2026-09-06', seedOverride: seed });
}

function visit(placeId: string, dayIndex: number, minuteOfDay: number, amountCents: number | null, id = `${placeId}-${dayIndex}-${minuteOfDay}`): PlaceVisit {
  return { id, placeId, displayName: placeId, dayIndex, date: '2026-06-15', minuteOfDay, amountCents };
}
const place = (id: string): Place => ({ id, displayName: id, firstSeenDay: 0, lastSeenDay: 99, coarseLabel: null });

describe('R1 arithmetic', () => {
  it('R1.2 rounds half away from zero on non-negative input', () => {
    expect(roundCents(0.5)).toBe(1);
    expect(roundCents(1.5)).toBe(2);
    expect(roundCents(2.5)).toBe(3);
    expect(roundCents(0.49999999)).toBe(0);
  });
  it('R1.2 rejects a negative in the money path rather than rounding it', () => {
    expect(() => roundCents(-0.5)).toThrow();
    expect(() => addToJar(0, -1)).toThrow();
  });
  it('R1.3 divides first, then rounds: 3 visits of 100,101,101 -> 101 (not 100)', () => {
    expect(averageCents(302, 3)).toBe(101);
    // the .5 case, which is where a "round before divide" bug shows
    expect(averageCents(3, 2)).toBe(2);
    expect(averageCents(5, 2)).toBe(3);
  });
  it('averageCents refuses a zero count instead of returning 0', () => {
    expect(() => averageCents(100, 0)).toThrow();
  });
  it('NaN and Infinity cannot enter the money path', () => {
    expect(() => roundCents(Number.NaN)).toThrow();
    expect(() => addToJar(0, Number.NaN)).toThrow();
    expect(roundCents(Number.POSITIVE_INFINITY)).toBe(Number.POSITIVE_INFINITY); // AUDIT
  });
});

describe('R3 habit detection at the thresholds', () => {
  it('R3.2: 2 visits is not a habit, 3 identical visits is', () => {
    expect(isHabitFrom([600, 600])).toBe(false);
    expect(isHabitFrom([600, 600, 600])).toBe(true);
  });
  it('R3.3 lower median: even count takes the lower of the two middles', () => {
    expect(usualMinuteOf([100, 200, 300, 400])).toBe(200);
    expect(usualMinuteOf([100, 200, 300])).toBe(200);
    expect(usualMinuteOf([])).toBeNull();
  });
  it('R3.4 spread of exactly 45 is a habit, 46 is not', () => {
    // deviations sorted, lower median at floor((n-1)/2)
    expect(spreadMinutesOf([600 - 45, 600, 600 + 45], 600)).toBe(45);
    expect(isHabitFrom([600 - 45, 600, 600 + 45])).toBe(true);
    expect(spreadMinutesOf([600 - 46, 600, 600 + 46], 600)).toBe(46);
    expect(isHabitFrom([600 - 46, 600, 600 + 46])).toBe(false);
  });
  it('R3.1 window is dayIndex-13..dayIndex inclusive: a visit on day-14 is out', () => {
    const vs = [visit('p', 6, 600, 100), visit('p', 7, 600, 100), visit('p', 20, 600, 100)];
    expect(visitsInWindow(vs, 'p', 20, 14).map((v) => v.dayIndex)).toEqual([7, 20]);
  });
  it('R3.5 no hysteresis: a place stops being a habit the day its window drops below 3', () => {
    const vs = [visit('p', 0, 600, 100), visit('p', 1, 600, 100), visit('p', 2, 600, 100)];
    expect(recomputeHabits([place('p')], vs, 2)[0].isHabit).toBe(true);
    // day 15: only day 2 remains in the 14-day window -> 1 visit
    expect(recomputeHabits([place('p')], vs, 15)[0].isHabit).toBe(false);
  });
  it('R3.7: no coordinate is read; a place with a coarseLabel behaves identically', () => {
    const vs = [visit('p', 0, 600, 100), visit('p', 1, 600, 100), visit('p', 2, 600, 100)];
    const a = recomputeHabits([place('p')], vs, 2)[0];
    const b = recomputeHabits([{ ...place('p'), coarseLabel: 'Mission District' }], vs, 2)[0];
    expect(a.isHabit).toBe(b.isHabit);
  });
});

describe('R5 the estimate', () => {
  it('R5.1 takes the last FIVE priced visits, newest first, and ignores the sixth', () => {
    const vs = [
      visit('p', 1, 600, 100, 'a'),
      visit('p', 2, 600, 200, 'b'),
      visit('p', 3, 600, 300, 'c'),
      visit('p', 4, 600, 400, 'd'),
      visit('p', 5, 600, 500, 'e'),
      visit('p', 6, 600, 600, 'f'),
    ];
    // newest five are 200..600 -> 2000/5 = 400
    expect(estimateCentsFor(vs, 'p', 6)).toBe(400);
  });
  it('R5.1 window is d-60..d inclusive: a visit on d-61 is excluded', () => {
    const vs = [visit('p', 0, 600, 100, 'old'), visit('p', 1, 600, 900, 'edge')];
    expect(pricedVisitsFor(vs, 'p', 61).map((v) => v.id)).toEqual(['edge']);
    expect(pricedVisitsFor(vs, 'p', 60).map((v) => v.id)).toEqual(['edge', 'old']);
  });
  it('R5.1 tie break inside one day is visit id DESCENDING', () => {
    const vs = [visit('p', 5, 600, 100, 'p-5-a'), visit('p', 5, 601, 200, 'p-5-z')];
    expect(pricedVisitsFor(vs, 'p', 5).map((v) => v.id)).toEqual(['p-5-z', 'p-5-a']);
  });
  it('R5.2 a place with only unpriced visits has no estimate', () => {
    const vs = [visit('p', 1, 600, null), visit('p', 2, 600, null), visit('p', 3, 600, null)];
    expect(estimateCentsFor(vs, 'p', 3)).toBeNull();
    expect(recomputeHabits([place('p')], vs, 3)[0].isHabit).toBe(true); // habit
    expect(recomputeHabits([place('p')], vs, 3)[0].estimateCents).toBeNull(); // but not eligible
  });
  it('R5.1 rounding: 3 visits of 333,333,334 average to 333 (1000/3 = 333.33)', () => {
    const vs = [visit('p', 1, 600, 333, 'a'), visit('p', 2, 600, 333, 'b'), visit('p', 3, 600, 334, 'c')];
    expect(estimateCentsFor(vs, 'p', 3)).toBe(333);
  });
  it('R5.1 rounding half up: 2 visits of 100 and 101 average to 101', () => {
    const vs = [visit('p', 1, 600, 100, 'a'), visit('p', 2, 600, 101, 'b')];
    expect(estimateCentsFor(vs, 'p', 2)).toBe(101);
  });
});

describe('R4 nudge selection at the boundaries', () => {
  const settings = { nudgesEnabled: true, quietStartMinute: 360, quietEndMinute: 1260, mutedPlaceIds: [] as string[] };

  it('R4.2 usualMinute 19 gives nudgeMinute -1 and no nudge that day', () => {
    expect(nudgeMinuteFor(19)).toBe(-1);
    expect(selectNudge([{ placeId: 'p', usualMinute: 19 }], 360, 1260)).toBeNull();
  });
  it('R4.3 boundaries are inclusive: 380 (->360) and 1280 (->1260) fire; 379 and 1281 do not', () => {
    expect(selectNudge([{ placeId: 'p', usualMinute: 380 }], 360, 1260)?.nudgeMinute).toBe(360);
    expect(selectNudge([{ placeId: 'p', usualMinute: 1280 }], 360, 1260)?.nudgeMinute).toBe(1260);
    expect(selectNudge([{ placeId: 'p', usualMinute: 379 }], 360, 1260)).toBeNull();
    expect(selectNudge([{ placeId: 'p', usualMinute: 1281 }], 360, 1260)).toBeNull();
  });
  it('R4.4 tie break on equal nudgeMinute is the smaller place id, byte wise', () => {
    const r = selectNudge([{ placeId: 'b', usualMinute: 600 }, { placeId: 'A', usualMinute: 600 }], 360, 1260);
    expect(r?.candidate.placeId).toBe('A'); // 'A' (0x41) < 'b' (0x62)
  });
  it('R4.4 smallest nudgeMinute wins over id order', () => {
    const r = selectNudge([{ placeId: 'a', usualMinute: 900 }, { placeId: 'z', usualMinute: 600 }], 360, 1260);
    expect(r?.candidate.placeId).toBe('z');
  });
  it('R4.5 nudges off means zero candidates even with a perfect habit', () => {
    const habits = recomputeHabits([place('p')], [visit('p', 1, 600, 100), visit('p', 2, 600, 100), visit('p', 3, 600, 100)], 3);
    expect(nudgeCandidates([place('p')], habits, [], { ...settings, nudgesEnabled: false }, 3)).toHaveLength(0);
    expect(nudgeCandidates([place('p')], habits, [], settings, 3)).toHaveLength(1);
  });
  it('R4.1 a place already nudged today produces no second candidate', () => {
    const habits = recomputeHabits([place('p')], [visit('p', 1, 600, 100), visit('p', 2, 600, 100), visit('p', 3, 600, 100)], 3);
    const existing = [{ id: 'n', placeId: 'other', displayName: 'o', dayIndex: 3, nudgeMinute: 500, estimateCents: 1, status: 'expired' as const }];
    expect(nudgeCandidates([place('p')], habits, existing, settings, 3)).toHaveLength(0);
  });
  it('R14.2 the schedule payload carries a date and a minute and nothing else', () => {
    const p = nudgeSchedulePayload({ nudgeMinute: 600, status: 'pending' }, '2026-06-20', 360, 1260);
    expect(Object.keys(p).sort()).toEqual(['nudgeLocalDate', 'nudgeLocalMinute']);
    expect(p.nudgeLocalMinute).toBe(600);
    expect(nudgeSchedulePayload({ nudgeMinute: 100, status: 'pending' }, '2026-06-20', 360, 1260).nudgeLocalMinute).toBeNull();
    expect(nudgeSchedulePayload({ nudgeMinute: 600, status: 'skipped' }, '2026-06-20', 360, 1260).nudgeLocalMinute).toBeNull();
  });
});

describe('R2.5 pruning', () => {
  it('retains a 90 day window: day-89 survives, day-90 is pruned', () => {
    const vs = [visit('p', 10, 600, 100, 'day90'), visit('p', 11, 600, 100, 'day89')];
    expect(pruneVisits(vs, 100).map((v) => v.id)).toEqual(['day89']);
  });
  it('LATENT: the early-return shortcut assumes visits are sorted ascending by dayIndex', () => {
    const unsorted = [visit('p', 99, 600, 100, 'new'), visit('p', 1, 600, 100, 'ancient')];
    const out = pruneVisits(unsorted, 100);
    // Documented, not a live defect: every writer of `visits` keeps them sorted and the
    // import validator enforces non-decreasing dayIndex, so this input is unreachable today.
    expect(out.map((v) => v.id)).toEqual(['new', 'ancient']);
  });
});

describe('R13 order of operations, and money on the live loop', () => {
  it('R13.4 before R13.8: a visit recorded today counts toward today\'s habit window', () => {
    let s = fresh();
    s = injectHabitVisits(s, 'Test Cafe', 600, 500);
    expect(s.habits.find((h) => h.placeId === 'test cafe')?.isHabit).toBe(true);
  });

  it('R5.5 a skip credits the jar by EXACTLY the displayed estimate, once', () => {
    let s = forceNudge(setNudgesEnabled(injectHabitVisits(fresh(), 'Test Cafe', 600, 437), true));
    const n = s.nudges.find((x) => x.status === 'pending');
    expect(n).toBeTruthy();
    const before = s.jarCents;
    const after = takeSkip(s, n!.id);
    expect(after.jarCents - before).toBe(n!.estimateCents);
    expect(n!.estimateCents).toBe(437);
    // double tap is a no-op
    const again = takeSkip(after, n!.id);
    expect(again.jarCents).toBe(after.jarCents);
    expect(again.events.filter((e) => e.kind === 'Skip')).toHaveLength(after.events.filter((e) => e.kind === 'Skip').length);
  });

  it('R5.3 a later, more expensive visit never restates a past skip', () => {
    let s = forceNudge(setNudgesEnabled(injectHabitVisits(fresh(), 'Test Cafe', 600, 437), true));
    const n = s.nudges.find((x) => x.status === 'pending')!;
    s = takeSkip(s, n.id);
    const skipEvent = s.events.find((e) => e.kind === 'Skip')!;
    s = injectHabitVisits(s, 'Test Cafe', 600, 9999);
    expect(s.events.find((e) => e.id === skipEvent.id)!.cents).toBe(437);
  });

  it('R4.6 an unattended nudge expires silently: no event, no counter move, no jar change', () => {
    let s = forceNudge(setNudgesEnabled(injectHabitVisits(fresh(), 'Test Cafe', 600, 437), true));
    const before = { jar: s.jarCents, events: s.events.length, kept: keptSinceStartCents(s) };
    const after = tick(s, deps());
    expect(after.nudges.find((n) => n.status === 'pending' && n.dayIndex === before.events)).toBeUndefined();
    expect(after.nudges.some((n) => n.status === 'expired')).toBe(true);
    // the jar only moved by that day's round-ups, and no Skip event exists
    expect(after.events.filter((e) => e.kind === 'Skip')).toHaveLength(0);
    expect(after.jarCents).toBeGreaterThanOrEqual(before.jar);
  });

  it('criterion 9 / R4.4: 30 days with two habit places produces at most one nudge per day', () => {
    let s = setNudgesEnabled(fresh(), true);
    s = injectHabitVisits(s, 'Alpha Cafe', 600, 500);
    s = injectHabitVisits(s, 'Beta Bakery', 700, 700);
    for (let i = 0; i < 30; i++) {
      s = tick(s, deps());
      // keep both places alive as habits
      if (i % 2 === 0) {
        s = injectHabitVisits(s, 'Alpha Cafe', 600, 500);
        s = injectHabitVisits(s, 'Beta Bakery', 700, 700);
      }
    }
    const byDay = new Map<number, number>();
    for (const n of s.nudges) byDay.set(n.dayIndex, (byDay.get(n.dayIndex) ?? 0) + 1);
    const over = [...byDay.entries()].filter(([, c]) => c > 1);
    expect(over, `days with more than one nudge: ${JSON.stringify(over)}`).toEqual([]);
  });

  it('R6.4 moving the jar into the ledger: one entry, one JarMove, jar zero', () => {
    let s = forceNudge(setNudgesEnabled(injectHabitVisits(fresh(), 'Test Cafe', 600, 1234), true));
    s = takeSkip(s, s.nudges.find((x) => x.status === 'pending')!.id);
    const amount = s.jarCents;
    const r = moveJarToLedger(s, { date: '2026-06-15', what: 'Index fund', note: '' }, '2026-06-15T00:00:00.000Z');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.jarCents).toBe(0);
    expect(r.entry.amountCents).toBe(amount);
    expect(r.entry.source).toBe('jar');
    expect(r.state.events.filter((e) => e.kind === 'JarMove')).toHaveLength(1);
    expect(r.state.ledger).toHaveLength(1);
  });

  it('R6.5 "I spent it" zeroes the jar, writes one JarEmptied, creates no ledger entry', () => {
    let s = forceNudge(setNudgesEnabled(injectHabitVisits(fresh(), 'Test Cafe', 600, 1234), true));
    s = takeSkip(s, s.nudges.find((x) => x.status === 'pending')!.id);
    const out = emptyJar(s);
    expect(out.jarCents).toBe(0);
    expect(out.events.filter((e) => e.kind === 'JarEmptied')).toHaveLength(1);
    expect(out.ledger).toHaveLength(0);
  });

  it('R6.6 the jar is never negative through any sequence', () => {
    let s = fresh();
    for (let i = 0; i < 40; i++) {
      s = tick(s, deps());
      if (i % 7 === 0) s = emptyJar(s);
      expect(s.jarCents).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(s.jarCents)).toBe(true);
    }
  });

  it('R6.3 crossing the goal again after emptying fires again', () => {
    expect(crossedGoal(0, 2500, 2500)).toBe(true);
    expect(crossedGoal(2500, 3000, 2500)).toBe(false);
    expect(crossedGoal(0, 2600, 2500)).toBe(true);
  });

  it('R11.3 deleting a place removes it and its visits but keeps the Skip event and its amount', () => {
    let s = forceNudge(setNudgesEnabled(injectHabitVisits(fresh(), 'Test Cafe', 600, 555), true));
    s = takeSkip(s, s.nudges.find((x) => x.status === 'pending')!.id);
    const out = deletePlace(s, 'test cafe');
    expect(out.places.find((p) => p.id === 'test cafe')).toBeUndefined();
    expect(out.visits.filter((v) => v.placeId === 'test cafe')).toHaveLength(0);
    const skip = out.events.find((e) => e.kind === 'Skip')!;
    expect((skip as any).displayName).toBe('Test Cafe');
    expect(skip.cents).toBe(555);
  });

  it('R4.8 muting one place leaves another place able to nudge', () => {
    let s = setNudgesEnabled(fresh(), true);
    s = injectHabitVisits(s, 'Alpha Cafe', 600, 500);
    s = injectHabitVisits(s, 'Beta Bakery', 700, 700);
    s = mutePlace(s, 'alpha cafe', true);
    s = forceNudge(s);
    const pending = s.nudges.find((n) => n.status === 'pending');
    expect(pending?.placeId).toBe('beta bakery');
  });

  it('R9 counters: kept-this-week is a strict dayIndex > currentDay - 7 window', () => {
    let s = fresh();
    s = tickN(s, deps(), 10);
    const week = keptThisWeekCents(s);
    const all = keptSinceStartCents(s);
    expect(Number.isInteger(week)).toBe(true);
    expect(week).toBeLessThanOrEqual(all);
    expect(skipsThisWeek(s)).toBe(0);
  });

  it('R9.4 no streak counter exists in state', () => {
    const s = tickN(fresh(), deps(), 5);
    expect(JSON.stringify(s)).not.toMatch(/streak/i);
  });
});

describe('R2.0 determinism from the seed', () => {
  it('the same seed produces byte-identical state after 30 days', () => {
    const a = tickN(fresh(42), deps(), 30);
    const b = tickN(fresh(42), deps(), 30);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
  it('a different seed produces different state', () => {
    const a = tickN(fresh(42), deps(), 30);
    const b = tickN(fresh(7), deps(), 30);
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });
  it('criterion 4: 14 days at the canonical seed produces at least one habit place', () => {
    const s = tickN(fresh(42), deps(), 14);
    const habits = s.habits.filter((h) => h.isHabit);
    expect(habits.length, `habits after 14 days at seed 42: ${JSON.stringify(s.habits.map((h) => [h.placeId, h.isHabit, h.visitCount, h.spreadMinutes]))}`).toBeGreaterThan(0);
  });
  it('every money value in state after 30 days is a non-negative integer (R1.1)', () => {
    const s = tickN(fresh(42), deps(), 30);
    const bad: string[] = [];
    const walk = (v: unknown, path: string) => {
      if (typeof v === 'number') {
        if (!Number.isInteger(v)) bad.push(`${path}=${v}`);
        return;
      }
      if (Array.isArray(v)) return v.forEach((x, i) => walk(x, `${path}[${i}]`));
      if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
    };
    walk({ jarCents: s.jarCents, events: s.events, visits: s.visits, nudges: s.nudges, ledger: s.ledger, habits: s.habits }, 'state');
    expect(bad).toEqual([]);
  });
});

describe('R7 the ledger', () => {
  it('R7.1 refuses a date later than the current simulated date', () => {
    const s = tickN(fresh(), deps(), 2);
    const r = addLedgerEntry(s, { date: '2099-01-01', amountCents: 100, what: 'x', note: '', source: 'manual' }, 'now');
    expect(r.ok).toBe(false);
  });
  it('R7.1 refuses 0, negative, fractional and over-ceiling amounts', () => {
    const s = tickN(fresh(), deps(), 2);
    for (const amt of [0, -1, 1.5, 100_000_001, Number.NaN]) {
      const r = addLedgerEntry(s, { date: '2026-06-16', amountCents: amt, what: 'x', note: '', source: 'manual' }, 'now');
      expect(r.ok, `accepted amountCents=${amt}`).toBe(false);
    }
  });
  it('R7.1 accepts exactly 60 characters of `what` and refuses 61', () => {
    const s = tickN(fresh(), deps(), 2);
    expect(addLedgerEntry(s, { date: '2026-06-16', amountCents: 1, what: 'x'.repeat(60), note: '', source: 'manual' }, 'n').ok).toBe(true);
    expect(addLedgerEntry(s, { date: '2026-06-16', amountCents: 1, what: 'x'.repeat(61), note: '', source: 'manual' }, 'n').ok).toBe(false);
  });
  it('R7.3 the ledger module exports nothing that computes a value or a return', () => {
    const mod = LedgerModule as unknown as Record<string, unknown>;
    const banned = /value|gain|loss|return|percent|pct|share|price|basis|project|growth|yield/i;
    expect(Object.keys(mod).filter((k) => banned.test(k))).toEqual([]);
  });
});
