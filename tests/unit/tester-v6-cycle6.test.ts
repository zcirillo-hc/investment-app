/**
 * TESTER, cycle 6 (2026-09-11). Re-verifies V2-26 to V2-29 (64d619b) against the build notes'
 * "What the tester should re-check" list, and probes the immediate neighbourhood of each fix.
 *
 * Convention as in earlier cycles: a case titled DEFECT fails today on purpose, names its
 * finding and prints what it measured as AUDIT-RESULT. RECORD cases print and never fail.
 * Everything else must pass.
 */
import { describe, expect, it } from 'vitest';
import { BONDS_CDS_KEY } from '../../src/domain/maturity';
import { tidyLedger } from '../../src/domain/ledger';
import { moveJarToLedger, completeOnboarding } from '../../src/domain/tick';
import { initialAppState, type AppState, type LedgerEntry } from '../../src/domain/types';
import { migratePersisted, parseImport } from '../../src/state/persistence';
import { S } from '../../src/content/strings';

const DAY = '2026-06-15';
const CREATED = '2026-06-15T12:00:00.000Z';

function onboarded(): AppState {
  const s0 = initialAppState();
  s0.profile = { ...s0.profile, name: 'Sam', seed: 42, createdAt: '2026-06-15T00:00:00.000Z', fear: 'pointless', summerEarnedCents: 300000 };
  return completeOnboarding(s0, { startDate: DAY, todayLocal: DAY, seedOverride: null });
}

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

// ---------------------------------------------------------------------------------------------
describe('V2-26 re-verification: moveJarToLedger, the domain call Home.tsx now feeds', () => {
  it('stores holdingType, termMonths and yieldBps when the jar move draft carries a CD', () => {
    let s = onboarded();
    s = { ...s, jarCents: 435 };
    const r = moveJarToLedger(s, { date: DAY, what: 'Bonds or CDs', note: '', holdingType: BONDS_CDS_KEY, termMonths: 12, yieldBps: 450 }, CREATED);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.entry).toMatchObject({ holdingType: BONDS_CDS_KEY, termMonths: 12, yieldBps: 450, amountCents: 435, source: 'jar' });
  });

  it('stores holdingType with no term or rate for a non bond type (Individual stocks)', () => {
    let s = onboarded();
    s = { ...s, jarCents: 435 };
    const r = moveJarToLedger(s, { date: DAY, what: 'My brokerage', note: '', holdingType: 'stocks' }, CREATED);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.entry.holdingType).toBe('stocks');
    expect('termMonths' in r.entry).toBe(false);
    expect('yieldBps' in r.entry).toBe(false);
  });

  it('re-check: Something else picked with a typed name stores that holdingType and the typed name, nothing more', () => {
    let s = onboarded();
    s = { ...s, jarCents: 435 };
    const r = moveJarToLedger(s, { date: DAY, what: 'Side fund', note: '', holdingType: 'other' }, CREATED);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.entry).toMatchObject({ holdingType: 'other', what: 'Side fund' });
    expect('termMonths' in r.entry).toBe(false);
    expect('yieldBps' in r.entry).toBe(false);
  });

  it('re-check: no type picked at all stores no holdingType key, not an empty string or null', () => {
    let s = onboarded();
    s = { ...s, jarCents: 435 };
    // This is exactly what LedgerForm.submit sends when `type` state is still undefined:
    // `cd = type !== undefined ? { holdingType: type } : {}`, so holdingType is never a key.
    const r = moveJarToLedger(s, { date: DAY, what: 'Cash under the mattress', note: '' }, CREATED);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect('holdingType' in r.entry).toBe(false);
    expect(r.entry.what).toBe('Cash under the mattress');
  });

  it('AUDIT: the amount, date and source are still correct on a typed CD jar move (no regression alongside the fix)', () => {
    let s = onboarded();
    s = { ...s, jarCents: 999 };
    const r = moveJarToLedger(s, { date: DAY, what: 'Bonds or CDs', note: 'from skipping', holdingType: BONDS_CDS_KEY, termMonths: 6, yieldBps: 200 }, CREATED);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.entry.amountCents).toBe(999);
    expect(r.entry.source).toBe('jar');
    expect(r.entry.note).toBe('from skipping');
    expect(s.jarCents).toBe(999); // input state untouched
    expect(r.state.jarCents).toBe(0); // jar emptied in the result
  });
});

// ---------------------------------------------------------------------------------------------
describe('V2-27 re-verification: migratePersisted, the build notes\' re-check list', () => {
  function onboardedPersisted() {
    return onboarded() as unknown as { ledger: unknown[] };
  }

  it('re-check: ledger is not an array — returns the stored state unchanged, does not throw', () => {
    const p = { ...onboardedPersisted(), ledger: 'not-an-array' };
    expect(() => migratePersisted(p, 1)).not.toThrow();
    expect(migratePersisted(p, 1)).toBe(p);
  });

  it('re-check: ledger is null — returns the stored state unchanged, does not throw', () => {
    const p = { ...onboardedPersisted(), ledger: null };
    expect(() => migratePersisted(p, 1)).not.toThrow();
    expect(migratePersisted(p, 1)).toBe(p);
  });

  it('re-check: a null row inside the ledger array — returns the stored state unchanged, does not throw', () => {
    const p = { ...onboardedPersisted(), ledger: [bondRow(), null] };
    expect(() => migratePersisted(p, 1)).not.toThrow();
    expect(migratePersisted(p, 1)).toBe(p);
  });

  it('re-check: a row whose holdingType is a number — does not throw, and is treated as non bond (term/rate dropped, not left dangling)', () => {
    const p = { ...onboardedPersisted(), ledger: [bondRow({ holdingType: 5 as unknown as string })] };
    expect(() => migratePersisted(p, 1)).not.toThrow();
    const out = migratePersisted(p, 1) as AppState;
    expect('termMonths' in out.ledger[0]).toBe(false);
    expect('yieldBps' in out.ledger[0]).toBe(false);
    // the holdingType itself is not sanitized by tidyLedger (out of its stated scope), so the
    // bad-typed value survives the tidy. Recorded, not asserted as a defect (see report).
    // eslint-disable-next-line no-console
    console.log('AUDIT-RESULT V2-27 holdingType=number survives tidy as:', JSON.stringify(out.ledger[0].holdingType));
  });

  it('V2-30 regression guard: one unreadable row no longer blocks tidying of the OTHER row in the same ledger', () => {
    const good = bondRow({ id: 'led:1', yieldBps: 3000 }); // a stale 30% rate: must be tidied away
    const bad = { id: 'led:2', what: 42 } as unknown as LedgerEntry; // what is a number: throws inside isBondRow
    const p = { ...onboardedPersisted(), ledger: [good, bad] };
    expect(() => migratePersisted(p, 1)).not.toThrow();
    const out = migratePersisted(p, 1) as AppState;
    // The good row is tidied: its stale rate is gone, everything else about it survives.
    expect('yieldBps' in out.ledger[0]).toBe(false);
    expect(out.ledger[0]).toMatchObject({ id: 'led:1', amountCents: 100000, termMonths: 12 });
    // The unreadable row comes back exactly as stored, not dropped and not mutated: same
    // object, still carrying its impossible `what`.
    expect(out.ledger[1]).toBe(bad);
    expect((out.ledger[1] as unknown as { what: unknown }).what).toBe(42);
  });
});

// ---------------------------------------------------------------------------------------------
describe('tidyLedger itself, isolated (feeds both the load and import paths)', () => {
  it('a null row throws (this is what migratePersisted must catch)', () => {
    expect(() => tidyLedger([bondRow(), null as unknown as LedgerEntry])).toThrow();
  });
  it('a non-array-shaped ledger is not tidyLedger\'s job; callers must check Array.isArray first', () => {
    // documents the contract migratePersisted relies on
    expect(Array.isArray('nope')).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
describe('V2-29 re-verification: importPart / importInvalid, the build notes\' re-check list', () => {
  it('re-check: section "constructor" is not looked up on the object prototype — falls back to "one part of it"', () => {
    const msg = S.settings.importInvalid('constructor');
    expect(msg).toContain('one part of it');
    expect(msg).not.toMatch(/function|\[native code\]/);
  });

  it('re-check: section "__proto__" is not looked up on the object prototype — falls back to "one part of it"', () => {
    const msg = S.settings.importInvalid('__proto__');
    expect(msg).toContain('one part of it');
    expect(msg).not.toMatch(/\[object/);
  });

  it('AUDIT: other Object.prototype names (toString, hasOwnProperty, valueOf) also fall back safely', () => {
    for (const key of ['toString', 'hasOwnProperty', 'valueOf', 'isPrototypeOf', 'propertyIsEnumerable']) {
      const msg = S.settings.importInvalid(key);
      expect(msg).toContain('one part of it');
    }
  });

  it('every real known section maps to its own words, not the fallback', () => {
    const known = ['profile', 'settings', 'flags', 'clock', 'jarCents', 'places', 'visits', 'habits', 'nudges', 'ledger', 'events', 'pendingPaychecks', 'lessons', 'learn', 'learnSurfaces', 'milestones', 'demo'];
    for (const key of known) {
      const msg = S.settings.importInvalid(key);
      expect(msg).not.toContain('one part of it');
    }
  });

  it('never shows validator text or file content, for a real damaged export', () => {
    const good = JSON.parse(JSON.stringify({
      schemaVersion: 2,
      profile: { onboardingComplete: true, name: 'Sam', email: '', seed: 1, createdAt: '', summerEarnedCents: null, summerLeftCents: null, age: 20, fear: null },
      settings: { catchPct: 10, jarGoalCents: 5000, theme: 'system', nudgesEnabled: true, quietStartMinute: 0, quietEndMinute: 0, mutedPlaceIds: [] },
      clock: { startDate: DAY, dayIndex: 0, lastOpenedRealDate: '' },
      jarCents: 0,
      places: [],
      visits: [],
      habits: [],
      nudges: [],
      ledger: [{ id: 'led:1', date: DAY, amountCents: 1000, what: 'x', note: '', source: 'manual', createdAt: '', termMonths: 'twelve' }],
      events: [],
      pendingPaychecks: [],
      lessons: {},
      milestones: { first100Kept: null, firstSummer: null, pathFinished: null, firstSkipDayIndex: null, confettiShown: false },
      flags: { nudgeExplainerSeen: false, privacyExplainerSeen: false, investCapturePromptSeen: false },
      demo: {},
    }));
    const r = parseImport(JSON.stringify(good));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.section).toBe('ledger');
    const msg = S.settings.importInvalid(r.section);
    expect(msg).not.toContain('twelve');
    expect(msg).not.toContain('termMonths');
    expect(msg).not.toContain('led:1');
    expect(msg).toBe('That looks like a Spare Change export, but an investment entry did not pass the app\'s checks, so nothing changed.');
  });

  it('AUDIT: a bare top level key literally named "constructor" cannot be produced by validateImportedState today (path always carries a "lessons."/"learn."/"learnSurfaces." prefix for user-controlled keys)', () => {
    const bad = { schemaVersion: 2, constructor: { anything: true } }; // everything else missing
    const r = parseImport(JSON.stringify(bad));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    // missing-keys path: every problem ends with ": missing", so looksLikeExport is false and
    // importBad (not importInvalid) is what the UI actually shows; section is unused here.
    expect(r.looksLikeExport).toBe(false);
    console.log('AUDIT-RESULT V2-29: an extraneous top level "constructor" key is simply ignored; the file is refused as incomplete, not because of that key');
  });

  it('AUDIT: a user-controlled key of "constructor" reaching a nested check (lessons) keeps the dot prefix, so section is "lessons", never bare "constructor"', () => {
    const s = onboarded();
    const full = JSON.parse(JSON.stringify({ ...(s as unknown as Record<string, unknown>), schemaVersion: 2 }));
    full.lessons = { constructor: { unlockedDay: 0, readAt: null } }; // wrong count AND unknown id
    const r = parseImport(JSON.stringify(full));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.section).toBe('lessons');
    expect(r.section).not.toBe('constructor');
  });
});
