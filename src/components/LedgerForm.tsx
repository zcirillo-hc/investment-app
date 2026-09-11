import { useId, useState } from 'react';
import type { LedgerEntry, LedgerSource } from '../domain/types';
import type { LedgerDraft, LedgerProblem } from '../domain/ledger';
import { formatCents, parseDollarInput } from '../domain/money';
import { LEDGER_NOTE_MAX_LENGTH, LEDGER_WHAT_MAX_LENGTH } from '../config';
import { HOLDING_TYPES, LEDGER_WHAT_SUGGESTIONS } from '../content/holdingTypes';
import { S } from '../content/strings';
import { Button } from './Button';
import { Card } from './Card';
import { BONDS_CDS_KEY, isBondRow, parseRateBps, parseTermMonths } from '../domain/maturity';

const MESSAGES: Record<LedgerProblem, string> = {
  amount: S.invest.errAmount,
  amountTooLarge: S.invest.errAmountTooLarge,
  date: S.invest.errDate,
  dateFuture: S.invest.errDateFuture,
  what: S.invest.errWhat,
  whatTooLong: S.invest.errWhatTooLong,
  noteTooLong: S.invest.errNoteTooLong,
  term: S.invest.errTerm,
  yield: S.invest.errYield,
  notBond: S.invest.errNotBond,
};

export function messageFor(problems: string[]): string {
  const first = problems[0] as LedgerProblem;
  return MESSAGES[first] ?? S.invest.errWhat;
}

interface Props {
  /** Pre-filled from the jar (R6.4) when this is the jar move form. */
  initial?: Partial<LedgerEntry>;
  currentDate: string;
  source: LedgerSource;
  /** The jar move form fixes the amount at the whole jar balance (R6.4). */
  lockAmount?: boolean;
  title: string;
  onSave: (draft: LedgerDraft) => { ok: true } | { ok: false; problems: string[] };
  onCancel: () => void;
  testIdPrefix?: string;
}

/**
 * Plan v2 section 8.7. Amount, date, what it went into (free text with a suggestion list) and
 * an optional note. The form states that the app does not check this against anything and does
 * not track a price (R7.3). There is no percent, no value and no chart on it.
 */
export function LedgerForm({ initial, currentDate, source, lockAmount = false, title, onSave, onCancel, testIdPrefix = 'ledger' }: Props) {
  const listId = useId();
  const [amount, setAmount] = useState(initial?.amountCents !== undefined ? String(initial.amountCents / 100) : '');
  const [date, setDate] = useState(initial?.date ?? currentDate);
  const [what, setWhat] = useState(initial?.what ?? '');
  const [note, setNote] = useState(initial?.note ?? '');
  // R16.5, V2-23 (owner decision, 2026-09-11). The type is a choice made here, never read from
  // the free text name, so the two cannot quietly disagree. A row saved before types were
  // stored starts on Bonds or CDs if its name says so.
  const initialType = initial?.holdingType ?? (initial?.what !== undefined && isBondRow({ what: initial.what }) ? BONDS_CDS_KEY : undefined);
  const [type, setType] = useState<string | undefined>(initialType);
  // R16.2, V2-10. A bond or CD row shows its length and rate, prefilled, so saving a note no
  // longer erases them and emptying a field is a real way to clear it.
  const bond = type === BONDS_CDS_KEY;
  const [term, setTerm] = useState(initial?.termMonths !== undefined ? String(initial.termMonths) : '');
  const [rate, setRate] = useState(initial?.yieldBps !== undefined ? (initial.yieldBps / 100).toFixed(2) : '');
  const [error, setError] = useState<string | null>(null);

  const pickType = (key: string) => {
    const next = HOLDING_TYPES.find((h) => h.key === key);
    if (!next) return;
    const prev = HOLDING_TYPES.find((h) => h.key === type);
    // Fill the name only while it is empty or still the previous type's own label, so a name
    // the user typed is never overwritten.
    if (what.trim() === '' || (prev !== undefined && what.trim() === prev.label)) setWhat(next.requiresLabel ? '' : next.label);
    setType(key);
  };

  const submit = () => {
    const cents = lockAmount ? (initial?.amountCents ?? 0) : (parseDollarInput(amount) ?? 0);
    let cd: Pick<LedgerDraft, 'termMonths' | 'yieldBps' | 'holdingType'> = type !== undefined ? { holdingType: type } : {};
    if (bond) {
      const t = parseTermMonths(term);
      const y = parseRateBps(rate);
      if (t.kind === 'invalid') return setError(S.invest.errTerm);
      if (y.kind === 'invalid') return setError(S.invest.errYield);
      cd = { holdingType: BONDS_CDS_KEY, termMonths: t.kind === 'ok' ? t.value : null, yieldBps: y.kind === 'ok' ? y.value : null };
    } else if (initial?.termMonths !== undefined || initial?.yieldBps !== undefined) {
      // Moving a row off Bonds or CDs removes its length and rate instead of stranding them.
      cd = { ...cd, termMonths: null, yieldBps: null };
    }
    const r = onSave({ date, amountCents: cents, what, note, source, ...cd });
    if (!r.ok) {
      setError(messageFor(r.problems));
      return;
    }
    setError(null);
  };

  return (
    <Card className="mt-3" elevation="high" data-testid={`${testIdPrefix}-form`}>
      <h2 className="text-lg font-extrabold">{title}</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-semibold">{S.invest.amount}</span>
          {lockAmount ? (
            <div className="mt-1 min-h-[46px] rounded-2xl bg-ground px-3 py-2 text-lg font-bold ring-1 ring-line num" data-testid={`${testIdPrefix}-amount-locked`}>
              {formatCents(initial?.amountCents ?? 0)}
            </div>
          ) : (
            <div className="relative mt-1">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">$</span>
              <input
                data-testid={`${testIdPrefix}-amount`}
                inputMode="decimal"
                className="min-h-[46px] w-full rounded-2xl bg-ground py-2 pl-7 pr-3 text-lg font-bold ring-1 ring-line transition num focus:outline-none focus:ring-2 focus:ring-leaf"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
          )}
        </label>
        <label className="block text-sm">
          <span className="font-semibold">{S.invest.date}</span>
          <input
            data-testid={`${testIdPrefix}-date`}
            type="date"
            className="mt-1 min-h-[44px] w-full rounded-2xl bg-ground px-3 py-2 ring-1 ring-line transition focus:outline-none focus:ring-2 focus:ring-leaf"
            value={date}
            max={currentDate || undefined}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
      </div>
      <fieldset className="mt-3" data-testid={`${testIdPrefix}-type`}>
        <legend className="text-sm font-semibold">{S.invest.typeLabel}</legend>
        <div className="mt-1 flex flex-wrap gap-2">
          {HOLDING_TYPES.map((h) => (
            <button
              key={h.key}
              type="button"
              data-testid={`${testIdPrefix}-type-${h.key}`}
              aria-pressed={type === h.key}
              onClick={() => pickType(h.key)}
              className={`press inline-flex min-h-[44px] items-center rounded-full px-3.5 text-sm font-semibold ring-1 ${
                type === h.key ? 'bg-leaf text-on-leaf ring-leaf elev-1' : 'bg-card text-ink ring-line hover:bg-leaf-soft'
              }`}
            >
              {h.label}
            </button>
          ))}
        </div>
      </fieldset>
      <label className="mt-3 block text-sm">
        <span className="font-semibold">{S.invest.what}</span>
        <input
          data-testid={`${testIdPrefix}-what`}
          className="mt-1 min-h-[44px] w-full rounded-2xl bg-ground px-3 py-2 ring-1 ring-line transition focus:outline-none focus:ring-2 focus:ring-leaf"
          value={what}
          list={listId}
          maxLength={LEDGER_WHAT_MAX_LENGTH + 1}
          placeholder={S.invest.whatPlaceholder}
          onChange={(e) => setWhat(e.target.value)}
        />
        <datalist id={listId}>
          {LEDGER_WHAT_SUGGESTIONS.map((sug) => (
            <option key={sug} value={sug} />
          ))}
        </datalist>
      </label>
      <label className="mt-3 block text-sm">
        <span className="font-semibold">{S.invest.note}</span>
        <input
          data-testid={`${testIdPrefix}-note`}
          className="mt-1 min-h-[44px] w-full rounded-2xl bg-ground px-3 py-2 ring-1 ring-line transition focus:outline-none focus:ring-2 focus:ring-leaf"
          value={note}
          maxLength={LEDGER_NOTE_MAX_LENGTH + 1}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      {bond && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2" data-testid={`${testIdPrefix}-cd`}>
          <label className="block text-sm">
            <span className="font-semibold">{S.invest.termLabel}</span> <span className="text-muted">({S.invest.termUnit})</span>
            <input
              data-testid={`${testIdPrefix}-term`}
              inputMode="numeric"
              className="mt-1 min-h-[44px] w-full rounded-2xl bg-ground px-3 py-2 ring-1 ring-line transition num focus:outline-none focus:ring-2 focus:ring-leaf"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="font-semibold">{S.invest.yieldLabel}</span> <span className="text-muted">({S.invest.yieldUnit})</span>
            <input
              data-testid={`${testIdPrefix}-rate`}
              inputMode="decimal"
              className="mt-1 min-h-[44px] w-full rounded-2xl bg-ground px-3 py-2 ring-1 ring-line transition num focus:outline-none focus:ring-2 focus:ring-leaf"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
            />
          </label>
        </div>
      )}
      <p className="mt-2 text-xs text-muted" data-testid={`${testIdPrefix}-disclaimer`}>
        {S.invest.disclaimer}
      </p>
      {error && (
        <p role="alert" data-testid={`${testIdPrefix}-error`} className="mt-2 text-sm font-semibold text-coral-ink">
          {error}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button data-testid={`${testIdPrefix}-save`} onClick={submit}>
          {S.common.save}
        </Button>
        <Button variant="secondary" data-testid={`${testIdPrefix}-cancel`} onClick={onCancel}>
          {S.common.cancel}
        </Button>
      </div>
    </Card>
  );
}
