/**
 * TESTER, cycle 5 (2026-09-11). Re-verifies V2-20 to V2-25 against e7bb37f and attacks what the
 * fixes added: the persist version 2 migrate (store.ts), the loosened import validator and
 * tidyLedger (validate.ts, ledger.ts), and the import refusal messages (persistence.ts).
 *
 * Convention as in cycles 2 to 4: a case titled DEFECT fails today on purpose, names its finding
 * and prints what it measured as AUDIT-RESULT. RECORD cases print and never fail. Everything
 * else must pass.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { get, set } from 'idb-keyval';
import { createAppStore } from '../../src/state/store';
import {
  MIRROR_KEY,
  PERSIST_VERSION,
  clearPersistedState,
  exportStateJson,
  parseImport,
  pickAppState,
  takeTidyNotice,
} from '../../src/state/persistence';
import { overrideUrlParams } from '../../src/state/urlParams';
import { STORAGE_KEY } from '../../src/config';
import { BONDS_CDS_KEY, MAX_TERM_MONTHS, MAX_YIELD_BPS, isBondRow, maturityOf } from '../../src/domain/maturity';
import { tidyLedger } from '../../src/domain/ledger';
import { completeOnboarding, tickN } from '../../src/domain/tick';
import { initialAppState, type AppState, type Deps, type LedgerEntry } from '../../src/domain/types';
import { createSimulatedTransactionSource } from '../../src/domain/simulator';
import { createSimulatedLocationSource } from '../../src/domain/places';
import { currentDate } from '../../src/domain/selectors';
import { S } from '../../src/content/strings';

function deps(): Deps {
  return { transactions: createSimulatedTransactionSource(), location: createSimulatedLocationSource() };
}
function onboarded(): AppState {
  const s0 = initialAppState();
  s0.profile = { ...s0.profile, name: 'Sam', seed: 42, createdAt: '2026-06-15T00:00:00.000Z', fear: 'pointless', summerEarnedCents: 300000 };
  return completeOnboarding(s0, { startDate: '2026-06-15', todayLocal: '2026-06-15', seedOverride: null });
}
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
/** Invest.tsx's exact condition for rendering a maturity line on a row. */
const investLine = (e: LedgerEntry) =>
  isBondRow(e) && e.termMonths !== undefined && e.yieldBps !== undefined ? maturityOf(e.amountCents, e.yieldBps, e.termMonths) : null;

function row(base: AppState, id: string, extra: Partial<LedgerEntry>): LedgerEntry {
  return { id, date: currentDate(base), amountCents: 100000, what: 'Bonds or CDs', note: '', source: 'manual', createdAt: '2026-06-18T10:00:00.000Z', ...extra };
}

/** A realistic profile a few days in, as the app itself would persist it. */
function realState(): AppState {
  return pickAppState(tickN(onboarded(), deps(), 3));
}

/** Writes an envelope exactly as a previous build's zustand persist would have left it. */
async function plantEnvelope(state: unknown, version: number, rev = 7): Promise<void> {
  await set(STORAGE_KEY, JSON.stringify({ rev, state, version }));
  localStorage.removeItem(MIRROR_KEY);
  sessionStorage.clear();
}
async function storedEnvelope(): Promise<{ version: number; state: AppState; rev?: number }> {
  return JSON.parse((await get<string>(STORAGE_KEY)) as string);
}
async function waitFor(pred: () => Promise<boolean>, ms = 3000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (await pred()) return true;
    await new Promise((r) => setTimeout(r, 10));
  }
  return false;
}
/** createAppStore hydrates on creation; this waits for that first hydration to settle. */
async function bootStore(): Promise<ReturnType<typeof createAppStore>> {
  const s = createAppStore();
  await waitFor(async () => s.persist.hasHydrated(), 1500);
  await new Promise((r) => setTimeout(r, 50));
  return s;
}

beforeEach(async () => {
  await clearPersistedState();
  sessionStorage.clear();
  overrideUrlParams({ demo: true, freeze: true, start: '2026-06-15', seed: 42, nudge: false, push: null });
});

// ---------------------------------------------------------------------------------------------
describe('R16.8 through the LOAD path: a version 1 envelope is tidied once, told once', () => {
  function oldRows(base: AppState): LedgerEntry[] {
    return [
      // What 90bd963's capture wrote for 12 months at 30%, legal under the 5000 bps ceiling.
      row(base, 'led:30', { termMonths: 12, yieldBps: 3000 }),
      // What the pre-b143bdf import accepted: a term and a rate on a stock row (V2-12).
      row(base, 'led:31', { what: 'Individual stocks', termMonths: 360, yieldBps: 1000 }),
      // A good pre R16.5 bond row: no type, bond label, usable values. Must come through as is.
      row(base, 'led:32', { termMonths: 12, yieldBps: 450 }),
      // A good typed bond row at the ceilings.
      row(base, 'led:33', { holdingType: BONDS_CDS_KEY, termMonths: MAX_TERM_MONTHS, yieldBps: MAX_YIELD_BPS }),
    ];
  }

  it('removes only the unusable fields, keeps every row and every other part of the envelope, writes version 2, and leaves a count of 2 for App to say once', async () => {
    const planted = { ...realState(), ledger: oldRows(realState()) };
    await plantEnvelope(planted, 1);
    const a = await bootStore();
    const st = pickAppState(a.getState());
    const byId = Object.fromEntries(st.ledger.map((e) => [e.id, e]));
    expect(Object.keys(byId).sort()).toEqual(['led:30', 'led:31', 'led:32', 'led:33']);
    expect(byId['led:30']).toEqual({ ...planted.ledger[0], yieldBps: undefined, termMonths: 12 });
    expect('yieldBps' in byId['led:30']).toBe(false);
    expect('termMonths' in byId['led:31'] || 'yieldBps' in byId['led:31']).toBe(false);
    expect(byId['led:31']).toMatchObject({ amountCents: 100000, what: 'Individual stocks', date: planted.ledger[1].date });
    expect(byId['led:32']).toEqual(planted.ledger[2]);
    expect(byId['led:33']).toEqual(planted.ledger[3]);
    // Everything except the ledger is exactly what was planted.
    const { ledger: _l1, ...restPlanted } = planted;
    const { ledger: _l2, ...restLoaded } = clone(st);
    expect(restLoaded).toEqual(clone(restPlanted));
    const env = await storedEnvelope();
    expect(env.version).toBe(PERSIST_VERSION);
    expect(env.state.ledger.find((e) => e.id === 'led:30')!.yieldBps).toBeUndefined();
    const first = takeTidyNotice();
    const second = takeTidyNotice();
    expect({ first, second }).toEqual({ first: 2, second: 0 });
    expect(S.invest.tidyNotice(first)).toMatch(/^2 entries had a length or a rate/);
  });

  it('a second boot of the migrated envelope tidies nothing and says nothing', async () => {
    await plantEnvelope({ ...realState(), ledger: oldRows(realState()) }, 1);
    await bootStore();
    takeTidyNotice();
    const before = await get<string>(STORAGE_KEY);
    const b = await bootStore();
    expect(takeTidyNotice()).toBe(0);
    expect(b.getState().ledger.map((e) => e.id).sort()).toEqual(['led:30', 'led:31', 'led:32', 'led:33']);
    expect(JSON.parse(before as string).state.ledger).toEqual((await storedEnvelope()).state.ledger);
  });

  it('a version 1 envelope that needs nothing loads unchanged and leaves no notice', async () => {
    const base = realState();
    const planted = { ...base, ledger: [row(base, 'led:32', { termMonths: 12, yieldBps: 450 })] };
    await plantEnvelope(planted, 1);
    const a = await bootStore();
    expect(clone(pickAppState(a.getState()))).toEqual(clone(planted));
    expect(takeTidyNotice()).toBe(0);
    expect((await storedEnvelope()).version).toBe(PERSIST_VERSION);
  });

  it('a version 1 envelope that arrives through the localStorage mirror (newer than IndexedDB) is tidied the same way', async () => {
    const base = realState();
    await set(STORAGE_KEY, JSON.stringify({ rev: 7, state: base, version: 1 }));
    localStorage.setItem(MIRROR_KEY, JSON.stringify({ rev: 8, state: { ...base, ledger: [row(base, 'led:30', { termMonths: 12, yieldBps: 3000 })] }, version: 1 }));
    sessionStorage.clear();
    const a = await bootStore();
    const e = a.getState().ledger.find((x) => x.id === 'led:30');
    expect(e, 'the mirror, being newer, must win').toBeDefined();
    expect(e!.yieldBps).toBeUndefined();
    expect(e!.termMonths).toBe(12);
    expect(takeTidyNotice()).toBe(1);
    const env = await storedEnvelope();
    expect(env.version).toBe(PERSIST_VERSION);
    expect(JSON.parse(localStorage.getItem(MIRROR_KEY) as string).version).toBe(PERSIST_VERSION);
  });

  it('DEFECT: a version 1 ledger row the migrate cannot read makes it throw, the app boots as a brand new user, and the first write replaces every byte of the stored profile', async () => {
    const base = realState();
    // A row with no `what` (a corrupt row; no build writes one). Before e7bb37f the migrate was
    // the identity, so this loaded and at worst broke the screens that read `what`.
    const { what: _w, ...noWhat } = row(base, 'led:60', {});
    const planted = { ...base, ledger: [noWhat] };

    // Control: the same envelope at version 2 skips the migrate and loads the user.
    await plantEnvelope(planted, 2);
    const control = await bootStore();
    const controlName = control.getState().profile.name;

    await clearPersistedState();
    await plantEnvelope(planted, 1);
    const a = await bootStore();
    const bootedAs = { name: a.getState().profile.name, onboarded: a.getState().profile.onboardingComplete, hydrated: a.persist.hasHydrated() };
    // Any state change after a failed hydration is persisted by zustand; here, the theme toggle.
    a.getState().setTheme('dark');
    await waitFor(async () => (await storedEnvelope()).state.settings.theme === 'dark');
    const after = (await storedEnvelope()).state;
    const lost = { name: after.profile.name, events: after.events.length, ledger: after.ledger.length, dayIndex: after.clock.dayIndex };
    expect(
      { bootedName: bootedAs.name, storedName: after.profile.name, storedEvents: after.events.length },
      `AUDIT-RESULT control v2 boot name="${controlName}"; v1 boot ${JSON.stringify(bootedAs)}; planted name="Sam" events=${base.events.length} ledger=1 dayIndex=${base.clock.dayIndex}; stored after one theme tap ${JSON.stringify(lost)}`,
    ).toEqual({ bootedName: 'Sam', storedName: 'Sam', storedEvents: base.events.length });
  });
});

// ---------------------------------------------------------------------------------------------
describe('R16.8 through the IMPORT path: can anything absurd reach a maturity line now?', () => {
  const SENTINEL_T = 777771;
  const SENTINEL_Y = 777772;

  it('JSON numbers that are not finite once parsed (1e400) or negative zero are removed, never rendered', () => {
    const base = realState();
    const file = { ...base, ledger: [row(base, 'led:1', { holdingType: BONDS_CDS_KEY, termMonths: SENTINEL_T, yieldBps: SENTINEL_Y })] };
    const { push: _p, ...rest } = file;
    const text = JSON.stringify(rest).replace(String(SENTINEL_T), '1e400').replace(String(SENTINEL_Y), '-0');
    const r = parseImport(text);
    expect(r.ok, r.ok ? '' : r.problems.join('\n')).toBe(true);
    if (!r.ok) return;
    const e = r.state.ledger[0];
    expect({ tidied: r.tidied, hasTerm: 'termMonths' in e, hasRate: 'yieldBps' in e, line: investLine(e) }).toEqual({ tidied: 1, hasTerm: false, hasRate: false, line: null });
  });

  it('over every numeric extreme, type path and amount, an imported row renders either nothing or an in-range exact figure, and a usable value is never removed', () => {
    const base = realState();
    const values = [-1e308, -1, -0, 0, 0.5, 1, 11.999, 12, 599, 600, 601, 2499, 2500, 2501, 1e21, 2 ** 53, Number.MAX_VALUE];
    const kinds: Array<Partial<LedgerEntry>> = [
      { holdingType: BONDS_CDS_KEY, what: 'Bonds or CDs' },
      { holdingType: BONDS_CDS_KEY, what: 'Individual stock' },
      { what: 'Bonds or CDs' },
      { what: '  bonds OR cds ' },
      { holdingType: 'stocks', what: 'Bonds or CDs' },
      { what: 'Individual stocks' },
      { holdingType: 'other', what: 'Gold' },
    ];
    const bad: string[] = [];
    let checked = 0;
    for (const k of kinds)
      for (const amountCents of [1, 100_000_000])
        for (const t of values)
          for (const y of [450, ...values]) {
            const e = row(base, 'led:1', { ...k, amountCents, termMonths: t, yieldBps: y });
            const { push: _p, ...rest } = { ...base, ledger: [e] };
            const r = parseImport(JSON.stringify(rest));
            checked += 1;
            if (!r.ok) {
              bad.push(`refused ${JSON.stringify(k)} t=${t} y=${y}: ${r.problems[0]}`);
              continue;
            }
            const got = r.state.ledger[0];
            const m = investLine(got);
            if (m && (!Number.isSafeInteger(m.valueAtMaturityCents) || m.termMonths > MAX_TERM_MONTHS || m.yieldBps > MAX_YIELD_BPS)) bad.push(`absurd line ${JSON.stringify(m)}`);
            const bond = isBondRow({ holdingType: k.holdingType, what: k.what! });
            const usableT = Number.isInteger(t) && t > 0 && t <= MAX_TERM_MONTHS;
            if (bond && usableT && got.termMonths !== t) bad.push(`usable term ${t} removed on ${JSON.stringify(k)}`);
            if (!bond && ('termMonths' in got || 'yieldBps' in got)) bad.push(`non bond row kept a term or rate: ${JSON.stringify(got)}`);
          }
    // eslint-disable-next-line no-console
    console.log(`AUDIT-RESULT import extremes: ${checked} files, ${bad.length} problems`);
    expect(bad.slice(0, 10)).toEqual([]);
  });

  it('a term or rate that is not a number is refused, and the message names the field and calls the file an export', () => {
    const base = realState();
    for (const [k, v] of [['termMonths', '12'], ['termMonths', null], ['yieldBps', '4.5'], ['yieldBps', true], ['yieldBps', [450]], ['termMonths', { n: 12 }]] as const) {
      const e: any = row(base, 'led:1', { holdingType: BONDS_CDS_KEY, termMonths: 12, yieldBps: 450 });
      e[k] = v;
      const { push: _p, ...rest } = { ...base, ledger: [e] };
      const r = parseImport(JSON.stringify(rest));
      expect(r.ok, `${k}=${JSON.stringify(v)}`).toBe(false);
      if (r.ok) continue;
      expect(r.looksLikeExport, `${k}=${JSON.stringify(v)}`).toBe(true);
      expect(r.problems[0]).toMatch(new RegExp(`^ledger\\[0\\]\\.${k}: expected a number`));
    }
  });

  it('RECORD: the refusal message for each kind of bad file', () => {
    const base = realState();
    const { push: _p, ...rest } = base;
    const good = JSON.stringify(rest, null, 2);
    const learnKey = 'Buy NVDA now, it will double by spring';
    const cases: Array<[string, string]> = [
      ['not JSON', 'hello'],
      ['a truncated real export (download cut off half way)', good.slice(0, Math.floor(good.length / 2))],
      ['{}', '{}'],
      ['another app\'s JSON', JSON.stringify({ version: 3, items: [1, 2] })],
      ['schemaVersion 2 and nothing else', JSON.stringify({ schemaVersion: 2 })],
      ['schemaVersion 2 with one wrong section', JSON.stringify({ schemaVersion: 2, places: 'x' })],
      ['real export with a string term', good.replace('"ledger": []', '"ledger": [' + JSON.stringify(row(base, 'led:1', { termMonths: '12' as never })) + ']')],
      ['real export with an unknown learn key taken from the file', JSON.stringify({ ...rest, learn: { ...rest.learn, [learnKey]: { readAt: null } } })],
    ];
    const out: string[] = [];
    for (const [label, text] of cases) {
      const r = parseImport(text);
      // Cycle 6 correction: the shipped app (Settings.tsx, Welcome.tsx) calls
      // importInvalid(r.section), the fixed-list key V2-29 added, never r.problems[0] (the raw
      // validator string). This RECORD predates that fix; fixed here so the printout matches
      // what actually renders on screen.
      const shown = r.ok ? `imported (tidied ${r.tidied})` : r.looksLikeExport ? S.settings.importInvalid(r.section) : S.settings.importBad;
      out.push(`${label}: ${shown}`);
    }
    // eslint-disable-next-line no-console
    console.log(`AUDIT-RESULT refusal messages:\n${out.join('\n')}`);
    expect(out.length).toBe(cases.length);
  });
});

// ---------------------------------------------------------------------------------------------
describe('tidyLedger', () => {
  it('counts a row once however many fields it loses, is idempotent, and returns the same objects for rows that follow the rules', () => {
    const base = realState();
    const good = row(base, 'led:1', { holdingType: BONDS_CDS_KEY, termMonths: 12, yieldBps: 450 });
    const both = row(base, 'led:2', { termMonths: 900, yieldBps: 3000 });
    const t1 = tidyLedger([good, both]);
    expect(t1.tidied).toBe(1);
    expect(t1.ledger[0]).toBe(good);
    expect(t1.ledger[1]).toEqual({ ...both, termMonths: undefined, yieldBps: undefined } as never);
    const t2 = tidyLedger(t1.ledger);
    expect(t2.tidied).toBe(0);
    expect(t2.ledger).toEqual(t1.ledger);
  });

  it('the own export of a tidied state re-imports with nothing left to tidy', () => {
    const base = realState();
    const t = tidyLedger([row(base, 'led:2', { termMonths: 12, yieldBps: 3000 }), row(base, 'led:3', { what: 'Crypto', termMonths: 12 })]);
    const r = parseImport(exportStateJson({ ...base, ledger: t.ledger }));
    expect(r.ok && r.tidied).toBe(0);
  });
});
