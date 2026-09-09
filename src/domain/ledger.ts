// Plan v2 R7. The manual investment ledger: what the user says they put in, in real dollars,
// on their own.
//
// R7.3 is a rule about what this module must NOT contain. There is no current value, market
// value, gain, loss, return, percentage, share count, price, cost basis, or projection from an
// entry, and there is no comparison of one entry to another. `tests/unit/ledger.test.ts`
// asserts that by name over this module's exports, so adding one is a test failure.
import type { Cents, LedgerEntry, LedgerSource } from './types';
import { compareOrdinal } from './money';
import { isUsableTerm, isUsableYield } from './maturity';
import { isValidDate } from './dates';
import { LEDGER_MAX_AMOUNT_CENTS, LEDGER_NOTE_MAX_LENGTH, LEDGER_WHAT_MAX_LENGTH } from '../config';

export interface LedgerDraft {
  date: string;
  amountCents: Cents;
  what: string;
  note: string;
  source: LedgerSource;
  termMonths?: number;
  yieldBps?: number;
}

export type LedgerProblem = 'date' | 'dateFuture' | 'amount' | 'amountTooLarge' | 'what' | 'whatTooLong' | 'noteTooLong' | 'term' | 'yield';

export type LedgerValidation = { ok: true; draft: LedgerDraft } | { ok: false; problems: LedgerProblem[] };

/**
 * Plan v2 R7.1. `what` is free text with a suggestion list; the app never validates it
 * against a security, a ticker or anything else, only against its length. `date` may not be
 * later than the current simulated date.
 */
export function validateDraft(draft: LedgerDraft, currentDate: string): LedgerValidation {
  const problems: LedgerProblem[] = [];
  const what = draft.what.trim();
  const note = draft.note.trim();
  if (!isValidDate(draft.date)) problems.push('date');
  else if (isValidDate(currentDate) && draft.date > currentDate) problems.push('dateFuture');
  if (!Number.isInteger(draft.amountCents) || draft.amountCents <= 0) problems.push('amount');
  else if (draft.amountCents > LEDGER_MAX_AMOUNT_CENTS) problems.push('amountTooLarge');
  if (what.length < 1) problems.push('what');
  else if (what.length > LEDGER_WHAT_MAX_LENGTH) problems.push('whatTooLong');
  if (note.length > LEDGER_NOTE_MAX_LENGTH) problems.push('noteTooLong');
  // R16. Both are optional, but a value that is present and unusable is rejected rather than
  // quietly dropped: a term with no rate renders nothing, and silently discarding what someone
  // typed is how a ledger stops matching what they believe is in it.
  if (draft.termMonths !== undefined && !isUsableTerm(draft.termMonths)) problems.push('term');
  if (draft.yieldBps !== undefined && !isUsableYield(draft.yieldBps)) problems.push('yield');
  if (problems.length > 0) return { ok: false, problems };
  return { ok: true, draft: { ...draft, what, note } };
}

/** A stable, collision free id derived from the ids already in the ledger. */
export function nextLedgerId(ledger: LedgerEntry[]): string {
  let max = 0;
  for (const e of ledger) {
    const m = /^led:(\d+)$/.exec(e.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `led:${max + 1}`;
}

export function makeEntry(ledger: LedgerEntry[], draft: LedgerDraft, createdAt: string): LedgerEntry {
  return {
    id: nextLedgerId(ledger),
    date: draft.date,
    amountCents: draft.amountCents,
    what: draft.what.trim(),
    note: draft.note.trim(),
    source: draft.source,
    createdAt,
    // R16. Only spread when present, so a non bond entry never carries the keys at all and
    // `e.termMonths !== undefined` stays an honest test of whether this is a rate bearing row.
    ...(draft.termMonths !== undefined ? { termMonths: draft.termMonths } : {}),
    ...(draft.yieldBps !== undefined ? { yieldBps: draft.yieldBps } : {}),
  };
}

/** Plan v2 R7.5: by date descending, then createdAt descending, then id descending. */
export function sortedLedger(ledger: LedgerEntry[]): LedgerEntry[] {
  return ledger
    .slice()
    .sort((a, b) => compareOrdinal(b.date, a.date) || compareOrdinal(b.createdAt, a.createdAt) || compareOrdinal(b.id, a.id));
}

/** Plan v2 R7.2: the sum of every entry's amount. This is a total contributed, not a value. */
export function ledgerTotalCents(ledger: LedgerEntry[]): Cents {
  let sum = 0;
  for (const e of ledger) sum += e.amountCents;
  return sum;
}

export function ledgerEntryCount(ledger: LedgerEntry[]): number {
  return ledger.length;
}

/** Plan v2 R7.2: the earliest entry date, or null. */
export function firstEntryDate(ledger: LedgerEntry[]): string | null {
  let earliest: string | null = null;
  for (const e of ledger) if (earliest === null || e.date < earliest) earliest = e.date;
  return earliest;
}

export interface LedgerGroup {
  what: string;
  totalCents: Cents;
  count: number;
}

/**
 * Plan v2 R7.2: totals grouped by the exact trimmed `what` string, compared case
 * insensitively for grouping and displayed in the first spelling seen. Groups come back in
 * the order their first spelling appears in the ledger array, which is insertion order.
 */
export function ledgerGroups(ledger: LedgerEntry[]): LedgerGroup[] {
  const byKey = new Map<string, LedgerGroup>();
  for (const e of ledger) {
    const what = e.what.trim();
    const key = what.toLowerCase();
    const existing = byKey.get(key);
    if (existing) {
      existing.totalCents += e.amountCents;
      existing.count += 1;
    } else {
      byKey.set(key, { what, totalCents: e.amountCents, count: 1 });
    }
  }
  return [...byKey.values()];
}

export function findEntry(ledger: LedgerEntry[], id: string): LedgerEntry | null {
  return ledger.find((e) => e.id === id) ?? null;
}

/**
 * Plan v2 R7.4: entries are editable and deletable. Deleting an entry with source "jar" does
 * not restore the jar, and the copy says so before confirming, which is a UI obligation this
 * function deliberately does not soften.
 */
export function removeEntry(ledger: LedgerEntry[], id: string): LedgerEntry[] {
  return ledger.filter((e) => e.id !== id);
}

export function replaceEntry(ledger: LedgerEntry[], id: string, draft: LedgerDraft): LedgerEntry[] {
  return ledger.map((e) =>
    e.id === id
      ? {
          ...e,
          date: draft.date,
          amountCents: draft.amountCents,
          what: draft.what.trim(),
          note: draft.note.trim(),
          // R16. An edit that clears the term or the rate must remove the key, not leave the
          // old one behind, or the row would keep quoting a rate the user just deleted.
          termMonths: draft.termMonths,
          yieldBps: draft.yieldBps,
        }
      : e,
  );
}
