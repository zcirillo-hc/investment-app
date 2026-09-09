// Plan v2 R7. The manual investment ledger, and R7.3, which is a rule about what must NOT exist.
import { describe, expect, it } from 'vitest';
import type { LedgerEntry } from '../../src/domain/types';
import * as ledger from '../../src/domain/ledger';
import {
  findEntry,
  firstEntryDate,
  ledgerEntryCount,
  ledgerGroups,
  ledgerTotalCents,
  makeEntry,
  nextLedgerId,
  removeEntry,
  replaceEntry,
  sortedLedger,
  validateDraft,
  type LedgerDraft,
} from '../../src/domain/ledger';

function draft(over: Partial<LedgerDraft> = {}): LedgerDraft {
  return { date: '2026-06-15', amountCents: 5000, what: 'Index fund', note: '', source: 'manual', ...over };
}

function entry(over: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    id: 'led:1',
    date: '2026-06-15',
    amountCents: 5000,
    what: 'Index fund',
    note: '',
    source: 'manual',
    createdAt: '2026-06-15T10:00:00.000Z',
    ...over,
  };
}

describe('R7.1 entry validation', () => {
  it('accepts a well formed draft and returns it trimmed', () => {
    const r = validateDraft(draft({ what: '  Index fund  ', note: '  a note  ' }), '2026-06-20');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.draft).toMatchObject({ what: 'Index fund', note: 'a note' });
  });

  it('refuses a date later than the current simulated date, and accepts the same date', () => {
    expect(validateDraft(draft({ date: '2026-06-21' }), '2026-06-20')).toMatchObject({ ok: false, problems: ['dateFuture'] });
    expect(validateDraft(draft({ date: '2026-06-20' }), '2026-06-20').ok).toBe(true);
  });

  it('refuses a malformed date', () => {
    expect(validateDraft(draft({ date: 'yesterday' }), '2026-06-20')).toMatchObject({ ok: false, problems: ['date'] });
    expect(validateDraft(draft({ date: '2026-02-30' }), '2026-06-20')).toMatchObject({ ok: false, problems: ['date'] });
  });

  it('refuses zero, a negative amount and a fractional one', () => {
    expect(validateDraft(draft({ amountCents: 0 }), '2026-06-20')).toMatchObject({ ok: false, problems: ['amount'] });
    expect(validateDraft(draft({ amountCents: -1 }), '2026-06-20')).toMatchObject({ ok: false, problems: ['amount'] });
    // R1.1: money is integer cents, everywhere.
    expect(validateDraft(draft({ amountCents: 1.5 }), '2026-06-20')).toMatchObject({ ok: false, problems: ['amount'] });
  });

  it('accepts exactly the cap and refuses the cent above it', () => {
    expect(validateDraft(draft({ amountCents: 100_000_000 }), '2026-06-20').ok).toBe(true);
    expect(validateDraft(draft({ amountCents: 100_000_001 }), '2026-06-20')).toMatchObject({ ok: false, problems: ['amountTooLarge'] });
  });

  it('requires 1 to 60 characters of `what` after trimming', () => {
    expect(validateDraft(draft({ what: '   ' }), '2026-06-20')).toMatchObject({ ok: false, problems: ['what'] });
    expect(validateDraft(draft({ what: 'x'.repeat(60) }), '2026-06-20').ok).toBe(true);
    expect(validateDraft(draft({ what: 'x'.repeat(61) }), '2026-06-20')).toMatchObject({ ok: false, problems: ['whatTooLong'] });
  });

  it('bounds the note at 200 characters and allows it to be empty', () => {
    expect(validateDraft(draft({ note: 'x'.repeat(200) }), '2026-06-20').ok).toBe(true);
    expect(validateDraft(draft({ note: 'x'.repeat(201) }), '2026-06-20')).toMatchObject({ ok: false, problems: ['noteTooLong'] });
  });

  it('never checks `what` against a security, a ticker or anything else, only its length', () => {
    // Free text is the point (R7.1). Emoji, punctuation and nonsense are all valid.
    for (const what of ['a fund my dad mentioned', 'coffee futures lol', 'ETF', '???']) {
      expect(validateDraft(draft({ what }), '2026-06-20').ok, what).toBe(true);
    }
  });

  it('reports every problem at once rather than one at a time', () => {
    const r = validateDraft(draft({ date: 'nope', amountCents: 0, what: '' }), '2026-06-20');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems.sort()).toEqual(['amount', 'date', 'what']);
  });
});

describe('R7.5 ordering', () => {
  it('is date descending, then createdAt descending, then id descending', () => {
    const rows = [
      entry({ id: 'led:1', date: '2026-06-15', createdAt: '2026-06-15T10:00:00.000Z' }),
      entry({ id: 'led:2', date: '2026-06-16', createdAt: '2026-06-16T10:00:00.000Z' }),
      entry({ id: 'led:3', date: '2026-06-15', createdAt: '2026-06-15T11:00:00.000Z' }),
    ];
    expect(sortedLedger(rows).map((e) => e.id)).toEqual(['led:2', 'led:3', 'led:1']);
  });

  it('falls through to the id when the date and createdAt tie', () => {
    const rows = [entry({ id: 'led:1' }), entry({ id: 'led:2' })];
    expect(sortedLedger(rows).map((e) => e.id)).toEqual(['led:2', 'led:1']);
  });

  it('does not mutate the array it was given', () => {
    const rows = [entry({ id: 'led:1' }), entry({ id: 'led:2' })];
    sortedLedger(rows);
    expect(rows.map((e) => e.id)).toEqual(['led:1', 'led:2']);
  });
});

describe('R7.2 what is computed', () => {
  const rows = [
    entry({ id: 'led:1', date: '2026-06-15', amountCents: 5000, what: 'Index fund' }),
    entry({ id: 'led:2', date: '2026-06-10', amountCents: 2500, what: 'index FUND' }),
    entry({ id: 'led:3', date: '2026-06-20', amountCents: 1, what: 'Crypto' }),
  ];

  it('totals the contributions', () => {
    expect(ledgerTotalCents(rows)).toBe(7501);
    expect(ledgerTotalCents([])).toBe(0);
  });

  it('counts the entries', () => {
    expect(ledgerEntryCount(rows)).toBe(3);
  });

  it('finds the earliest date', () => {
    expect(firstEntryDate(rows)).toBe('2026-06-10');
    expect(firstEntryDate([])).toBeNull();
  });

  it('groups case insensitively and displays the first spelling seen', () => {
    const groups = ledgerGroups(rows);
    expect(groups).toEqual([
      { what: 'Index fund', totalCents: 7500, count: 2 },
      { what: 'Crypto', totalCents: 1, count: 1 },
    ]);
  });
});

describe('R7.3 what is never computed', () => {
  it('exports no function that could state what an entry is worth today', () => {
    // Enforced by name over the module's exports, as the plan requires, so adding one is a
    // test failure rather than a code review catch.
    const banned = /(value|price|gain|loss|return|percent|share|basis|growth|project|market|quote|worth|profit|performance)/i;
    const offenders = Object.keys(ledger).filter((k) => banned.test(k));
    expect(offenders).toEqual([]);
  });

  it('has no way to compare one entry to another', () => {
    const offenders = Object.keys(ledger).filter((k) => /compare|versus|vs|rank|best/i.test(k));
    expect(offenders).toEqual([]);
  });
});

describe('R7.4 edit and delete', () => {
  it('removes exactly one entry', () => {
    const rows = [entry({ id: 'led:1' }), entry({ id: 'led:2' })];
    expect(removeEntry(rows, 'led:1').map((e) => e.id)).toEqual(['led:2']);
  });

  it('leaves the ledger alone when the id is unknown', () => {
    const rows = [entry({ id: 'led:1' })];
    expect(removeEntry(rows, 'nope')).toHaveLength(1);
  });

  it('replaces the editable fields and keeps the id, source and createdAt', () => {
    const rows = [entry({ id: 'led:1', source: 'jar' })];
    const out = replaceEntry(rows, 'led:1', draft({ amountCents: 9, what: 'Crypto', note: 'n' }));
    expect(out[0]).toMatchObject({ id: 'led:1', source: 'jar', createdAt: '2026-06-15T10:00:00.000Z', amountCents: 9, what: 'Crypto' });
  });

  it('finds an entry by id', () => {
    expect(findEntry([entry({ id: 'led:1' })], 'led:1')?.id).toBe('led:1');
    expect(findEntry([], 'led:1')).toBeNull();
  });
});

describe('id allocation', () => {
  it('starts at 1 and never collides with an existing id', () => {
    expect(nextLedgerId([])).toBe('led:1');
    expect(nextLedgerId([entry({ id: 'led:1' }), entry({ id: 'led:7' })])).toBe('led:8');
  });

  it('ignores an id that does not match the pattern rather than restarting the sequence', () => {
    expect(nextLedgerId([entry({ id: 'imported-thing' }), entry({ id: 'led:3' })])).toBe('led:4');
  });

  it('makeEntry trims and stamps', () => {
    const e = makeEntry([], draft({ what: ' Crypto ', note: ' n ' }), '2026-06-15T10:00:00.000Z');
    expect(e).toMatchObject({ id: 'led:1', what: 'Crypto', note: 'n', createdAt: '2026-06-15T10:00:00.000Z' });
  });
});
