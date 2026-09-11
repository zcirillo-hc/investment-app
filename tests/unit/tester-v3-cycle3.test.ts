/**
 * TESTER, cycle 3 (2026-09-10): re-verification of V2-1 to V2-8 and an adversarial pass over
 * everything since 580b222 (R10.1 by age, R10.4, R16, round-up removal, R17, R18, the relaxed
 * R15 and its lint).
 *
 * Convention, same as cycle 2: a case whose title starts DEFECT fails today on purpose, and its
 * assertion message names the finding and prints the measured value as AUDIT-RESULT. When the
 * defect is fixed the case goes green with no edit here. Everything else must pass.
 *
 * Cycle 5 (2026-09-11): every defect this file filed is fixed, so every case here must pass. A
 * case still titled DEFECT is a green regression guard for its fixed defect. Three cases encoded
 * behavior the owner changed on purpose (R16.8 on import, V2-22's copy) and were rewritten to the
 * decision; each says so inline.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateImportedState } from '../../src/state/validate';
import { exportStateJson, parseImport, pickAppState } from '../../src/state/persistence';
import {
  acceptCatch,
  addLedgerEntry,
  completeOnboarding,
  emptyJar,
  forceNudge,
  injectHabitVisits,
  landDemoPaycheck,
  moveJarToLedger,
  setNudgesEnabled,
  takeSkip,
  tickN,
  updateLedgerEntry,
} from '../../src/domain/tick';
import { initialAppState, KEPT_KINDS, type AppState, type Deps, type LedgerEntry } from '../../src/domain/types';
import { createSimulatedTransactionSource } from '../../src/domain/simulator';
import { createSimulatedLocationSource } from '../../src/domain/places';
import { validateDraft, type LedgerDraft } from '../../src/domain/ledger';
import { MAX_TERM_MONTHS, MAX_YIELD_BPS, isBondRow, maturityOf } from '../../src/domain/maturity';
import { formatCents } from '../../src/domain/money';
import { byThirtyDollars, summerCurves, yourMoneyCurve } from '../../src/domain/summer';
import {
  bestSkipWeek,
  currentDate,
  firstKeptDay,
  keptFromSkipsCents,
  keptSinceStartCents,
  keptThisSummer,
  keptThisWeekCents,
  ledgerTotal,
  putAsideCents,
  todayStats,
} from '../../src/domain/selectors';
import { S } from '../../src/content/strings';
import { LESSON_BY_ID } from '../../src/content/lessons';
import { checkText } from '../../scripts/lint-advice';

function deps(): Deps {
  return { transactions: createSimulatedTransactionSource(), location: createSimulatedLocationSource() };
}
function onboarded(): AppState {
  const s0 = initialAppState();
  s0.profile = { ...s0.profile, name: 'Sam', seed: 42, createdAt: '2026-06-15T00:00:00.000Z', fear: 'pointless', summerEarnedCents: 300000 };
  return completeOnboarding(s0, { startDate: '2026-06-15', todayLocal: '2026-06-15', seedOverride: null });
}
/** One real skip of the $4.35 demo habit, which is how money reaches the jar now. */
function skipped(s: AppState): AppState {
  const t = forceNudge(setNudgesEnabled(injectHabitVisits(s, 'Demo Coffee', 510, 435), true));
  const n = t.nudges.find((x) => x.status === 'pending');
  if (!n) throw new Error('fixture: no pending nudge');
  return takeSkip(t, n.id);
}
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

// ---------------------------------------------------------------------------------------------
describe('ruling on the orchestrator\'s inversion of tester-v2-import-impact.test.ts', () => {
  // Identical to the impact file's base(), so the ruling is about that file's inputs.
  function impactBase(): AppState {
    const s = initialAppState();
    s.profile = { ...s.profile, name: 'Sam', seed: 42, createdAt: '2026-09-06T00:00:00.000Z', fear: 'pointless', summerEarnedCents: 300000 };
    const st = tickN(completeOnboarding(s, { startDate: '2026-06-15', todayLocal: '2026-09-06', seedOverride: null }), deps(), 5);
    const r = addLedgerEntry(st, { date: '2026-06-16', amountCents: 5000, what: 'Index fund', note: '', source: 'manual' }, '2026-06-16T10:00:00.000Z');
    return r.ok ? r.state : st;
  }

  it('control: the unmodified base file is accepted, so a rejection below is caused by the mutation', () => {
    const r = validateImportedState(clone(pickAppState(impactBase())));
    expect(r.ok, r.ok ? '' : r.problems.join('\n')).toBe(true);
  });

  it('the orphan visit is rejected for the orphan and for nothing else', () => {
    const g = clone(pickAppState(impactBase())) as any;
    expect(g.visits.length, 'fixture must have a visit to copy').toBeGreaterThan(0);
    const v = clone(g.visits[0]);
    v.id = 'orphan';
    v.placeId = 'a-place-that-was-deleted';
    v.displayName = 'A Place That Was Deleted';
    v.dayIndex = g.clock.dayIndex;
    g.visits.push(v);
    const r = validateImportedState(g);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    // eslint-disable-next-line no-console
    console.log(`AUDIT-RESULT orphan-visit problems: ${JSON.stringify(r.problems)}`);
    expect(r.problems).toHaveLength(1);
    expect(r.problems[0]).toMatch(/^visits\[\d+\]\.placeId: expected to name a place in this file/);
  });

  it('the two-nudge file is rejected for R4.4 and for nothing else; the same two nudges on two days are accepted', () => {
    const mk = (d1: number, d2: number) => {
      const g = clone(pickAppState(impactBase())) as any;
      g.nudges = [
        { id: 'nudge:a', placeId: 'p', displayName: 'P', dayIndex: d1, nudgeMinute: 500, estimateCents: 100, status: 'expired' },
        { id: 'nudge:b', placeId: 'q', displayName: 'Q', dayIndex: d2, nudgeMinute: 600, estimateCents: 200, status: 'pending' },
      ];
      return validateImportedState(g);
    };
    const day = impactBase().clock.dayIndex;
    const same = mk(day, day);
    expect(same.ok).toBe(false);
    if (!same.ok) {
      // eslint-disable-next-line no-console
      console.log(`AUDIT-RESULT two-nudge problems: ${JSON.stringify(same.problems)}`);
      expect(same.problems).toHaveLength(1);
      expect(same.problems[0]).toMatch(/^nudges\[1\]\.dayIndex: expected at most one nudge per day/);
    }
    const apart = mk(day - 1, day);
    expect(apart.ok, apart.ok ? '' : apart.problems.join('\n')).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------
describe('R16 bond and CD terms', () => {
  function withBond(): { state: AppState; entry: LedgerEntry } {
    const s = tickN(onboarded(), deps(), 3);
    const r = addLedgerEntry(
      s,
      { date: currentDate(s), amountCents: 100000, what: 'Bonds or CDs', note: '', source: 'manual', termMonths: 12, yieldBps: 450 },
      '2026-06-18T10:00:00.000Z',
    );
    if (!r.ok) throw new Error(`fixture: ${r.problems.join(',')}`);
    return { state: r.state, entry: r.entry };
  }

  it('control: the saved entry carries both fields and matures to $1,045.00', () => {
    const { entry } = withBond();
    expect(entry.termMonths).toBe(12);
    expect(entry.yieldBps).toBe(450);
    expect(maturityOf(entry.amountCents, entry.yieldBps!, entry.termMonths!)!.valueAtMaturityCents).toBe(104500);
  });

  it('DEFECT: a note edit through the Invest edit form erases the term and rate', () => {
    const { state, entry } = withBond();
    // Byte for byte the draft src/components/LedgerForm.tsx submits: it has no term or rate
    // field, so `onSave({ date, amountCents: cents, what, note, source })` is all it can send.
    const draft: LedgerDraft = { date: entry.date, amountCents: entry.amountCents, what: entry.what, note: 'from my bank statement', source: entry.source };
    const r = updateLedgerEntry(state, entry.id, draft);
    expect(r.ok).toBe(true);
    const after = r.state.ledger.find((e) => e.id === entry.id)!;
    const exported = JSON.parse(exportStateJson(r.state)).ledger.find((e: LedgerEntry) => e.id === entry.id);
    expect(
      { termMonths: after.termMonths, yieldBps: after.yieldBps },
      `AUDIT-RESULT R16 edit: before term=12 rate=450, after a note-only edit term=${after.termMonths} rate=${after.yieldBps}, export keys=${Object.keys(exported).join(',')}`,
    ).toEqual({ termMonths: 12, yieldBps: 450 });
  });

  it('after the wipe the export has no undefined keys and still round-trips', () => {
    const { state, entry } = withBond();
    const r = updateLedgerEntry(state, entry.id, { date: entry.date, amountCents: entry.amountCents, what: entry.what, note: 'x', source: entry.source });
    const json = exportStateJson(r.state);
    expect(json).not.toMatch(/"termMonths":\s*null|"yieldBps":\s*null|undefined/);
    expect(parseImport(json).ok).toBe(true);
  });

  it('validateDraft: both ceilings are inclusive, one past each is rejected, and each is independently optional', () => {
    const d = (termMonths?: number, yieldBps?: number) =>
      validateDraft(
        { date: '2026-06-15', amountCents: 100, what: 'Bonds or CDs', note: '', source: 'manual', ...(termMonths !== undefined ? { termMonths } : {}), ...(yieldBps !== undefined ? { yieldBps } : {}) },
        '2026-06-20',
      );
    const probs = (v: ReturnType<typeof d>) => (v.ok ? [] : v.problems);
    expect(d(MAX_TERM_MONTHS, MAX_YIELD_BPS).ok).toBe(true);
    expect(probs(d(MAX_TERM_MONTHS + 1, 450))).toEqual(['term']);
    expect(probs(d(12, MAX_YIELD_BPS + 1))).toEqual(['yield']);
    expect(d(12, undefined).ok, 'a term with no rate is allowed by R16.2').toBe(true);
    expect(d(undefined, 450).ok, 'a rate with no term is allowed by R16.2').toBe(true);
    for (const bad of [0, -1, 12.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(probs(d(bad, 450)), `term ${bad}`).toEqual(['term']);
      expect(probs(d(12, bad)), `rate ${bad}`).toEqual(['yield']);
    }
  });

  // Cycle 5 reconciliation. This case asserted R16.2's old import rule: refuse any term or rate
  // that is present and unusable. The owner's 2026-09-11 decision (R16.8, V2-21) changed that on
  // purpose: a number the rules cannot use is removed from the row and the row is kept; only a
  // value that is not a number at all is still a damaged file. Same inputs, new rule.
  it('R16.8: import removes every present number the rules cannot use and keeps the row, still refuses every non-number, and accepts the ceilings untouched', () => {
    const base = clone(pickAppState(withBond().state)) as any;
    const idx = base.ledger.length - 1;
    const numbers: Array<[string, unknown]> = [
      ['termMonths', 601], ['termMonths', 0], ['termMonths', -12], ['termMonths', 12.5],
      ['yieldBps', MAX_YIELD_BPS + 1], ['yieldBps', 5001], ['yieldBps', 0], ['yieldBps', 4.5],
    ];
    const notNumbers: Array<[string, unknown]> = [['termMonths', '12'], ['termMonths', null], ['yieldBps', '450'], ['yieldBps', null]];
    const wrong: string[] = [];
    for (const [k, v] of numbers) {
      const g = clone(base);
      g.ledger[idx][k] = v;
      const r = validateImportedState(g);
      if (!r.ok) {
        wrong.push(`${k}=${JSON.stringify(v)} refused: ${r.problems[0]}`);
        continue;
      }
      const e = r.state.ledger[idx] as any;
      const b = base.ledger[idx];
      const other = k === 'termMonths' ? 'yieldBps' : 'termMonths';
      if (r.tidied !== 1 || k in e || e.amountCents !== b.amountCents || e.what !== b.what || e.date !== b.date || e[other] !== b[other]) {
        wrong.push(`${k}=${JSON.stringify(v)} tidied=${r.tidied} row=${JSON.stringify(e)}`);
      }
    }
    for (const [k, v] of notNumbers) {
      const g = clone(base);
      g.ledger[idx][k] = v;
      const r = validateImportedState(g);
      if (r.ok) wrong.push(`${k}=${JSON.stringify(v)} accepted, but it is not a number`);
      else expect(r.problems.join(' ')).toMatch(new RegExp(`ledger\\[${idx}\\]\\.${k}`));
    }
    expect(wrong).toEqual([]);
    const g = clone(base);
    g.ledger[idx].termMonths = MAX_TERM_MONTHS;
    g.ledger[idx].yieldBps = MAX_YIELD_BPS;
    const atCeiling = validateImportedState(g);
    expect(atCeiling.ok && atCeiling.tidied).toBe(0);
  });

  // Cycle 5 reconciliation. The V2-12 defect (a 30 year "contract" on a stock row) stays fixed;
  // what changed is how. The file used to be refused whole; under R16.8 it imports and the term
  // and rate are removed from that row, so no line can render on it either way.
  it('V2-12 regression under R16.8: a CD rate and term on an Individual stocks row imports with both removed, so Invest cannot render a projection on it', () => {
    const g = clone(pickAppState(withBond().state)) as any;
    const idx = g.ledger.length - 1;
    g.ledger[idx].what = 'Individual stocks';
    g.ledger[idx].termMonths = 360;
    g.ledger[idx].yieldBps = 1000;
    const r = validateImportedState(g);
    expect(r.ok, r.ok ? '' : r.problems.join('\n')).toBe(true);
    if (!r.ok) return;
    const e = r.state.ledger[idx];
    expect({ tidied: r.tidied, term: e.termMonths, rate: e.yieldBps, what: e.what, amount: e.amountCents }).toEqual({
      tidied: 1,
      term: undefined,
      rate: undefined,
      what: 'Individual stocks',
      amount: 100000,
    });
    // Invest.tsx renders a line only for a bond row that carries both.
    expect(isBondRow(e) && e.termMonths !== undefined && e.yieldBps !== undefined).toBe(false);
  });

  it('DEFECT: the largest inputs the app\'s own ceilings allow produce a figure past 2^53, where cents stop being exact (R1.1)', () => {
    const m = maturityOf(100_000_000, MAX_YIELD_BPS, MAX_TERM_MONTHS)!;
    expect(
      Number.isSafeInteger(m.valueAtMaturityCents),
      `AUDIT-RESULT $1,000,000 at ${(MAX_YIELD_BPS / 100).toFixed(2)}% for ${MAX_TERM_MONTHS / 12} years -> ${m.valueAtMaturityCents} cents, rendered "${formatCents(m.valueAtMaturityCents)}"`,
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------
describe('R10.4 Your money: what it grows', () => {
  // Cycle 4 reconciliation. This used to recompute the screen's formula inline
  // (keptSinceStartCents + ledgerTotal), so when the owner changed R10.4 on 2026-09-10 the two
  // cases below kept testing the retired formula instead of the screen. That was a flaw in this
  // file, not in the fix. It now calls the selector the screen calls, and the control below
  // pins that the screen still calls it, so the two cannot drift apart again.
  const putIn = (s: AppState) => putAsideCents(s);

  it('control: SummerMoney.tsx computes Your money through putAsideCents, not the retired formula', () => {
    const src = readFileSync(resolve('src/screens/SummerMoney.tsx'), 'utf8').replace(/^\s*\/\/.*$/gm, '');
    expect(src).toMatch(/const putInCents = putAsideCents\(state\);/);
    expect(src).not.toMatch(/keptSinceStartCents\s*\(/);
  });

  // Cycle 5 reconciliation: the copy this control pinned is the copy V2-22 (mine) asked to change.
  it('control: one $4.35 skip reads "You have $4.35 set aside right now." (V2-22 copy)', () => {
    const s = skipped(onboarded());
    expect(putIn(s)).toBe(435);
    expect(S.summer.yourMoneyPutIn(putIn(s))).toBe('You have $4.35 set aside right now.');
  });

  it('V2-9 regression: moving that jar into an investment counts the same $4.35 once', () => {
    const s = skipped(onboarded());
    const r = moveJarToLedger(s, { date: currentDate(s), what: 'Index fund', note: '' }, '2026-06-15T12:00:00.000Z');
    if (!r.ok) throw new Error('fixture');
    const after = r.state;
    expect(
      putIn(after),
      `AUDIT-RESULT kept=${formatCents(keptSinceStartCents(after))} moved=${formatCents(ledgerTotal(after))} jar=${formatCents(after.jarCents)}; Your money says "${S.summer.yourMoneyPutIn(putIn(after))}" and grows ${formatCents(putIn(after))} to $${Math.round(yourMoneyCurve(putIn(after), 19).endValue)} at 65`,
    ).toBe(435);
  });

  it('V2-9 regression: money the user told the app they spent is not grown as "your money"', () => {
    const s = emptyJar(skipped(onboarded()));
    expect(
      putIn(s),
      `AUDIT-RESULT after "I spent it": jar=${formatCents(s.jarCents)} moved=${formatCents(ledgerTotal(s))}; Your money says "${S.summer.yourMoneyPutIn(putIn(s))}"`,
    ).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------
describe('R10.1 the age drives the curve, the title and extraPutIn', () => {
  const K = 300; // 10% of the $3,000 onboarding figure
  for (let age = 18; age <= 24; age++) {
    it(`age ${age}: curve starts at ${age}, extraPutIn is (30 - ${age}) x K, title and headline agree`, () => {
      const c = summerCurves(300000, age);
      expect(c.startAge).toBe(age);
      expect(c.ages[0]).toBe(age);
      expect(c.ages[c.ages.length - 1]).toBe(65);
      expect(c.ages).toHaveLength(65 - age + 1);
      expect(c.startNow[0]).toBe(0);
      expect(c.extraPutIn).toBeCloseTo((30 - age) * K, 9);
      // Independent recomputation of both endpoints.
      let a = 0;
      let b = 0;
      for (let y = age; y < 65; y++) {
        a = (a + K) * 1.07;
        b = y >= 30 ? (b + K) * 1.07 : 0;
      }
      expect(c.endNow).toBeCloseTo(a, 6);
      expect(c.endAt30).toBeCloseTo(b, 6);
      expect(S.summer.chartTitle(c.startAge)).toContain(`from ${age},`);
      const h = S.summer.headline(c.diff, c.extraPutIn, c.startAge);
      expect(h.startsWith(`Starting at ${age} means putting in $${((30 - age) * K).toLocaleString('en-US')}`), h).toBe(true);
      expect(h).not.toMatch(/NaN|Infinity|undefined/);
    });
  }

  it('tampered ages clamp into 18 to 24 and never produce NaN, Infinity or a negative', () => {
    for (const age of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -5, 0, 17, 17.4, 24.6, 25, 30, 99, 1e9]) {
      const c = summerCurves(300000, age);
      expect(c.startAge, `age ${age}`).toBeGreaterThanOrEqual(18);
      expect(c.startAge, `age ${age}`).toBeLessThanOrEqual(24);
      expect([...c.startNow, ...c.startAt30, c.diff, c.extraPutIn].every((v) => Number.isFinite(v) && v >= 0), `age ${age}`).toBe(true);
      const m = yourMoneyCurve(1000, age);
      expect(m.values.every(Number.isFinite), `your money, age ${age}`).toBe(true);
    }
  });

  it('the largest figures the validator allows stay finite on every summer and your-money output', () => {
    const c = summerCurves(1e13, 18);
    const m = yourMoneyCurve(1e13, 18);
    const all = [...c.startNow, ...c.startAt30, c.diff, c.extraPutIn, ...m.values, byThirtyDollars(1e13, 18)];
    expect(all.every(Number.isFinite)).toBe(true);
    expect(S.summer.headline(c.diff, c.extraPutIn, c.startAge)).not.toMatch(/NaN|Infinity/);
    expect(S.summer.yourMoneyHeadline(m.endValue, m.fromAge)).not.toMatch(/NaN|Infinity/);
  });
});

// ---------------------------------------------------------------------------------------------
describe('R17 best week', () => {
  const st = (days: number[]) =>
    ({
      events: days.map((d, i) => ({ kind: 'Skip', id: `s${i}`, dayIndex: d, cents: 100, date: '2026-06-15' })),
      clock: { dayIndex: days.length ? Math.max(...days) : 0 },
    }) as unknown as AppState;
  const brute = (days: number[]) => {
    let best = 0;
    for (const d of days) best = Math.max(best, days.filter((x) => x >= d && x - d < 7).length);
    return best;
  };
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);

  it('equals a brute force maximum over 500 random histories, duplicates and gaps included', () => {
    for (let t = 0; t < 500; t++) {
      const n = Math.floor(rnd() * 40);
      const days = Array.from({ length: n }, () => Math.floor(rnd() * 60));
      expect(bestSkipWeek(st(days)), JSON.stringify(days)).toBe(brute(days));
    }
  });

  it('never falls as history grows one day at a time over 2,000 days', () => {
    const days: number[] = [];
    let last = 0;
    for (let d = 0; d < 2000; d++) {
      if (rnd() < 0.3) days.push(d);
      if (rnd() < 0.05) days.push(d);
      const b = bestSkipWeek(st(days));
      expect(b, `day ${d}`).toBeGreaterThanOrEqual(last);
      last = b;
    }
  });

  it('the 7 day edge: 1 and 7 together, 1 and 8 apart, and a burst on one day counts in full', () => {
    expect(bestSkipWeek(st([1, 7]))).toBe(2);
    expect(bestSkipWeek(st([1, 8]))).toBe(1);
    expect(bestSkipWeek(st([3, 3, 3, 3, 10]))).toBe(4);
    expect(bestSkipWeek(st([0, 6, 6, 13]))).toBe(3);
  });

  it('10,000 skips compute in well under a frame budget', () => {
    const days = Array.from({ length: 10000 }, (_, i) => Math.floor(i / 3));
    const t0 = performance.now();
    const b = bestSkipWeek(st(days));
    const ms = performance.now() - t0;
    // eslint-disable-next-line no-console
    console.log(`AUDIT-RESULT bestSkipWeek(10,000) = ${b} in ${ms.toFixed(1)} ms`);
    expect(b).toBe(21);
    expect(ms).toBeLessThan(250);
  });

  it('R17.4 and theme 5: no shipped copy names a streak, a miss, a shortfall, urgency, or "only $"', () => {
    const FORBIDDEN = /\b(streaks?|in a row|missed|miss a day|broke your|broken (run|chain|streak)|behind schedule|fall(ing)? behind|short of|shortfall|don['’]t break|last chance|hurry|expires?|only \$|just \$)/i;
    const hits: string[] = [];
    const ts = readFileSync(resolve('src/content/strings.ts'), 'utf8').replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of ts.matchAll(/(['`])((?:(?!\1)[^\\]|\\.)*)\1/g)) if (FORBIDDEN.test(m[2])) hits.push(`strings.ts: ${m[2].slice(0, 100)}`);
    for (const f of ['learn', 'lessons', 'tooltips', 'holdingTypes']) {
      const raw = readFileSync(resolve(`shared/content/${f}.json`), 'utf8');
      for (const m of raw.matchAll(/"((?:[^"\\]|\\.)*)"/g)) if (FORBIDDEN.test(m[1]) && !/^note$/.test(m[1])) hits.push(`${f}.json: ${m[1].slice(0, 100)}`);
    }
    // The `note` fields in the JSON files are developer documentation, not UI copy.
    const ui = hits.filter((h) => !/Plan v2|R15\.|R18|holding types the invest capture|test ids/.test(h));
    expect(ui, ui.join('\n')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
describe('legacy RoundUp profiles (the author\'s weak point 1)', () => {
  function legacyFile(): { file: any; roundUpCents: number } {
    let s = tickN(onboarded(), deps(), 6);
    s = skipped(s);
    s = acceptCatch(landDemoPaycheck(s), 5);
    const g = clone(pickAppState(s)) as any;
    delete g.push;
    // R2.1 exactly as it used to run: every Purchase produced a RoundUp straight after it,
    // (100 - cents mod 100) mod 100, and none for an exact dollar.
    const out: any[] = [];
    let sum = 0;
    let n = 0;
    for (const e of g.events) {
      out.push(e);
      if (e.kind === 'Purchase') {
        const c = (100 - (e.cents % 100)) % 100;
        if (c > 0) {
          out.push({ kind: 'RoundUp', id: `legacy-ru-${n++}`, dayIndex: e.dayIndex, date: e.date, purchaseId: e.purchaseId, merchant: e.merchant, purchaseCents: e.cents, cents: c });
          sum += c;
        }
      }
    }
    g.events = out;
    g.jarCents += sum;
    g.settings.roundUpsPaused = true;
    return { file: g, roundUpCents: sum };
  }
  const keptWhere = (s: AppState, pred: (e: any) => boolean) =>
    s.events.filter((e) => (KEPT_KINDS as string[]).includes(e.kind) && pred(e)).reduce((a, e) => a + (e as any).cents, 0);

  it('imports, and every "kept" selector counts the same legacy amounts the same way', () => {
    const { file, roundUpCents } = legacyFile();
    expect(roundUpCents, 'fixture must actually contain round-ups').toBeGreaterThan(0);
    const r = parseImport(JSON.stringify(file));
    expect(r.ok, r.ok ? '' : r.problems.join('\n')).toBe(true);
    if (!r.ok) return;
    const s = r.state;
    const today = currentDate(s);
    const skips = s.events.filter((e) => e.kind === 'Skip').reduce((a, e) => a + (e as any).cents, 0);
    const rows = {
      keptSinceStart: [keptSinceStartCents(s), keptWhere(s, () => true)],
      keptThisWeek: [keptThisWeekCents(s), keptWhere(s, (e) => e.dayIndex > s.clock.dayIndex - 7)],
      keptThisSummer: [keptThisSummer(s), keptWhere(s, (e) => e.date >= '2026-06-01' && e.date <= today)],
      todayKept: [todayStats(s).keptCents, keptWhere(s, (e) => e.dayIndex === s.clock.dayIndex)],
      keptFromSkips: [keptFromSkipsCents(s), skips],
    };
    // eslint-disable-next-line no-console
    console.log(`AUDIT-RESULT legacy: roundUps=${roundUpCents} ${JSON.stringify(rows)} firstKeptDay=${firstKeptDay(s)}`);
    for (const [k, [got, want]] of Object.entries(rows)) expect(got, k).toBe(want);
    expect(keptSinceStartCents(s)).toBeGreaterThan(keptFromSkipsCents(s));
    expect(firstKeptDay(s)).toBe(s.events.find((e) => e.kind === 'RoundUp')!.dayIndex);
  });

  it('a legacy profile keeps ticking, creates no new round-up, and the jar does not move on its own', () => {
    const { file } = legacyFile();
    const r = parseImport(JSON.stringify(file));
    if (!r.ok) throw new Error(r.problems.join('\n'));
    const before = r.state.events.filter((e) => e.kind === 'RoundUp').length;
    const t = tickN(r.state, deps(), 5);
    expect(t.events.filter((e) => e.kind === 'RoundUp').length).toBe(before);
    expect(t.jarCents).toBe(r.state.jarCents);
  });

  it('records: the stray settings.roundUpsPaused key survives the import and every later export', () => {
    const { file } = legacyFile();
    const r = parseImport(JSON.stringify(file));
    if (!r.ok) throw new Error(r.problems.join('\n'));
    const out = exportStateJson(r.state);
    // eslint-disable-next-line no-console
    console.log(`AUDIT-RESULT roundUpsPaused in re-export: ${out.includes('"roundUpsPaused"')}`);
    expect(parseImport(out).ok).toBe(true);
  });

  it('DEFECT: an import carries a coordinate and an address on a ledger entry, an event and the profile straight into the next export (R11.1, R11.5, criterion 13)', () => {
    const { file } = legacyFile();
    file.events[0].lat = 40.7128;
    file.events[0].lon = -74.006;
    file.profile.homeAddress = '12 Elm Street';
    file.settings.coords = { lat: 40.7128, lng: -74.006 };
    const r = parseImport(JSON.stringify(file));
    expect(r.ok, r.ok ? '' : r.problems.join('\n')).toBe(true);
    if (!r.ok) return;
    const out = exportStateJson(r.state);
    const leaked = [...out.matchAll(/"(lat|lon|lng|coords?|homeAddress)"/g)].map((m) => m[1]);
    expect(leaked, `AUDIT-RESULT keys carried into the export: ${leaked.join(',')}`).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
describe('copy left behind by the round-up removal', () => {
  const tooltips = JSON.parse(readFileSync(resolve('shared/content/tooltips.json'), 'utf8'));
  const tt = (tooltips.tooltips ?? tooltips.terms ?? tooltips) as Record<string, { definition: string }>;

  it('DEFECT: L1 still says it unlocks with a round-up, which nothing can create', () => {
    expect(LESSON_BY_ID.L1.unlockHint, `AUDIT-RESULT L1.unlockHint = "${LESSON_BY_ID.L1.unlockHint}"`).not.toMatch(/round-?up/i);
  });

  it('DEFECT: shipped copy still tells the user the jar fills by itself (R6.1: a day passing moves no money)', () => {
    const offenders: string[] = [];
    const auto = S.home.autoAdvance(3);
    if (/jar kept working/i.test(auto)) offenders.push(`S.home.autoAdvance(3) = "${auto}"`);
    if (/kept working anyway|did not have to remember anything/i.test(LESSON_BY_ID.L5.body)) offenders.push(`L5 body = "${LESSON_BY_ID.L5.body.slice(0, 90)}"`);
    if (/round-?ups/i.test(tt.jar.definition)) offenders.push(`tooltip jar = "${tt.jar.definition}"`);
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('DEFECT: L1 and L3 are the same lesson twice, and the first skip unlocks both at once', () => {
    const s = skipped(onboarded());
    const words = (t: string) => new Set(t.toLowerCase().replace(/[^a-z ]/g, ' ').split(/\s+/).filter((w) => w.length > 2));
    const a = words(LESSON_BY_ID.L1.body);
    const b = words(LESSON_BY_ID.L3.body);
    const jaccard = [...a].filter((w) => b.has(w)).length / new Set([...a, ...b]).size;
    expect(
      jaccard,
      `AUDIT-RESULT L1 "${LESSON_BY_ID.L1.title}" unlockedDay=${s.lessons.L1.unlockedDay} vs L3 "${LESSON_BY_ID.L3.title}" unlockedDay=${s.lessons.L3.unlockedDay}; body word overlap ${(jaccard * 100).toFixed(0)}%`,
    ).toBeLessThan(0.5);
  });
});

// ---------------------------------------------------------------------------------------------
describe('R15.7 layer 1: planted violations against scripts/lint-advice.ts', () => {
  it('controls: the eight cycle 2 plants and the original L7 still fail', () => {
    for (const t of ['you should', 'we recommend this', 'guaranteed and risk free', 'returns of 12% growth', 'NVDA and AAPL', 'the best etf', 'it will grow', 'Why $20 a week beats $500 later']) {
      expect(checkText(t).length, t).toBeGreaterThan(0);
    }
  });

  const phraseVariants: Array<[string, string]> = [
    // No "CD" in the sentence: that token alone trips the all capitals rule and would hide the result.
    ['hyphenated "risk-free"', 'A savings account is basically risk-free, which makes it the safe place to start.'],
    ['a typographic apostrophe in "can’t lose"', 'Held long enough, an index fund can’t lose.'],
    ['"beats the market" (the list has "beat the market")', 'A broad index fund beats the market over time.'],
  ];
  for (const [label, text] of phraseVariants) {
    it(`DEFECT: a spelling of a banned phrase passes: ${label}`, () => {
      expect(checkText(text).length, `LINT-HOLE passes: "${text}"`).toBeGreaterThan(0);
    });
  }

  it('DEFECT: rule 4 is switched off for any sentence containing "usually", "generally", "most people" etc., so the original L7 claim passes with one word added', () => {
    const planted = [
      'Twenty dollars a week usually beats five hundred dollars later.',
      'Most people your age put $50 a month into an index fund rather than a savings account.',
      'Generally $20 a week beats $500 later.',
    ];
    const passed = planted.filter((t) => checkText(t).length === 0);
    expect(passed, `LINT-HOLE passes:\n${passed.join('\n')}`).toEqual([]);
  });

  it('DEFECT: every ${...} interpolation is invisible to the lint, so the original L7 written the way strings.ts writes copy passes', () => {
    const fixture = resolve('tests/fixtures/tester-v3-lint-plants.ts');
    const src = readFileSync(fixture, 'utf8').split('\n');
    const lineOf = (name: string) => src.findIndex((l) => l.includes(`export const ${name}`)) + 1;
    const run = spawnSync('npx', ['tsx', 'scripts/lint-advice.ts', fixture], { encoding: 'utf8', cwd: process.cwd(), timeout: 240_000 });
    const out = `${run.stdout}\n${run.stderr}`;
    const flagged = (name: string) => out.includes(`${fixture}:${lineOf(name)}:`);
    // eslint-disable-next-line no-console
    console.log(`AUDIT-RESULT lint on plants (exit ${run.status}):\n${out.trim()}`);
    expect(flagged('PLANT_CONTROL_PHRASE'), 'control plant must be flagged, or this harness is not seeing the file').toBe(true);
    expect(flagged('PLANT_CONTROL_L7'), 'control plant must be flagged').toBe(true);
    const holes = ['PLANT_INTERPOLATED_L7', 'PLANT_INTERPOLATED_ADVICE'].filter((n) => !flagged(n));
    expect(holes, `LINT-HOLE: not flagged: ${holes.join(', ')}`).toEqual([]);
  }, 300_000);

  it('probe: no template in strings.ts hides a rule 4 violation behind its interpolations, other than the exempted Summer lines', () => {
    const src = readFileSync(resolve('src/content/strings.ts'), 'utf8').replace(/^\s*\/\/.*$/gm, '');
    const found: string[] = [];
    for (const m of src.matchAll(/`((?:[^`\\]|\\.)*)`/g)) {
      if (!m[1].includes('${')) continue;
      const filled = m[1].replace(/\$\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g, () => '$9');
      for (const p of checkText(filled)) if (/comparison/.test(p.rule)) found.push(p.detail);
    }
    // eslint-disable-next-line no-console
    console.log(`AUDIT-RESULT rule 4 with interpolations filled:\n${found.join('\n') || '(none)'}`);
    const unexpected = found.filter((f) => !/waiting until 30|Starting at \$9 means/.test(f));
    expect(unexpected, unexpected.join('\n')).toEqual([]);
  });

  it('records, not filed: shapes R15 bans that the plan leaves to the human gate', () => {
    const blind = [
      'Open an account at Robinhood and put it in Apple.',
      'Index funds have returned about seven percent a year.',
      'Most people in your position end up in a broad index fund.',
      'You cannot lose money in a CD you hold to the end.',
    ];
    // eslint-disable-next-line no-console
    console.log(`AUDIT-RESULT blind spots (pass the lint): ${blind.filter((t) => checkText(t).length === 0).length} of ${blind.length}`);
    expect(true).toBe(true);
  });
});
