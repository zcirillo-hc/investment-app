/**
 * TESTER, cycle 4 (2026-09-11). Re-verifies V2-9 to V2-19 against b143bdf and attacks what
 * those fixes added: the capture parsers and isBondRow (maturity.ts), applyEdit (ledger.ts),
 * the import whitelist (validate.ts `pick`), the L1 trigger, putAsideCents, and lint-advice.
 *
 * Convention as in cycles 2 and 3: a case titled DEFECT fails today on purpose, names its
 * finding and prints what it measured as AUDIT-RESULT. RECORD cases print and never fail.
 * Everything else must pass.
 *
 * Cycle 5 (2026-09-11): V2-21 to V2-25 are fixed, so every case here must pass. The DEFECT cases
 * were retitled as regression guards, and the V2-23 case was rewritten to the owner's decision
 * (the type picked in the form wins over the typed name); it says so inline.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BONDS_CDS_KEY, MAX_TERM_MONTHS, MAX_YIELD_BPS, isBondRow, maturityOf, parseRateBps, parseTermMonths, type Parsed } from '../../src/domain/maturity';
import { validateDraft, type LedgerDraft } from '../../src/domain/ledger';
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
import { initialAppState, type AppState, type Deps, type LedgerEntry } from '../../src/domain/types';
import { createSimulatedTransactionSource } from '../../src/domain/simulator';
import { createSimulatedLocationSource } from '../../src/domain/places';
import { currentDate, keptSinceStartCents, ledgerTotal, putAsideCents } from '../../src/domain/selectors';
import { yourMoneyCurve } from '../../src/domain/summer';
import { formatCents } from '../../src/domain/money';
import { exportStateJson, parseImport } from '../../src/state/persistence';
import { S } from '../../src/content/strings';
import { checkText } from '../../scripts/lint-advice';
import { HOLDING_TYPES } from '../../src/content/holdingTypes';

function deps(): Deps {
  return { transactions: createSimulatedTransactionSource(), location: createSimulatedLocationSource() };
}
function onboarded(): AppState {
  const s0 = initialAppState();
  s0.profile = { ...s0.profile, name: 'Sam', seed: 42, createdAt: '2026-06-15T00:00:00.000Z', fear: 'pointless', summerEarnedCents: 300000 };
  return completeOnboarding(s0, { startDate: '2026-06-15', todayLocal: '2026-06-15', seedOverride: null });
}
function skipped(s: AppState): AppState {
  const t = forceNudge(setNudgesEnabled(injectHabitVisits(s, 'Demo Coffee', 510, 435), true));
  const n = t.nudges.find((x) => x.status === 'pending');
  if (!n) throw new Error('fixture: no pending nudge');
  return takeSkip(t, n.id);
}
const kindOf = (p: Parsed): number | 'empty' | 'invalid' => (p.kind === 'ok' ? p.value : p.kind);
const skipsOf = (s: AppState) => s.events.filter((e) => e.kind === 'Skip').length;
/** Invest.tsx's exact condition for rendering a maturity line on a row. */
const investLine = (e: LedgerEntry) =>
  isBondRow(e) && e.termMonths !== undefined && e.yieldBps !== undefined ? maturityOf(e.amountCents, e.yieldBps, e.termMonths) : null;

function mustAdd(s: AppState, d: Omit<LedgerDraft, 'date' | 'note' | 'source'> & Partial<LedgerDraft>, at: string) {
  const r = addLedgerEntry(s, { date: currentDate(s), note: '', source: 'manual', ...d } as LedgerDraft, at);
  if (!r.ok) throw new Error(`fixture add: ${r.problems.join(',')}`);
  return r;
}

// ---------------------------------------------------------------------------------------------
describe('R16.7 parseRateBps and parseTermMonths, exact values', () => {
  const RATE: Array<[string, number | 'empty' | 'invalid']> = [
    ['4.5', 450], ['4.5%', 450], ['4,5', 450], [' 4.5 % ', 450], ['4.50', 450], ['04.5', 450], ['4,5%', 450],
    // Float traps: each of these multiplied by 100 in a double lands just under the half.
    ['1.005', 101], ['2.675', 268], ['1.0049999', 100], ['1.9951', 200], ['4.99999999999', 500],
    ['0.005', 1], ['0.01', 1],
    ['25', 2500], ['25.00', 2500], ['25.004', 2500], ['25.005', 'invalid'], ['25.01', 'invalid'], ['50', 'invalid'],
    ['0', 'invalid'], ['0.00', 'invalid'], ['0.004', 'invalid'], ['-4.5', 'invalid'], ['+4.5', 'invalid'], ['1e1', 'invalid'],
    ['4.5.1', 'invalid'], ['4,5,1', 'invalid'], ['4..5', 'invalid'], ['4 5', 'invalid'], ['４.５', 'invalid'],
    ['Infinity', 'invalid'], ['NaN', 'invalid'], ['9'.repeat(400), 'invalid'], ['4.5 percent', 'invalid'],
    ['', 'empty'], ['   ', 'empty'],
  ];
  for (const [text, want] of RATE) {
    it(`rate ${JSON.stringify(text.length > 20 ? `${text.slice(0, 8)}...(${text.length})` : text)} -> ${want}`, () => {
      expect(kindOf(parseRateBps(text))).toBe(want);
    });
  }

  const TERM: Array<[string, number | 'empty' | 'invalid']> = [
    ['12', 12], ['012', 12], [' 12 ', 12], ['600', 600], ['1', 1],
    ['601', 'invalid'], ['0', 'invalid'], ['12.5', 'invalid'], ['-12', 'invalid'], ['1e2', 'invalid'], ['12 months', 'invalid'], ['１２', 'invalid'],
    ['', 'empty'], ['  ', 'empty'],
  ];
  for (const [text, want] of TERM) {
    it(`term ${JSON.stringify(text)} -> ${want}`, () => {
      expect(kindOf(parseTermMonths(text))).toBe(want);
    });
  }

  it('RECORD: shapes a person might type that are refused, not dropped (R16.7 allows this)', () => {
    const shapes = ['.5', '4.', '%', '12.0', '4½', '4.5 %%'];
    // eslint-disable-next-line no-console
    console.log(`RECORD rate parse: ${shapes.map((t) => `${JSON.stringify(t)}=${kindOf(parseRateBps(t))}`).join(' ')}; term "12.0"=${kindOf(parseTermMonths('12.0'))}`);
    expect(true).toBe(true);
  });

  it('every accepted rate is inside the ceiling and every parse of an integer percent is exact', () => {
    for (let p = 1; p <= MAX_YIELD_BPS / 100; p++) expect(kindOf(parseRateBps(String(p)))).toBe(p * 100);
    for (let bps = 1; bps <= MAX_YIELD_BPS; bps += 7) {
      const text = `${Math.floor(bps / 100)}.${String(bps % 100).padStart(2, '0')}`;
      expect(kindOf(parseRateBps(text)), text).toBe(bps);
    }
  });
});

// ---------------------------------------------------------------------------------------------
describe('R16.5 isBondRow and validateDraft notBond', () => {
  it('holdingType wins over the label; the label counts only when there is no type', () => {
    expect(isBondRow({ holdingType: BONDS_CDS_KEY, what: 'anything' })).toBe(true);
    expect(isBondRow({ holdingType: 'stocks', what: 'Bonds or CDs' })).toBe(false);
    expect(isBondRow({ what: 'Bonds or CDs' })).toBe(true);
    expect(isBondRow({ what: '  bonds or cds  ' })).toBe(true);
    expect(isBondRow({ what: 'Bonds or CD' })).toBe(false);
    expect(isBondRow({ holdingType: '', what: 'Bonds or CDs' })).toBe(false);
  });

  it('validateDraft: a term on a non bond draft is notBond; nulls count as absent; a type overrides a bond label', () => {
    const d = (x: Partial<LedgerDraft>) => validateDraft({ date: '2026-06-15', amountCents: 100, what: 'Index fund', note: '', source: 'manual', ...x }, '2026-06-20');
    const probs = (v: ReturnType<typeof d>) => (v.ok ? [] : v.problems);
    expect(probs(d({ termMonths: 12 }))).toEqual(['notBond']);
    expect(probs(d({ yieldBps: 450 }))).toEqual(['notBond']);
    expect(d({ termMonths: null, yieldBps: null }).ok).toBe(true);
    expect(d({ what: 'Bonds or CDs', termMonths: 12 }).ok).toBe(true);
    expect(probs(d({ what: 'Bonds or CDs', holdingType: 'stocks', termMonths: 12 }))).toEqual(['notBond']);
    expect(probs(d({ what: 'Bonds or CDs', holdingType: BONDS_CDS_KEY, termMonths: MAX_TERM_MONTHS + 1 }))).toEqual(['term']);
  });
});

// ---------------------------------------------------------------------------------------------
describe('R16.6 applyEdit through updateLedgerEntry', () => {
  function withBond(extra: Partial<LedgerEntry> = {}): { s: AppState; id: string } {
    const s0 = tickN(onboarded(), deps(), 3);
    const r = mustAdd(s0, { amountCents: 100000, what: 'Bonds or CDs', holdingType: BONDS_CDS_KEY, termMonths: 12, yieldBps: 450, ...extra } as LedgerDraft, '2026-06-18T10:00:00.000Z');
    return { s: r.state, id: r.entry.id };
  }
  const edit = (s: AppState, id: string, x: Partial<LedgerDraft>) => {
    const e = s.ledger.find((l) => l.id === id)!;
    const r = updateLedgerEntry(s, id, { date: e.date, amountCents: e.amountCents, what: e.what, note: e.note, source: e.source, ...x });
    if (!r.ok) throw new Error(`edit refused: ${r.problems.join(',')}`);
    return r.state.ledger.find((l) => l.id === id)!;
  };

  it('undefined keeps, a number sets, null removes the key, and the export carries no null', () => {
    const { s, id } = withBond();
    expect(edit(s, id, { note: 'x' })).toMatchObject({ termMonths: 12, yieldBps: 450, holdingType: BONDS_CDS_KEY });
    expect(edit(s, id, { holdingType: BONDS_CDS_KEY, termMonths: 24, yieldBps: 500 })).toMatchObject({ termMonths: 24, yieldBps: 500 });
    const cleared = edit(s, id, { holdingType: BONDS_CDS_KEY, termMonths: null, yieldBps: null });
    expect('termMonths' in cleared || 'yieldBps' in cleared).toBe(false);
    const halfCleared = edit(s, id, { holdingType: BONDS_CDS_KEY, termMonths: null });
    expect(halfCleared.termMonths).toBeUndefined();
    expect(halfCleared.yieldBps).toBe(450);
  });

  it('a pre R16.5 bond row (no type, bond label) is stamped bondsCds on its first edit and keeps its rate', () => {
    const { s, id } = withBond({ holdingType: undefined });
    const legacy = { ...s, ledger: s.ledger.map((l) => (l.id === id ? (({ holdingType: _h, ...rest }) => rest)(l) : l)) } as AppState;
    expect(legacy.ledger.find((l) => l.id === id)!.holdingType).toBeUndefined();
    const after = edit(legacy, id, { note: 'from my statement' });
    expect(after).toMatchObject({ holdingType: BONDS_CDS_KEY, termMonths: 12, yieldBps: 450 });
  });

  // Cycle 5 reconciliation. V2-23 asked the architect whether the type or the name wins. The
  // owner decided on 2026-09-11 that the type is a choice in the form and wins: a CD the user
  // names "Individual stock" is still a CD, keeps its line, and Invest names its type beside it.
  // The case now asserts that decision, and the other half of it: picking another type clears
  // the length and the rate.
  it('V2-23 by owner decision: a bond row renamed "Individual stock" keeps its line because its type is still Bonds or CDs, Invest names the type, and picking another type clears the rate', () => {
    const { s, id } = withBond({ termMonths: 360, yieldBps: 1000 });
    // The draft LedgerForm submits when only the name is changed: the picked type carried over.
    const renamed = edit(s, id, { what: 'Individual stock', holdingType: BONDS_CDS_KEY, termMonths: 360, yieldBps: 1000 });
    expect(investLine(renamed)?.valueAtMaturityCents).toBe(1744940);
    // Invest.tsx's pill condition: a type whose label differs from the name, and not Something else.
    const t = HOLDING_TYPES.find((h) => h.key === renamed.holdingType)!;
    expect(!t.requiresLabel && t.label.toLowerCase() !== renamed.what.trim().toLowerCase(), `pill "${t.label}" beside "${renamed.what}"`).toBe(true);
    // The draft LedgerForm submits when the Individual stocks chip is picked on a row with a rate.
    const moved = edit(s, id, { what: 'Individual stock', holdingType: 'stocks', termMonths: null, yieldBps: null });
    expect({ t: moved.holdingType, term: 'termMonths' in moved, rate: 'yieldBps' in moved, line: investLine(moved) }).toEqual({ t: 'stocks', term: false, rate: false, line: null });
  });

  it('V2-25 regression: a draft labelled "Bonds or CDs" can no longer put a term on a row stored as stocks (updateLedgerEntry refuses it)', () => {
    const s0 = tickN(onboarded(), deps(), 3);
    const a = mustAdd(s0, { amountCents: 50000, what: 'Individual stocks', holdingType: 'stocks' } as LedgerDraft, '2026-06-18T10:00:00.000Z');
    const u = updateLedgerEntry(a.state, a.entry.id, { date: a.entry.date, amountCents: 50000, what: 'Bonds or CDs', note: '', source: 'manual', termMonths: 360, yieldBps: 1000 });
    const e = u.ok ? u.state.ledger.find((l) => l.id === a.entry.id) : undefined;
    const re = u.ok ? parseImport(exportStateJson(u.state)) : null;
    expect(
      u.ok && re !== null && !re.ok,
      `AUDIT-RESULT update ok=${u.ok}; stored holdingType=${e?.holdingType} what="${e?.what}" term=${e?.termMonths} rate=${e?.yieldBps}; own export re-imports ok=${re?.ok} ${re && !re.ok ? re.problems.join('; ') : ''}`,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
describe('export then import of a rich real profile (V2-17 pick whitelist)', () => {
  function richProfile(): AppState {
    let s = tickN(onboarded(), deps(), 20);
    s = skipped(s);
    s = acceptCatch(landDemoPaycheck(s), 5);
    const mv = moveJarToLedger(s, { date: currentDate(s), what: 'Index fund', note: 'moved it' }, '2026-07-05T10:00:00.000Z');
    if (!mv.ok) throw new Error('fixture move');
    s = tickN(mv.state, deps(), 3);
    s = skipped(s);
    s = emptyJar(s);
    s = tickN(s, deps(), 2);
    s = skipped(s);
    s = mustAdd(s, { amountCents: 100000, what: 'Bonds or CDs', holdingType: BONDS_CDS_KEY, termMonths: 12, yieldBps: 450 } as LedgerDraft, '2026-07-12T10:00:00.000Z').state;
    s = mustAdd(s, { amountCents: 25000, what: 'Bonds or CDs', holdingType: BONDS_CDS_KEY, termMonths: 6 } as LedgerDraft, '2026-07-12T10:01:00.000Z').state;
    s = mustAdd(s, { amountCents: 1234, what: 'Gold coins from grandma', holdingType: 'other' } as LedgerDraft, '2026-07-12T10:02:00.000Z').state;
    s = mustAdd(s, { amountCents: 777, what: 'Crypto', holdingType: 'crypto' } as LedgerDraft, '2026-07-12T10:03:00.000Z').state;
    const firstUnlocked = (Object.keys(s.lessons) as Array<keyof AppState['lessons']>).find((k) => s.lessons[k].unlockedDay !== null)!;
    const firstLearn = Object.keys(s.learn)[0];
    s = {
      ...s,
      profile: { ...s.profile, age: 21, summerLeftCents: 120000 },
      settings: { ...s.settings, theme: 'dark', mutedPlaceIds: s.places.slice(0, 1).map((p) => p.id) },
      lessons: { ...s.lessons, [firstUnlocked]: { ...s.lessons[firstUnlocked], readAt: '2026-07-01T10:00:00.000Z' } },
      learn: { ...s.learn, [firstLearn]: { ...s.learn[firstLearn], readAt: '2026-07-02T10:00:00.000Z' } },
      flags: { nudgeExplainerSeen: true, privacyExplainerSeen: true, serverPrivacySeen: true, installExplainerSeen: true, investCapturePromptSeen: true },
      demo: { summerOverride: 'on' },
    };
    return s;
  }
  function diff(a: unknown, b: unknown, path: string, out: string[]): void {
    if (Object.is(a, b)) return;
    if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null || Array.isArray(a) !== Array.isArray(b)) {
      out.push(`${path}: ${JSON.stringify(a)?.slice(0, 80)} -> ${JSON.stringify(b)?.slice(0, 80)}`);
      return;
    }
    const pa = a as Record<string, unknown>;
    const pb = b as Record<string, unknown>;
    for (const k of new Set([...Object.keys(pa), ...Object.keys(pb)])) {
      if (!(k in pb)) out.push(`${path}.${k}: DROPPED (was ${JSON.stringify(pa[k])?.slice(0, 80)})`);
      else if (!(k in pa)) out.push(`${path}.${k}: ADDED ${JSON.stringify(pb[k])?.slice(0, 80)}`);
      else diff(pa[k], pb[k], `${path}.${k}`, out);
    }
  }

  it('control: the fixture exercises every event kind the app writes today, every holding type path and a bond row', () => {
    const s = richProfile();
    const kinds = new Set(s.events.map((e) => e.kind));
    for (const k of ['Purchase', 'Catch', 'Skip', 'JarMove', 'JarEmptied', 'Paycheck']) expect(kinds.has(k as never), k).toBe(true);
    expect(s.ledger.some((e) => e.source === 'jar')).toBe(true);
    expect(s.ledger.some((e) => e.holdingType === BONDS_CDS_KEY && e.yieldBps === 450)).toBe(true);
  });

  it('a rich profile survives export -> import with nothing dropped, added or changed (habits included, since R3.5 recomputes them from the same visits)', () => {
    const s = richProfile();
    const first = exportStateJson(s);
    const r = parseImport(first);
    expect(r.ok, r.ok ? '' : r.problems.join('\n')).toBe(true);
    if (!r.ok) return;
    const out: string[] = [];
    diff(JSON.parse(first), JSON.parse(exportStateJson(r.state)), '', out);
    // eslint-disable-next-line no-console
    console.log(`AUDIT-RESULT round trip diffs: ${out.length ? out.join('\n') : 'none'}`);
    expect(out).toEqual([]);
  });

  it('the same profile with legacy round-ups keeps every RoundUp field; only the retired roundUpsPaused key is dropped', () => {
    const s = richProfile();
    const g = JSON.parse(exportStateJson(s));
    let n = 0;
    const events: any[] = [];
    for (const e of g.events) {
      events.push(e);
      if (e.kind === 'Purchase' && e.cents % 100 !== 0) {
        events.push({ kind: 'RoundUp', id: `legacy-ru-${n++}`, dayIndex: e.dayIndex, date: e.date, purchaseId: e.purchaseId, merchant: e.merchant, purchaseCents: e.cents, cents: 100 - (e.cents % 100) });
      }
    }
    g.events = events;
    g.settings.roundUpsPaused = true;
    const r = parseImport(JSON.stringify(g));
    expect(r.ok, r.ok ? '' : r.problems.join('\n')).toBe(true);
    if (!r.ok) return;
    const out: string[] = [];
    diff(g, JSON.parse(exportStateJson(r.state)), '', out);
    expect(n).toBeGreaterThan(0);
    expect(out).toEqual(['.settings.roundUpsPaused: DROPPED (was true)']);
  });
});

// ---------------------------------------------------------------------------------------------
describe('what the fixes do to data saved before them (since e7bb37f, R16.8 tidies on import and on load)', () => {
  it('control: a pre R16.5 export (bond label, no holdingType, 12 months at 4.5%) still imports and still renders its line', () => {
    const base = tickN(onboarded(), deps(), 3);
    const legacy: LedgerEntry = { id: 'led:1', date: currentDate(base), amountCents: 100000, what: 'Bonds or CDs', note: '', source: 'manual', createdAt: '2026-06-18T10:00:00.000Z', termMonths: 12, yieldBps: 450 };
    const r = parseImport(exportStateJson({ ...base, ledger: [legacy] }));
    expect(r.ok, r.ok ? '' : r.problems.join('\n')).toBe(true);
    expect(investLine(legacy)?.valueAtMaturityCents).toBe(104500);
  });

  it('V2-21 regression (R16.8): rows the previous build saved legally no longer make the app refuse its own export of them', () => {
    const base = tickN(onboarded(), deps(), 3);
    // Exactly what 90bd963's capture wrote for "Bonds or CDs, $1,000, 12 months, 30%", legal
    // under the 5000 bps ceiling that was live until b143bdf.
    const thirty: LedgerEntry = { id: 'led:1', date: currentDate(base), amountCents: 100000, what: 'Bonds or CDs', note: '', source: 'manual', createdAt: '2026-06-18T10:00:00.000Z', termMonths: 12, yieldBps: 3000 };
    // What the previous validator accepted on import (V2-12, live on production until b143bdf).
    const stock: LedgerEntry = { id: 'led:2', date: currentDate(base), amountCents: 100000, what: 'Individual stocks', note: '', source: 'manual', createdAt: '2026-06-18T10:01:00.000Z', termMonths: 360, yieldBps: 1000 };
    const a = parseImport(exportStateJson({ ...base, ledger: [thirty] }));
    const b = parseImport(exportStateJson({ ...base, ledger: [stock] }));
    const line = investLine(thirty);
    expect(
      { thirtyReimports: a.ok, stockReimports: b.ok },
      `AUDIT-RESULT 30% bond row: Invest line ${line ? 'shown' : 'GONE (maturityOf returns null, no message)'}; own export re-imports ok=${a.ok} ${a.ok ? '' : a.problems.join('; ')} | stock row from a pre-fix import: own export re-imports ok=${b.ok} ${b.ok ? '' : b.problems.join('; ')}`,
    ).toEqual({ thirtyReimports: true, stockReimports: true });
  });
});

// ---------------------------------------------------------------------------------------------
describe('R10.4 after V2-9: the figure moved, the words around it did not', () => {
  it('control: jar + moved counts each dollar once, and spending takes it out', () => {
    const s = skipped(onboarded());
    expect(putAsideCents(s)).toBe(435);
    const mv = moveJarToLedger(s, { date: currentDate(s), what: 'Index fund', note: '' }, '2026-06-15T12:00:00.000Z');
    if (!mv.ok) throw new Error('fixture');
    expect(putAsideCents(mv.state)).toBe(435);
    expect(putAsideCents(emptyJar(s))).toBe(0);
  });

  it('V2-22 regression: after "I spent it", Your money no longer tells someone who has skipped that their first skip is still to come', () => {
    const s = emptyJar(skipped(onboarded()));
    const m = yourMoneyCurve(putAsideCents(s), s.profile.age);
    const shown = m.hasMoney ? S.summer.yourMoneyPutIn(putAsideCents(s)) : S.summer.yourMoneyEmpty;
    expect(
      skipsOf(s) > 0 && /first skip/i.test(shown),
      `AUDIT-RESULT skips=${skipsOf(s)} Home kept=${formatCents(keptSinceStartCents(s))} putAside=${formatCents(putAsideCents(s))}; Summer reads "${shown}"`,
    ).toBe(false);
  });

  it('V2-22 regression: Summer no longer uses "kept" for a figure Home does not call kept', () => {
    let s = skipped(onboarded());
    s = mustAdd(s, { amountCents: 50000, what: 'Retirement account' } as LedgerDraft, '2026-06-15T12:00:00.000Z').state;
    const summer = S.summer.yourMoneyPutIn(putAsideCents(s));
    const clash = /\bkept\b/i.test(summer) && putAsideCents(s) !== keptSinceStartCents(s);
    expect(
      clash,
      `AUDIT-RESULT Home kept=${formatCents(keptSinceStartCents(s))} moved=${formatCents(ledgerTotal(s))}; Summer "${summer}"; note "${S.summer.yourMoneyNote}"`,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
describe('V2-16 the L1 trigger', () => {
  it('L1 unlocks on the day the first habit forms through the real tick, and L3 stays locked until a skip', () => {
    let s = onboarded();
    let habitDay: number | null = null;
    for (let d = 0; d < 40 && habitDay === null; d++) {
      s = tickN(s, deps(), 1);
      if (s.habits.some((h) => h.isHabit)) habitDay = s.clock.dayIndex;
    }
    expect(habitDay, 'seed 42 must form a habit within 40 days').not.toBeNull();
    expect(s.lessons.L1.unlockedDay).toBe(habitDay);
    expect(skipsOf(s)).toBe(0);
    expect(s.lessons.L3.unlockedDay).toBeNull();
    const after = skipped(s);
    expect(after.lessons.L1.unlockedDay, 'a skip must not move L1').toBe(habitDay);
    expect(after.lessons.L3.unlockedDay).toBe(after.clock.dayIndex);
  });

  it('RECORD: the demo make-habit path and an import both leave L1 locked until the next state change', () => {
    const t = injectHabitVisits(onboarded(), 'Demo Coffee', 510, 435);
    const r = parseImport(exportStateJson(t));
    // eslint-disable-next-line no-console
    console.log(
      `RECORD L1: after demo make-habit habit=${t.habits.some((h) => h.isHabit)} L1=${t.lessons.L1.unlockedDay}; after import habit=${r.ok && r.state.habits.some((h) => h.isHabit)} L1=${r.ok ? r.state.lessons.L1.unlockedDay : 'n/a'}; after one tick L1=${tickN(t, deps(), 1).lessons.L1.unlockedDay}`,
    );
    expect(true).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------
describe('V2-14 lint-advice after the fix', () => {
  it('RECORD: spelling variants the normalisation does not cover (same class as V2-14 item 3)', () => {
    const variants: Array<[string, string]> = [
      ['no-break space', 'A savings account is risk free.'],
      ['soft hyphen', 'A savings account is risk­free.'],
      ['zero width space', 'Honestly, you​ should buy it.'],
      ['"cannot lose"', 'Held to the end, you cannot lose.'],
      ['U+2011 hyphen (control, should be caught)', 'A savings account is risk‑free.'],
      ['U+02BC apostrophe (control, should be caught)', 'Held long enough, it canʼt lose.'],
    ];
    // eslint-disable-next-line no-console
    console.log(`RECORD lint variants:\n${variants.map(([l, t]) => `${checkText(t).length > 0 ? 'caught' : 'PASSES'}  ${l}`).join('\n')}`);
    expect(checkText(variants[4][1]).length).toBeGreaterThan(0);
    expect(checkText(variants[5][1]).length).toBeGreaterThan(0);
  });

  it('RECORD: concatenation and an unbalanced brace in an interpolation, through the real CLI', () => {
    const fixture = resolve('tests/fixtures/tester-v4-lint-plants.ts');
    const src = readFileSync(fixture, 'utf8').split('\n');
    const lineOf = (name: string) => src.findIndex((l) => l.includes(`export const ${name}`)) + 1;
    const run = spawnSync('npx', ['tsx', 'scripts/lint-advice.ts', fixture], { encoding: 'utf8', cwd: process.cwd(), timeout: 240_000 });
    const out = `${run.stdout}\n${run.stderr}`;
    const flagged = (name: string) => out.includes(`${fixture}:${lineOf(name)}:`);
    const names = ['V4_CONTROL', 'V4_SPLIT_RULE4', 'V4_SPLIT_PHRASE', 'V4_BRACE', 'V4_CONTROL_AFTER'];
    // eslint-disable-next-line no-console
    console.log(`RECORD lint CLI (exit ${run.status}): ${names.map((n) => `${n}=${flagged(n) ? 'flagged' : 'PASSES'}`).join(' ')}\n${out.trim()}`);
    expect(flagged('V4_CONTROL'), 'control plant must be flagged, or this harness is not seeing the file').toBe(true);
  }, 300_000);
});
