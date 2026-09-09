/**
 * Writes `shared/fixtures/rules-v2.json` (plan v2 section 7.3).
 *
 * **Read this before trusting the fixture.** Cases come from two places, and the difference
 * matters:
 *
 *  - **Hand specified.** Everything whose expected value can be worked out from section 4 by
 *    reading it: round-up, the two lower medians, the habit thresholds at their boundaries,
 *    nudge selection and the quiet hour edges, estimate averaging and its rounding, jar
 *    arithmetic, ledger validation and ordering, tree staging, the counters, and the schedule
 *    payload. These are written out below as literals, and this script FAILS if the
 *    implementation disagrees with one. That is the direction that catches a bug.
 *  - **Captured.** PRNG outputs, the minute of day draw, the summer curve endpoints and the
 *    tick summaries. There is no way to state these from the plan text: they are defined by
 *    the implementation, so capturing them is the only option, and the case is a regression
 *    guard rather than a specification. The seed determines every place, minute, estimate and
 *    nudge downstream, which is exactly why they are worth pinning (R2.0).
 *
 * Run with: npx tsx scripts/gen-rules-fixture.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { RULE_FNS } from '../tests/unit/ruleFns';

interface Case {
  id: string;
  rule: string;
  fn: string;
  in: Record<string, unknown>;
  out?: Record<string, unknown>;
  /** Set on a captured case, so the fixture says which of its numbers are specifications. */
  captured?: true;
}

const cases: Case[] = [];
let failures = 0;

/** A case whose expected output section 4 states or implies. Verified, not captured. */
function spec(id: string, rule: string, fn: string, input: Record<string, unknown>, expected: Record<string, unknown>): void {
  const actual = RULE_FNS[fn](input);
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    failures += 1;
    console.error(`MISMATCH ${id} (${rule}, ${fn}): plan says ${e}, code gives ${a}`);
  }
  cases.push({ id, rule, fn, in: input, out: expected });
}

/** A case whose expected output only the implementation can define. Captured, and labelled. */
function capture(id: string, rule: string, fn: string, input: Record<string, unknown>): void {
  cases.push({ id, rule, fn, in: input, out: RULE_FNS[fn](input), captured: true });
}

// ---------------------------------------------------------------------------------------
// R2.0 PRNG. Floor: 8 cases, the first eight outputs for seeds 42 and 0.
for (const seed of [42, 0]) {
  for (let i = 0; i < 4; i++) capture(`R2.0-s${seed}-${i}`, 'R2.0', 'mulberry32Uint32', { seed, index: i });
}
capture('R2.0-fnv-a', 'R2.0', 'fnv1a32', { text: 'spare change' });
capture('R2.0-fnv-b', 'R2.0', 'fnv1a32', { text: '' });
capture('R2.0-hash-a', 'R2.0', 'hash', { seed: 42, day: 0 });
capture('R2.0-hash-b', 'R2.0', 'hash', { seed: 42, day: 13 });

// ---------------------------------------------------------------------------------------
// R1.2 and R1.3. Half away from zero, and division rounded after, never before.
spec('R1.2-a', 'R1.2', 'roundCents', { value: 440.5 }, { cents: 441 });
spec('R1.2-b', 'R1.2', 'roundCents', { value: 440.4 }, { cents: 440 });
spec('R1.3-a', 'R1.3', 'averageCents', { sumCents: 1324, count: 3 }, { cents: 441 });
spec('R1.3-b', 'R1.3', 'averageCents', { sumCents: 1, count: 2 }, { cents: 1 });

// ---------------------------------------------------------------------------------------
// R2.1 round-up. Floor: 6.
spec('R2.1-a', 'R2.1', 'roundUpCents', { amountCents: 435 }, { cents: 65 });
spec('R2.1-b', 'R2.1', 'roundUpCents', { amountCents: 400 }, { cents: 0 });
spec('R2.1-c', 'R2.1', 'roundUpCents', { amountCents: 401 }, { cents: 99 });
spec('R2.1-d', 'R2.1', 'roundUpCents', { amountCents: 499 }, { cents: 1 });
spec('R2.1-e', 'R2.1', 'roundUpCents', { amountCents: 0 }, { cents: 0 });
spec('R2.1-f', 'R2.1', 'roundUpCents', { amountCents: 1 }, { cents: 99 });

// ---------------------------------------------------------------------------------------
// R2.4 minute of day. Floor: 8. Captured: the draw is defined by the PRNG, not by the plan.
for (const day of [0, 1, 7, 13]) {
  capture(`R2.4-a${day}`, 'R2.4', 'minuteOfDay', { seed: 42, dayIndex: day, merchantIndex: 0, usualMinute: 465, minuteSpread: 18 });
}
capture('R2.4-b0', 'R2.4', 'minuteOfDay', { seed: 0, dayIndex: 0, merchantIndex: 3, usualMinute: 750, minuteSpread: 40 });
capture('R2.4-b1', 'R2.4', 'minuteOfDay', { seed: 42, dayIndex: 5, merchantIndex: 3, usualMinute: 750, minuteSpread: 40 });
// The clamp at both ends, which the plan does state.
capture('R2.4-clamp-lo', 'R2.4', 'minuteOfDay', { seed: 42, dayIndex: 2, merchantIndex: 1, usualMinute: 0, minuteSpread: 600 });
capture('R2.4-clamp-hi', 'R2.4', 'minuteOfDay', { seed: 42, dayIndex: 2, merchantIndex: 1, usualMinute: 1439, minuteSpread: 600 });

// ---------------------------------------------------------------------------------------
// R3.2 to R3.5 habit. Floor: 12, including the exact thresholds 2 and 3 visits, spread 45 and 46.
spec('R3.3-a', 'R3.3', 'usualMinute', { minutes: [480, 495, 510, 505] }, { minute: 495 });
spec('R3.3-b', 'R3.3', 'usualMinute', { minutes: [480, 500, 520] }, { minute: 500 });
spec('R3.3-c', 'R3.3', 'usualMinute', { minutes: [600] }, { minute: 600 });
spec('R3.3-d', 'R3.3', 'usualMinute', { minutes: [] }, { minute: null });
spec('R3.4-a', 'R3.4', 'spreadMinutes', { minutes: [480, 500, 520], usualMinute: 500 }, { spread: 20 });
spec('R3.4-b', 'R3.4', 'spreadMinutes', { minutes: [455, 500, 545], usualMinute: 500 }, { spread: 45 });
spec('R3.4-c', 'R3.4', 'spreadMinutes', { minutes: [454, 500, 546], usualMinute: 500 }, { spread: 46 });
spec('R3.2-a', 'R3.2', 'isHabit', { minutes: [500, 500] }, { isHabit: false });
spec('R3.2-b', 'R3.2', 'isHabit', { minutes: [500, 500, 500] }, { isHabit: true });
spec('R3.5-a', 'R3.5', 'isHabit', { minutes: [455, 500, 545] }, { isHabit: true });
spec('R3.5-b', 'R3.5', 'isHabit', { minutes: [454, 500, 546] }, { isHabit: false });
spec('R3.5-c', 'R3.5', 'isHabit', { minutes: [] }, { isHabit: false });

// ---------------------------------------------------------------------------------------
// R4.2 to R4.4 nudges. Floor: 12, including 359, 360, 1260 and 1261 and the tie break.
spec('R4.2-a', 'R4.2', 'nudgeMinute', { usualMinute: 500 }, { minute: 480, sameDay: true });
spec('R4.2-b', 'R4.2', 'nudgeMinute', { usualMinute: 20 }, { minute: 0, sameDay: true });
spec('R4.2-c', 'R4.2', 'nudgeMinute', { usualMinute: 19 }, { minute: -1, sameDay: false });
spec('R4.3-a', 'R4.3', 'quietHoursAllow', { nudgeMinute: 359, quietStartMinute: 360, quietEndMinute: 1260 }, { allowed: false });
spec('R4.3-b', 'R4.3', 'quietHoursAllow', { nudgeMinute: 360, quietStartMinute: 360, quietEndMinute: 1260 }, { allowed: true });
spec('R4.3-c', 'R4.3', 'quietHoursAllow', { nudgeMinute: 1260, quietStartMinute: 360, quietEndMinute: 1260 }, { allowed: true });
spec('R4.3-d', 'R4.3', 'quietHoursAllow', { nudgeMinute: 1261, quietStartMinute: 360, quietEndMinute: 1260 }, { allowed: false });
spec(
  'R4.4-a',
  'R4.4',
  'selectNudge',
  {
    candidates: [
      { placeId: 'corner espresso', usualMinute: 500 },
      { placeId: 'campus coffee', usualMinute: 500 },
    ],
    quietStartMinute: 360,
    quietEndMinute: 1260,
  },
  { placeId: 'campus coffee', nudgeMinute: 480 },
);
spec(
  'R4.4-b',
  'R4.4',
  'selectNudge',
  {
    candidates: [
      { placeId: 'corner espresso', usualMinute: 500 },
      { placeId: 'campus coffee', usualMinute: 540 },
    ],
    quietStartMinute: 360,
    quietEndMinute: 1260,
  },
  { placeId: 'corner espresso', nudgeMinute: 480 },
);
spec(
  'R4.4-c',
  'R4.4',
  'selectNudge',
  { candidates: [{ placeId: 'late bar', usualMinute: 1300 }], quietStartMinute: 360, quietEndMinute: 1260 },
  { placeId: null, nudgeMinute: null },
);
spec(
  'R4.4-d',
  'R4.4',
  'selectNudge',
  { candidates: [{ placeId: 'dawn gym', usualMinute: 19 }], quietStartMinute: 360, quietEndMinute: 1260 },
  { placeId: null, nudgeMinute: null },
);
spec('R4.4-e', 'R4.4', 'selectNudge', { candidates: [], quietStartMinute: 360, quietEndMinute: 1260 }, { placeId: null, nudgeMinute: null });

// ---------------------------------------------------------------------------------------
// R5.1 and R5.2 estimate. Floor: 10, including the fifth and sixth visit boundary and a half.
spec('R5.1-a', 'R5.1', 'estimateCents', { amounts: [435, 500, 389] }, { cents: 441 });
spec('R5.1-b', 'R5.1', 'estimateCents', { amounts: [435] }, { cents: 435 });
spec('R5.1-c', 'R5.1', 'estimateCents', { amounts: [100, 101] }, { cents: 101 });
spec('R5.1-d', 'R5.1', 'estimateCents', { amounts: [100, 300] }, { cents: 200 });
spec('R5.2-a', 'R5.2', 'estimateCents', { amounts: [] }, { cents: null });
spec(
  'R5.1-e',
  'R5.1',
  'estimateFromVisits',
  {
    dayIndex: 20,
    visits: [
      { id: '20-0', dayIndex: 20, amountCents: 500 },
      { id: '19-0', dayIndex: 19, amountCents: 500 },
      { id: '18-0', dayIndex: 18, amountCents: 500 },
      { id: '17-0', dayIndex: 17, amountCents: 500 },
      { id: '16-0', dayIndex: 16, amountCents: 500 },
    ],
  },
  { cents: 500 },
);
spec(
  'R5.1-f',
  'R5.1',
  'estimateFromVisits',
  {
    dayIndex: 20,
    visits: [
      { id: '20-0', dayIndex: 20, amountCents: 500 },
      { id: '19-0', dayIndex: 19, amountCents: 500 },
      { id: '18-0', dayIndex: 18, amountCents: 500 },
      { id: '17-0', dayIndex: 17, amountCents: 500 },
      { id: '16-0', dayIndex: 16, amountCents: 500 },
      // The sixth is outside the last five and must not move the average.
      { id: '15-0', dayIndex: 15, amountCents: 100000 },
    ],
  },
  { cents: 500 },
);
spec(
  'R5.1-g',
  'R5.1',
  'estimateFromVisits',
  {
    dayIndex: 100,
    // Outside the 60 day window: no priced visit, so no estimate and no nudge (R3.6).
    visits: [{ id: '20-0', dayIndex: 20, amountCents: 500 }],
  },
  { cents: null },
);
spec(
  'R5.2-b',
  'R5.2',
  'estimateFromVisits',
  { dayIndex: 20, visits: [{ id: '20-0', dayIndex: 20, amountCents: null }] },
  { cents: null },
);
spec(
  'R5.1-h',
  'R5.1',
  'estimateFromVisits',
  {
    dayIndex: 20,
    // 441.5 rounds half away from zero to 442 (R1.2).
    visits: [
      { id: '20-0', dayIndex: 20, amountCents: 441 },
      { id: '19-0', dayIndex: 19, amountCents: 442 },
    ],
  },
  { cents: 442 },
);

// ---------------------------------------------------------------------------------------
// R6 jar. Floor: 6.
spec('R6.6-a', 'R6.6', 'addToJar', { jarCents: 0, amountCents: 65 }, { cents: 65 });
spec('R6.6-b', 'R6.6', 'addToJar', { jarCents: 65, amountCents: 0 }, { cents: 65 });
spec('R6.3-a', 'R6.3', 'crossedGoal', { beforeCents: 2400, afterCents: 2500, goalCents: 2500 }, { crossed: true });
spec('R6.3-b', 'R6.3', 'crossedGoal', { beforeCents: 2500, afterCents: 2600, goalCents: 2500 }, { crossed: false });
spec('R6.3-c', 'R6.3', 'isJarGoalPreset', { cents: 2500 }, { preset: true });
spec('R6.5-a', 'R6.5', 'emptiedJar', {}, { cents: 0 });

// ---------------------------------------------------------------------------------------
// R7 ledger. Floor: 8, ordering and validation.
spec('R7.1-a', 'R7.1', 'ledgerValidate', { date: '2026-06-15', amountCents: 5000, what: 'Index fund', note: '', currentDate: '2026-06-20' }, { ok: true, problems: [] });
spec('R7.1-b', 'R7.1', 'ledgerValidate', { date: '2026-06-21', amountCents: 5000, what: 'Index fund', note: '', currentDate: '2026-06-20' }, { ok: false, problems: ['dateFuture'] });
spec('R7.1-c', 'R7.1', 'ledgerValidate', { date: '2026-06-15', amountCents: 0, what: 'Index fund', note: '', currentDate: '2026-06-20' }, { ok: false, problems: ['amount'] });
spec('R7.1-d', 'R7.1', 'ledgerValidate', { date: '2026-06-15', amountCents: 5000, what: '   ', note: '', currentDate: '2026-06-20' }, { ok: false, problems: ['what'] });
spec('R7.1-e', 'R7.1', 'ledgerValidate', { date: '2026-06-15', amountCents: 5000, what: 'x'.repeat(61), note: '', currentDate: '2026-06-20' }, { ok: false, problems: ['whatTooLong'] });
spec('R7.1-f', 'R7.1', 'ledgerValidate', { date: '2026-06-15', amountCents: 100000001, what: 'Index fund', note: '', currentDate: '2026-06-20' }, { ok: false, problems: ['amountTooLarge'] });
spec('R7.2-a', 'R7.2', 'ledgerTotalCents', { amounts: [5000, 2500, 1] }, { cents: 7501 });
spec(
  'R7.5-a',
  'R7.5',
  'ledgerOrder',
  {
    entries: [
      { id: 'led:1', date: '2026-06-15', createdAt: '2026-06-15T10:00:00.000Z', amountCents: 1, what: 'a', note: '', source: 'manual' },
      { id: 'led:2', date: '2026-06-16', createdAt: '2026-06-16T10:00:00.000Z', amountCents: 1, what: 'b', note: '', source: 'manual' },
      { id: 'led:3', date: '2026-06-15', createdAt: '2026-06-15T11:00:00.000Z', amountCents: 1, what: 'c', note: '', source: 'manual' },
    ],
  },
  { ids: ['led:2', 'led:3', 'led:1'] },
);
spec(
  'R7.5-b',
  'R7.5',
  'ledgerOrder',
  {
    entries: [
      { id: 'led:1', date: '2026-06-15', createdAt: '2026-06-15T10:00:00.000Z', amountCents: 1, what: 'a', note: '', source: 'manual' },
      { id: 'led:2', date: '2026-06-15', createdAt: '2026-06-15T10:00:00.000Z', amountCents: 1, what: 'b', note: '', source: 'manual' },
    ],
  },
  { ids: ['led:2', 'led:1'] },
);

// ---------------------------------------------------------------------------------------
// R8 tree. Floor: 6. Table [0, 0, 7, 21, 45, 90, 180].
spec('R8.1-a', 'R8.1', 'treeStage', { dayIndex: 0, firstKeptDay: null }, { stage: 0 });
spec('R8.1-b', 'R8.1', 'treeStage', { dayIndex: 0, firstKeptDay: 0 }, { stage: 1 });
spec('R8.1-c', 'R8.1', 'treeStage', { dayIndex: 7, firstKeptDay: 0 }, { stage: 2 });
spec('R8.1-d', 'R8.1', 'treeStage', { dayIndex: 20, firstKeptDay: 0 }, { stage: 2 });
spec('R8.1-e', 'R8.1', 'treeStage', { dayIndex: 21, firstKeptDay: 0 }, { stage: 3 });
// 190 days since the first kept event, which is past the 180 in the table's last slot.
spec('R8.2-a', 'R8.2', 'treeStage', { dayIndex: 200, firstKeptDay: 10 }, { stage: 6 });

// ---------------------------------------------------------------------------------------
// R9 counters.
spec(
  'R9.1-a',
  'R9.1',
  'keptCounters',
  {
    dayIndex: 10,
    events: [
      { kind: 'RoundUp', dayIndex: 3, cents: 65 },
      { kind: 'Catch', dayIndex: 4, cents: 2500 },
      { kind: 'Skip', dayIndex: 9, cents: 441 },
      { kind: 'JarEmptied', dayIndex: 9, cents: 3006 },
    ],
  },
  // R9.1's window is dayIndex > currentDay - 7, so day 3 is out and day 4 is in: 2500 + 441.
  { keptThisWeekCents: 2941, skipsThisWeek: 1, keptSinceStartCents: 3006 },
);
spec(
  'R9.4-a',
  'R9.4',
  'keptCounters',
  // A missed nudge writes nothing, so nothing here can move. There is no streak to break.
  { dayIndex: 10, events: [] },
  { keptThisWeekCents: 0, skipsThisWeek: 0, keptSinceStartCents: 0 },
);

// ---------------------------------------------------------------------------------------
// R10 summer. Floor: 6. Captured for the curves; R10.2 is stated arithmetic.
capture('R10.1-a', 'R10.1', 'summerEndDollars', { earnedCents: 300000 });
capture('R10.1-b', 'R10.1', 'summerEndDollars', { earnedCents: null });
capture('R10.1-c', 'R10.1', 'summerEndDollars', { earnedCents: 100000 });
// round(100 * 1.07 ^ max(1, 30 - 19)) = round(100 * 1.07 ^ 11).
spec('R10.2-a', 'R10.2', 'byThirtyDollars', { keptCents: 10000, age: 19 }, { dollars: 210 });
spec('R10.2-b', 'R10.2', 'byThirtyDollars', { keptCents: 10000, age: 30 }, { dollars: 107 });
spec('R10.2-c', 'R10.2', 'keepOfLeftCents', { leftCents: 50000 }, { cents: 5000 });
// R10.4 your money curve. A lump sum growing at 7% from the clamped age to 65.
// 19 to 65 is 46 steps of growth and 47 points: round(41.49 * 1.07 ^ 46) = 932.
spec('R10.4-a', 'R10.4', 'yourMoneyEnd', { putInCents: 4149, age: 19 }, { fromAge: 19, steps: 47, startCents: 4149, endDollars: 932, hasMoney: true });
// Nothing put in yet: no money, and the line never goes negative.
spec('R10.4-b', 'R10.4', 'yourMoneyEnd', { putInCents: 0, age: 19 }, { fromAge: 19, steps: 47, startCents: 0, endDollars: 0, hasMoney: false });
// An age outside the 18 to 24 audience is clamped before it is used.
capture('R10.4-c', 'R10.4', 'yourMoneyEnd', { putInCents: 10000, age: 99 });

// ---------------------------------------------------------------------------------------
// R13 tick ordering. Floor: 8. Captured: a tick summary is defined by the whole pipeline.
for (const days of [1, 7, 14, 30]) {
  capture(`R13-n${days}`, 'R13', 'tickSummary', { seed: 42, startDate: '2026-06-15', nudgesEnabled: true, days });
}
capture('R13-off14', 'R13', 'tickSummary', { seed: 42, startDate: '2026-06-15', nudgesEnabled: false, days: 14 });
capture('R13-seed0', 'R13', 'tickSummary', { seed: 0, startDate: '2026-06-15', nudgesEnabled: true, days: 14 });
capture('R13-jan', 'R13', 'tickSummary', { seed: 42, startDate: '2026-01-05', nudgesEnabled: true, days: 14 });
capture('R13-n60', 'R13', 'tickSummary', { seed: 42, startDate: '2026-06-15', nudgesEnabled: true, days: 60 });

// ---------------------------------------------------------------------------------------
// R14.2 schedule payload. Floor: 6, including a null minute and a suppressed nudge.
spec(
  'R14.2-a',
  'R14.2',
  'nudgeSchedulePayload',
  { nudge: { nudgeMinute: 460, status: 'pending' }, date: '2026-06-29', quietStartMinute: 360, quietEndMinute: 1260 },
  { nudgeLocalDate: '2026-06-29', nudgeLocalMinute: 460 },
);
spec(
  'R14.2-b',
  'R14.2',
  'nudgeSchedulePayload',
  { nudge: null, date: '2026-06-29', quietStartMinute: 360, quietEndMinute: 1260 },
  { nudgeLocalDate: '2026-06-29', nudgeLocalMinute: null },
);
spec(
  'R14.2-c',
  'R14.2',
  'nudgeSchedulePayload',
  // R4.2 suppressed it: the nudge minute is before midnight.
  { nudge: { nudgeMinute: -1, status: 'pending' }, date: '2026-06-29', quietStartMinute: 360, quietEndMinute: 1260 },
  { nudgeLocalDate: '2026-06-29', nudgeLocalMinute: null },
);
spec(
  'R14.2-d',
  'R14.2',
  'nudgeSchedulePayload',
  // R4.3 suppressed it: outside quiet hours.
  { nudge: { nudgeMinute: 1300, status: 'pending' }, date: '2026-06-29', quietStartMinute: 360, quietEndMinute: 1260 },
  { nudgeLocalDate: '2026-06-29', nudgeLocalMinute: null },
);
spec(
  'R14.2-e',
  'R14.2',
  'nudgeSchedulePayload',
  // Already resolved, so the schedule is cleared.
  { nudge: { nudgeMinute: 460, status: 'skipped' }, date: '2026-06-29', quietStartMinute: 360, quietEndMinute: 1260 },
  { nudgeLocalDate: '2026-06-29', nudgeLocalMinute: null },
);
spec(
  'R14.2-f',
  'R14.2',
  'nudgeSchedulePayload',
  { nudge: { nudgeMinute: 360, status: 'pending' }, date: '2026-07-01', quietStartMinute: 360, quietEndMinute: 1260 },
  { nudgeLocalDate: '2026-07-01', nudgeLocalMinute: 360 },
);

// ---------------------------------------------------------------------------------------
if (failures > 0) {
  console.error(`\n${failures} hand specified case(s) disagree with the implementation. Fixture NOT written.`);
  process.exit(1);
}

const out = {
  version: 2,
  note:
    'Plan v2 section 7.3. Generated by scripts/gen-rules-fixture.ts and run by tests/unit/parity.test.ts. A case without "captured" states an expected value taken from section 4 and the generator refuses to write the file if the implementation disagrees with one. A case with "captured": true was produced by the implementation, because the plan text cannot state it: those are regression guards on the seed, the curves and the tick pipeline, not specifications.',
  caseCount: cases.length,
  cases,
};

const dir = resolve(process.cwd(), 'shared/fixtures');
mkdirSync(dir, { recursive: true });
writeFileSync(resolve(dir, 'rules-v2.json'), `${JSON.stringify(out, null, 2)}\n`, 'utf8');

const byRule = new Map<string, number>();
for (const c of cases) byRule.set(c.rule, (byRule.get(c.rule) ?? 0) + 1);
console.log(`rules-v2.json written: ${cases.length} cases, ${byRule.size} rules`);
console.log([...byRule.entries()].map(([r, n]) => `${r}:${n}`).join(' '));
