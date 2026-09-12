/**
 * Plan v2 section 7.3: the web half of the parity dispatcher. `fn` names in
 * `shared/fixtures/rules-v2.json` are identical strings in both languages, and each maps to
 * the implementation here. A `fn` present in the fixture with no entry here is a test
 * failure, not a skip (see `parity.test.ts`).
 *
 * Nothing in this file has logic of its own. Every entry is a thin adapter onto a domain
 * function, so a fixture case can never pass against test-only arithmetic.
 */
import { fnv1a32, hash, mulberry32Uint32 } from '../../src/domain/prng';
import { visitMinuteFor } from '../../src/domain/simulator';
import { isHabitFrom, spreadMinutesOf, usualMinuteOf } from '../../src/domain/habits';
import { isNudgeMinuteOnSameDay, isWithinQuietHours, nudgeMinuteFor, nudgeSchedulePayload, selectNudge } from '../../src/domain/nudges';
import { estimateCentsFor, estimateFromAmounts } from '../../src/domain/estimate';
import { addToJar, crossedGoal, emptiedJar, isJarGoalPreset } from '../../src/domain/jar';
import { ledgerTotalCents, sortedLedger, validateDraft } from '../../src/domain/ledger';
import { treeStage } from '../../src/domain/tree';
import { maturityOf } from '../../src/domain/maturity';
import { byThirtyDollars, keepOfLeftCents, summerCurves, yourMoneyCurve } from '../../src/domain/summer';
import { averageCents, roundCents } from '../../src/domain/money';
import { bestSkipWeek, keptThisWeekCents, keptSinceStartCents, skipsThisWeek } from '../../src/domain/selectors';
import { completeOnboarding, tickN } from '../../src/domain/tick';
import { createSimulatedTransactionSource } from '../../src/domain/simulator';
import { createSimulatedLocationSource } from '../../src/domain/places';
import { initialAppState, type AppState, type Deps, type LedgerEntry, type LedgerEvent, type PlaceVisit } from '../../src/domain/types';

type Json = Record<string, unknown>;

function deps(): Deps {
  return { transactions: createSimulatedTransactionSource(), location: createSimulatedLocationSource() };
}

function onboarded(seed: number, startDate: string, nudgesEnabled: boolean): AppState {
  const s = initialAppState();
  s.profile = { ...s.profile, name: 'Fixture', seed, createdAt: '2026-09-08T00:00:00.000Z', fear: 'pointless' };
  s.settings = { ...s.settings, nudgesEnabled };
  return completeOnboarding(s, { startDate, todayLocal: '2026-09-08', seedOverride: null });
}

export const RULE_FNS: Record<string, (input: Json) => Json> = {
  // R2.0
  mulberry32Uint32: (i) => {
    const rng = mulberry32Uint32(i.seed as number);
    let v = 0;
    for (let n = 0; n <= (i.index as number); n++) v = rng();
    return { value: v };
  },
  fnv1a32: (i) => ({ value: fnv1a32(i.text as string) }),
  hash: (i) => ({ value: hash(i.seed as number, i.day as number) }),

  // R1.2 and R1.3
  roundCents: (i) => ({ cents: roundCents(i.value as number) }),
  averageCents: (i) => ({ cents: averageCents(i.sumCents as number, i.count as number) }),

  // R2.4
  minuteOfDay: (i) => ({
    minute: visitMinuteFor(i.seed as number, i.dayIndex as number, i.merchantIndex as number, i.usualMinute as number, i.minuteSpread as number),
  }),

  // R3.3, R3.4, R3.2 / R3.5
  usualMinute: (i) => ({ minute: usualMinuteOf(i.minutes as number[]) }),
  spreadMinutes: (i) => ({ spread: spreadMinutesOf(i.minutes as number[], i.usualMinute as number) }),
  isHabit: (i) => ({ isHabit: isHabitFrom(i.minutes as number[]) }),

  // R4.2, R4.3, R4.4
  nudgeMinute: (i) => ({ minute: nudgeMinuteFor(i.usualMinute as number), sameDay: isNudgeMinuteOnSameDay(nudgeMinuteFor(i.usualMinute as number)) }),
  quietHoursAllow: (i) => ({
    allowed: isWithinQuietHours(i.nudgeMinute as number, i.quietStartMinute as number, i.quietEndMinute as number),
  }),
  selectNudge: (i) => {
    const chosen = selectNudge(
      i.candidates as { placeId: string; usualMinute: number }[],
      i.quietStartMinute as number,
      i.quietEndMinute as number,
    );
    return chosen === null ? { placeId: null, nudgeMinute: null } : { placeId: chosen.candidate.placeId, nudgeMinute: chosen.nudgeMinute };
  },

  // R5.1, R5.2
  estimateCents: (i) => ({ cents: estimateFromAmounts(i.amounts as number[]) }),
  estimateFromVisits: (i) => {
    const visits = (i.visits as { id: string; dayIndex: number; amountCents: number | null }[]).map(
      (v): PlaceVisit => ({
        id: v.id,
        placeId: 'p',
        displayName: 'P',
        dayIndex: v.dayIndex,
        date: '2026-06-15',
        minuteOfDay: 0,
        amountCents: v.amountCents,
      }),
    );
    return { cents: estimateCentsFor(visits, 'p', i.dayIndex as number) };
  },

  // R6.3, R6.6
  addToJar: (i) => ({ cents: addToJar(i.jarCents as number, i.amountCents as number) }),
  crossedGoal: (i) => ({ crossed: crossedGoal(i.beforeCents as number, i.afterCents as number, i.goalCents as number) }),
  emptiedJar: () => ({ cents: emptiedJar() }),
  isJarGoalPreset: (i) => ({ preset: isJarGoalPreset(i.cents as number) }),

  // R7.1, R7.2, R7.5
  ledgerValidate: (i) => {
    const r = validateDraft(
      { date: i.date as string, amountCents: i.amountCents as number, what: i.what as string, note: i.note as string, source: 'manual' },
      i.currentDate as string,
    );
    return r.ok ? { ok: true, problems: [] } : { ok: false, problems: r.problems };
  },
  ledgerTotalCents: (i) => ({
    cents: ledgerTotalCents((i.amounts as number[]).map((a, n) => ({ id: `x${n}`, amountCents: a } as LedgerEntry))),
  }),
  ledgerOrder: (i) => ({
    ids: sortedLedger(i.entries as LedgerEntry[]).map((e) => e.id),
  }),

  // R14.2
  nudgeSchedulePayload: (i) => {
    const n = i.nudge as { nudgeMinute: number; status?: 'pending' | 'skipped' | 'expired' } | null;
    return nudgeSchedulePayload(n, i.date as string, i.quietStartMinute as number, i.quietEndMinute as number) as unknown as Json;
  },

  // R8.1, R8.2: the lifetime skip count in, the stage out (changed 2026-09-12).
  treeStage: (i) => ({ stage: treeStage(i.skips as number) }),

  // R9.1, R9.2, R9.3
  keptCounters: (i) => {
    const state = {
      ...initialAppState(),
      clock: { startDate: '2026-06-15', dayIndex: i.dayIndex as number, lastOpenedRealDate: '' },
      events: (i.events as { kind: string; dayIndex: number; cents: number }[]).map(
        (e, n) => ({ ...e, id: `e${n}`, date: '2026-06-15' } as unknown as LedgerEvent),
      ),
    };
    return {
      keptThisWeekCents: keptThisWeekCents(state),
      skipsThisWeek: skipsThisWeek(state),
      keptSinceStartCents: keptSinceStartCents(state),
    };
  },

  // R10.1, R10.2
  summerEndDollars: (i) => {
    const c = summerCurves(i.earnedCents as number | null);
    return { endNow: Math.round(c.endNow), endAt30: Math.round(c.endAt30), yearlyKeep: Math.round(c.yearlyKeep) };
  },
  byThirtyDollars: (i) => ({ dollars: byThirtyDollars(i.keptCents as number, i.age as number) }),
  keepOfLeftCents: (i) => ({ cents: keepOfLeftCents(i.leftCents as number | null) }),

  // R10.4
  yourMoneyEnd: (i) => {
    const c = yourMoneyCurve(i.putInCents as number, i.age as number);
    return {
      fromAge: c.fromAge,
      steps: c.ages.length,
      startCents: Math.round(c.values[0] * 100),
      endDollars: Math.round(c.endValue),
      hasMoney: c.hasMoney,
    };
  },

  // R16
  maturityValue: (i) => {
    const m = maturityOf(i.principalCents as number, i.yieldBps as number, i.termMonths as number);
    return m ? { valueCents: m.valueAtMaturityCents, interestCents: m.interestCents } : { valueCents: 0, interestCents: 0 };
  },

  // R17
  bestSkipWeek: (i) => {
    const days = i.days as number[];
    const state = { events: days.map((d) => ({ kind: 'Skip', dayIndex: d, cents: 1, date: '2026-06-15' })), clock: { dayIndex: 999 } };
    return { best: bestSkipWeek(state as never) };
  },

  // R13
  tickSummary: (i) => {
    const start = onboarded(i.seed as number, i.startDate as string, i.nudgesEnabled as boolean);
    const s = tickN(start, deps(), i.days as number);
    const nudge = s.nudges[0] ?? null;
    return {
      dayIndex: s.clock.dayIndex,
      jarCents: s.jarCents,
      keptSinceStartCents: keptSinceStartCents(s),
      placeCount: s.places.length,
      visitCount: s.visits.length,
      habitCount: s.habits.filter((h) => h.isHabit).length,
      nudgeCount: s.nudges.length,
      firstNudgePlaceId: nudge ? nudge.placeId : null,
      firstNudgeMinute: nudge ? nudge.nudgeMinute : null,
      firstNudgeEstimateCents: nudge ? nudge.estimateCents : null,
    };
  },
};
