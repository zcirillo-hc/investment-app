// Coder suite for the cycle 3 fixes (b143bdf, V2-9 to V2-19) and the cycle 4 fixes after them.
// Until 2026-09-11 the only tests of this code were the tester's uncommitted files, so R16.5 to
// R16.7 passed rules:check with no committed case behind them.
import { describe, expect, it } from 'vitest';
import {
  BONDS_CDS_KEY,
  MAX_TERM_MONTHS,
  MAX_YIELD_BPS,
  isBondRow,
  maturityOf,
  parseRateBps,
  parseTermMonths,
} from '../../src/domain/maturity';
import { replaceEntry, tidyLedger, validateDraft, type LedgerDraft } from '../../src/domain/ledger';
import { putAsideCents } from '../../src/domain/selectors';
import { addLedgerEntry, completeOnboarding, moveJarToLedger, updateLedgerEntry } from '../../src/domain/tick';
import { initialAppState, type AppState, type LedgerEntry } from '../../src/domain/types';
import { validateImportedState } from '../../src/state/validate';
import { migratePersisted } from '../../src/state/persistence';
import { LEDGER_MAX_AMOUNT_CENTS } from '../../src/config';

const DAY = '2026-06-15';
const CREATED = '2026-06-15T12:00:00.000Z';

function bondRow(over: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    id: 'led:1',
    date: DAY,
    amountCents: 100000,
    what: 'Bonds or CDs',
    note: '',
    source: 'manual',
    createdAt: CREATED,
    holdingType: BONDS_CDS_KEY,
    termMonths: 12,
    yieldBps: 450,
    ...over,
  };
}

function onboarded(): AppState {
  const s = initialAppState();
  s.profile = { ...s.profile, name: 'Sam', seed: 42, createdAt: '2026-09-06T00:00:00.000Z', fear: 'pointless' };
  return completeOnboarding(s, { startDate: DAY, todayLocal: '2026-09-06', seedOverride: null });
}

describe('R16.7 the capture reads a rate the way people type one (V2-11)', () => {
  it('reads 4.5, 4.5%, 4,5 and a spaced 4.5 % alike', () => {
    for (const t of ['4.5', '4.5%', '4,5', ' 4.5 % ']) expect(parseRateBps(t), t).toEqual({ kind: 'ok', value: 450 });
  });
  it('rounds half away from zero from the decimal string, not from a float', () => {
    expect(parseRateBps('1.005')).toEqual({ kind: 'ok', value: 101 });
    expect(parseRateBps('1.004')).toEqual({ kind: 'ok', value: 100 });
    expect(parseRateBps('0.125')).toEqual({ kind: 'ok', value: 13 });
  });
  it('stops at the 25% ceiling (V2-18)', () => {
    expect(MAX_YIELD_BPS).toBe(2500);
    expect(parseRateBps('25')).toEqual({ kind: 'ok', value: 2500 });
    expect(parseRateBps('25.01').kind).toBe('invalid');
    expect(parseRateBps('50').kind).toBe('invalid');
  });
  it('tells empty apart from unusable, so nothing typed is dropped silently', () => {
    expect(parseRateBps('').kind).toBe('empty');
    expect(parseRateBps('   ').kind).toBe('empty');
    for (const t of ['about 4', '4.5.1', '-3']) expect(parseRateBps(t).kind, t).toBe('invalid');
  });
  it('the largest figure the app allows is still an exact number of cents', () => {
    const m = maturityOf(LEDGER_MAX_AMOUNT_CENTS, MAX_YIELD_BPS, MAX_TERM_MONTHS);
    expect(m).not.toBeNull();
    expect(Number.isSafeInteger(m?.valueAtMaturityCents)).toBe(true);
  });
});

describe('R16.7 the capture reads a length in whole months', () => {
  it('accepts whole months up to the cap and nothing else', () => {
    expect(parseTermMonths('12')).toEqual({ kind: 'ok', value: 12 });
    expect(parseTermMonths(String(MAX_TERM_MONTHS))).toEqual({ kind: 'ok', value: MAX_TERM_MONTHS });
    expect(parseTermMonths(String(MAX_TERM_MONTHS + 1)).kind).toBe('invalid');
    expect(parseTermMonths('12.5').kind).toBe('invalid');
    expect(parseTermMonths('a year').kind).toBe('invalid');
    expect(parseTermMonths('').kind).toBe('empty');
  });
});

describe('R16.5 only a bonds or CDs row carries a term and a rate (V2-12)', () => {
  it('the stored type decides, and the label is only a fallback for rows saved before it', () => {
    expect(isBondRow({ holdingType: BONDS_CDS_KEY, what: 'My CD' })).toBe(true);
    expect(isBondRow({ holdingType: 'stocks', what: 'Bonds or CDs' })).toBe(false);
    expect(isBondRow({ what: ' bonds or cds ' })).toBe(true);
    expect(isBondRow({ what: 'Individual stocks' })).toBe(false);
  });
  it('validateDraft refuses a term on a stock row and allows it on a bond row', () => {
    const base: LedgerDraft = { date: DAY, amountCents: 1000, what: 'Individual stocks', note: '', source: 'manual', holdingType: 'stocks' };
    const stock = validateDraft({ ...base, termMonths: 12 }, DAY);
    expect(stock.ok).toBe(false);
    if (!stock.ok) expect(stock.problems).toContain('notBond');
    expect(validateDraft({ ...base, what: 'Bonds or CDs', holdingType: BONDS_CDS_KEY, termMonths: 12, yieldBps: 450 }, DAY).ok).toBe(true);
    expect(validateDraft({ ...base, what: 'Bonds or CDs', holdingType: undefined, termMonths: 12 }, DAY).ok).toBe(true);
  });
});

describe('R16.6 an edit keeps what its form did not show (V2-10)', () => {
  const draft: LedgerDraft = { date: DAY, amountCents: 100000, what: 'Bonds or CDs', note: 'renewed', source: 'manual' };
  it('undefined keeps the stored term and rate', () => {
    const [e] = replaceEntry([bondRow()], 'led:1', draft);
    expect(e).toMatchObject({ note: 'renewed', termMonths: 12, yieldBps: 450, holdingType: BONDS_CDS_KEY });
  });
  it('null clears them, removing the keys rather than leaving a rate the user deleted', () => {
    const [e] = replaceEntry([bondRow()], 'led:1', { ...draft, termMonths: null, yieldBps: null });
    expect('termMonths' in e).toBe(false);
    expect('yieldBps' in e).toBe(false);
  });
  it('a bond row saved before types were stored is stamped with its type on first edit', () => {
    const legacy = bondRow();
    delete legacy.holdingType;
    const [e] = replaceEntry([legacy], 'led:1', draft);
    expect(e.holdingType).toBe(BONDS_CDS_KEY);
  });
});

describe('V2-25 an edit is judged on the row as it will be stored', () => {
  const stockRow: LedgerEntry = { id: 'led:1', date: DAY, amountCents: 100000, what: 'Individual stocks', note: '', source: 'manual', createdAt: CREATED, holdingType: 'stocks' };
  it('a draft labelled Bonds or CDs cannot put a term on a row stored as stocks', () => {
    const s: AppState = { ...initialAppState(), ledger: [stockRow] };
    const r = updateLedgerEntry(s, 'led:1', { date: DAY, amountCents: 100000, what: 'Bonds or CDs', note: '', source: 'manual', termMonths: 360, yieldBps: 1000 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems).toContain('notBond');
    expect(r.state.ledger[0]).toEqual(stockRow);
  });
  it('a bond row can still change its term', () => {
    const s: AppState = { ...initialAppState(), ledger: [bondRow()] };
    const r = updateLedgerEntry(s, 'led:1', { date: DAY, amountCents: 100000, what: 'Bonds or CDs', note: '', source: 'manual', termMonths: 24 });
    expect(r.ok).toBe(true);
    expect(r.state.ledger[0].termMonths).toBe(24);
  });
});

describe('R10.4 Your money counts each dollar once (V2-9)', () => {
  it('is the jar plus what was recorded, and moving the jar does not double it', () => {
    // Onboarded, because a jar move stamps an event with the simulated date.
    const s: AppState = { ...onboarded(), jarCents: 435 };
    expect(putAsideCents(s)).toBe(435);
    const moved = moveJarToLedger(s, { date: DAY, what: 'Broad index fund', note: '' }, CREATED);
    expect(moved.ok).toBe(true);
    expect(moved.state.jarCents).toBe(0);
    expect(putAsideCents(moved.state)).toBe(435);
  });
  it('money the user spent is not counted, and a manual entry is', () => {
    expect(putAsideCents({ ...initialAppState(), jarCents: 0 })).toBe(0);
    const s: AppState = { ...initialAppState(), jarCents: 435, ledger: [bondRow({ amountCents: 50000 })] };
    expect(putAsideCents(s)).toBe(50435);
  });
});

describe('R16.8 rows saved under earlier rules are tidied, not refused (V2-21)', () => {
  it('drops only the field the current rules cannot use, and counts the rows it changed', () => {
    const over = bondRow({ id: 'led:1', yieldBps: 3000 });
    const stock: LedgerEntry = { ...bondRow({ id: 'led:2' }), what: 'Individual stocks', holdingType: 'stocks' };
    const fine = bondRow({ id: 'led:3' });
    const r = tidyLedger([over, stock, fine]);
    expect(r.tidied).toBe(2);
    expect(r.ledger[0]).toMatchObject({ amountCents: 100000, what: 'Bonds or CDs', termMonths: 12 });
    expect('yieldBps' in r.ledger[0]).toBe(false);
    expect('termMonths' in r.ledger[1] || 'yieldBps' in r.ledger[1]).toBe(false);
    expect(r.ledger[1]).toMatchObject({ amountCents: 100000, what: 'Individual stocks' });
    expect(r.ledger[2]).toBe(fine);
  });
  it('an import tidies those rows instead of refusing the file, and reports how many', () => {
    const stock: LedgerEntry = { ...bondRow({ id: 'led:2' }), what: 'Individual stocks', holdingType: 'stocks' };
    const raw = JSON.parse(JSON.stringify({ ...onboarded(), ledger: [bondRow({ yieldBps: 3000 }), stock] })) as Record<string, unknown>;
    const r = validateImportedState(raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.tidied).toBe(2);
    expect('yieldBps' in r.state.ledger[0]).toBe(false);
    expect(r.state.ledger[0].termMonths).toBe(12);
    expect('termMonths' in r.state.ledger[1]).toBe(false);
  });
  it('a term that is not a number at all is still a damaged file, and is refused', () => {
    const raw = JSON.parse(JSON.stringify({ ...onboarded(), ledger: [bondRow()] })) as { ledger: Record<string, unknown>[] };
    raw.ledger[0].termMonths = 'twelve';
    expect(validateImportedState(raw).ok).toBe(false);
  });
  it('changes nothing on a ledger that already follows the rules', () => {
    const ledger = [bondRow()];
    const r = tidyLedger(ledger);
    expect(r.tidied).toBe(0);
    expect(r.ledger[0]).toBe(ledger[0]);
  });
});

describe('R16.8 on load: migratePersisted (persist version 2), and V2-27', () => {
  it('tidies a version 1 ledger once', () => {
    const p = { ...onboarded(), ledger: [bondRow({ yieldBps: 3000 })] };
    const out = migratePersisted(p, 1) as AppState;
    expect('yieldBps' in out.ledger[0]).toBe(false);
    expect(out.ledger[0]).toMatchObject({ termMonths: 12, amountCents: 100000, what: 'Bonds or CDs' });
  });
  it('leaves a version 2 envelope exactly as stored', () => {
    const p = { ...onboarded(), ledger: [bondRow({ yieldBps: 3000 })] };
    expect(migratePersisted(p, 2)).toBe(p);
  });
  it('never throws on a row it cannot read, and hands the state back unchanged', () => {
    const p = { ...onboarded(), ledger: [{ id: 'led:1', what: 42 }] };
    expect(() => migratePersisted(p, 1)).not.toThrow();
    expect(migratePersisted(p, 1)).toBe(p);
  });
});

describe('V2-17 an import keeps only the fields the app knows', () => {
  it('drops unknown keys, such as coordinates or an address, instead of carrying them forward', () => {
    const added = addLedgerEntry(onboarded(), { date: DAY, amountCents: 1000, what: 'Broad index fund', note: '', source: 'manual', holdingType: 'indexFund' }, CREATED);
    expect(added.ok).toBe(true);
    const raw = JSON.parse(JSON.stringify(added.state)) as Record<string, any>;
    raw.ledger[0].lat = 40.7;
    raw.profile.address = '1 Main St';
    const r = validateImportedState(raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect('lat' in r.state.ledger[0]).toBe(false);
    expect('address' in r.state.profile).toBe(false);
    expect(r.state.ledger[0]).toMatchObject({ what: 'Broad index fund', holdingType: 'indexFund', amountCents: 1000 });
  });
});
