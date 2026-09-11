// Plan v2 R7. The manual investment ledger: what the user says they put in, in real dollars,
// on their own.
//
// R7.3 is a rule about what this module must NOT contain. There is no current value, market
// value, gain, loss, return, percentage, share count, price, cost basis, or projection from an
// entry, and there is no comparison of one entry to another. `tests/unit/ledger.test.ts`
// asserts that by name over this module's exports, so adding one is a test failure.
import type { Cents, LedgerEntry, LedgerSource } from './types';
import { compareOrdinal } from './money';
import { BONDS_CDS_KEY, isBondRow, isUsableTerm, isUsableYield } from './maturity';
import { isValidDate } from './dates';
import { LEDGER_MAX_AMOUNT_CENTS, LEDGER_NOTE_MAX_LENGTH, LEDGER_WHAT_MAX_LENGTH } from '../config';

export interface LedgerDraft {
  date: string;
  amountCents: Cents;
  what: string;
  note: string;
  source: LedgerSource;
  /** R16.2. On an edit, `undefined` keeps the stored value and `null` clears it (V2-10). */
  termMonths?: number | null;
  yieldBps?: number | null;
  /** R16.5. */
  holdingType?: string;
}

export type LedgerProblem = 'date' | 'dateFuture' | 'amount' | 'amountTooLarge' | 'what' | 'whatTooLong' | 'noteTooLong' | 'term' | 'yield' | 'notBond';

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
  const hasTerm = draft.termMonths !== undefined && draft.termMonths !== null;
  const hasYield = draft.yieldBps !== undefined && draft.yieldBps !== null;
  if (hasTerm && !isUsableTerm(draft.termMonths as number)) problems.push('term');
  if (hasYield && !isUsableYield(draft.yieldBps as number)) problems.push('yield');
  // R16.5, V2-12: a rate on a stock row would be quoted as if it were a contract.
  if ((hasTerm || hasYield) && !isBondRow({ holdingType: draft.holdingType, what })) problems.push('notBond');
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
    ...(typeof draft.termMonths === 'number' ? { termMonths: draft.termMonths } : {}),
    ...(typeof draft.yieldBps === 'number' ? { yieldBps: draft.yieldBps } : {}),
    ...(draft.holdingType !== undefined ? { holdingType: draft.holdingType } : {}),
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

/**
 * R16.2, V2-10. An edit only changes what the draft actually carries. `undefined` means the form
 * never showed that field, so the stored value is kept: before this, a note-only edit through a
 * form with no rate field erased a bond's term and rate. `null` means the user cleared it, so the
 * key is removed rather than left quoting a rate they deleted. A pre-R16.5 bond row is stamped
 * with its type on the first edit, so later changing its label cannot strand a rate on it.
 */
function applyEdit(e: LedgerEntry, draft: LedgerDraft): LedgerEntry {
  const next: LedgerEntry = { ...e, date: draft.date, amountCents: draft.amountCents, what: draft.what.trim(), note: draft.note.trim() };
  if (draft.holdingType !== undefined) next.holdingType = draft.holdingType;
  else if (next.holdingType === undefined && (e.termMonths !== undefined || e.yieldBps !== undefined) && isBondRow(e)) next.holdingType = BONDS_CDS_KEY;
  if (draft.termMonths === null) delete next.termMonths;
  else if (draft.termMonths !== undefined) next.termMonths = draft.termMonths;
  if (draft.yieldBps === null) delete next.yieldBps;
  else if (draft.yieldBps !== undefined) next.yieldBps = draft.yieldBps;
  return next;
}

/**
 * R16.8, V2-21 (owner decision, 2026-09-11). A row saved under earlier rules, such as a rate
 * between 25% and 50% or a term or rate on a row that is not a bond or a CD, keeps its amount
 * and name and loses only the field today's rules cannot use. The caller tells the user how
 * many rows changed. Rows that already follow the rules come back as the same objects.
 */
export function tidyLedger(ledger: LedgerEntry[]): { ledger: LedgerEntry[]; tidied: number } {
  let tidied = 0;
  const out = ledger.map((e) => {
    const bond = isBondRow(e);
    const dropTerm = e.termMonths !== undefined && (!bond || !isUsableTerm(e.termMonths));
    const dropRate = e.yieldBps !== undefined && (!bond || !isUsableYield(e.yieldBps));
    if (!dropTerm && !dropRate) return e;
    tidied += 1;
    const next = { ...e };
    if (dropTerm) delete next.termMonths;
    if (dropRate) delete next.yieldBps;
    return next;
  });
  return { ledger: out, tidied };
}

/**
 * R16.5, V2-25. `validateDraft` can only see the draft, but an edit keeps the stored type, so
 * a draft labelled "Bonds or CDs" could put a term on a row stored as stocks. This judges the
 * entry as it will actually be stored, which is what the import validator will see later.
 */
export function editKeepsBondRule(e: LedgerEntry, draft: LedgerDraft): boolean {
  const next = applyEdit(e, draft);
  return (next.termMonths === undefined && next.yieldBps === undefined) || isBondRow(next);
}

export function replaceEntry(ledger: LedgerEntry[], id: string, draft: LedgerDraft): LedgerEntry[] {
  return ledger.map((e) =>
    e.id === id ? applyEdit(e, draft) : e,
  );
}
