import { useState } from 'react';
import { useAppStore } from '../state/store';
import { useUiStore } from '../state/uiStore';
import { S } from '../content/strings';
import { Screen, ScreenTitle } from '../components/Screen';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { useAppNavigate } from '../lib/hooks';
import { HOLDING_TYPES } from '../content/holdingTypes';
import { parseDollarInput } from '../domain/money';
import { currentDate } from '../domain/selectors';
import { LEDGER_WHAT_MAX_LENGTH } from '../config';

interface Row {
  key: string;
  label: string;
  requiresLabel: boolean;
  amount: string;
  typedLabel: string;
}

/**
 * One glyph per holding type. They are a way to tell six chips apart at a glance, nothing
 * more: no glyph implies anything about a type, and the label is always present beside it.
 */
const CHIP_ICON: Record<string, string> = {
  indexFund: 'M4 18.5h16M7 15V9M11.5 15V6M16 15v-4',
  targetDate: 'M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8z',
  stocks: 'M4 16.5l5-5 3.5 3.5L20 7.5M20 7.5h-4.5M20 7.5V12',
  crypto: 'M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18zM9.5 8h4a2.2 2.2 0 0 1 0 4.4h-4M9.5 12.4h4.4a2.3 2.3 0 0 1 0 4.6H9.5M11 6v12',
  cash: 'M3.5 7.5h17v9h-17zM12 15a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  other: 'M5 12h.01M12 12h.01M19 12h.01',
};

/**
 * Plan v2 section 8.7a and 9.7a. The light "what are you invested in" capture that replaces
 * the deleted risk quiz and allocation builder (plan 1.2).
 *
 * It is a capture, not a quiz: it records what the user says is true about their own
 * holdings and computes nothing from it. On save it makes one `addLedgerEntry` call per row,
 * which is R7 and nothing more. There is no new domain module, no new ledger field, no
 * percent, no computed value, no risk label and no chart anywhere on this screen, including
 * at the moment of saving (criterion 11a).
 *
 * Visual polish pass, 2026-09-09: the chips carry a glyph and a real selected state, the rows
 * look like a short list you are filling in rather than a stack of forms, and the count of
 * what you have added so far sits next to Save. Nothing computed, and still no percent.
 */
export function InvestCapture() {
  const state = useAppStore();
  const addLedgerEntry = useAppStore((s) => s.addLedgerEntry);
  const markFlag = useAppStore((s) => s.markFlag);
  const showToast = useUiStore((s) => s.showToast);
  const navigate = useAppNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const date = currentDate(state);

  const toggleChip = (key: string) => {
    const type = HOLDING_TYPES.find((h) => h.key === key);
    if (!type) return;
    setRows((current) => {
      // A chip tapped twice must not create two rows for the same type.
      if (current.some((r) => r.key === key)) return current;
      return [...current, { key, label: type.label, requiresLabel: type.requiresLabel, amount: '', typedLabel: '' }];
    });
  };

  const removeRow = (key: string) => setRows((current) => current.filter((r) => r.key !== key));

  const patchRow = (key: string, patch: Partial<Row>) =>
    setRows((current) => current.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const rowReady = (r: Row): boolean => {
    const cents = parseDollarInput(r.amount);
    if (cents === null || cents <= 0) return false;
    if (!r.requiresLabel) return true;
    const label = r.typedLabel.trim();
    return label.length >= 1 && label.length <= LEDGER_WHAT_MAX_LENGTH;
  };

  // Save is disabled until at least one row has a positive amount and, for a something else
  // row, a non empty label. A row that is present but not ready blocks the save rather than
  // being silently dropped, so nothing is written that the user did not fill in.
  const canSave = rows.length > 0 && rows.every(rowReady);

  const save = () => {
    if (!canSave) return;
    let added = 0;
    for (const r of rows) {
      const cents = parseDollarInput(r.amount) ?? 0;
      const what = r.requiresLabel ? r.typedLabel.trim() : r.label;
      const result = addLedgerEntry({ date, amountCents: cents, what, note: '', source: 'manual' });
      if (!result.ok) {
        setError(r.requiresLabel && what.length > LEDGER_WHAT_MAX_LENGTH ? S.capture.errLabelTooLong : S.invest.errAmount);
        return;
      }
      added += 1;
    }
    markFlag('investCapturePromptSeen');
    // Leaving the screen empties the working list, so reopening it cannot re-add these rows.
    setRows([]);
    setError(null);
    showToast(S.capture.savedToast(added));
    navigate('/invest');
  };

  const field =
    'mt-1 min-h-[44px] w-full rounded-2xl bg-ground px-3 py-2 text-base ring-1 ring-line transition focus:outline-none focus:ring-2 focus:ring-leaf';

  return (
    <Screen id="invest-capture">
      <ScreenTitle title={S.capture.title} />
      <p className="mt-2 text-[15px] leading-snug text-muted" data-testid="invest-capture-subhead">
        {S.capture.subhead}
      </p>

      <Card className="mt-4" elevation="high">
        <p className="text-sm font-semibold text-muted">{S.capture.chipHint}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {HOLDING_TYPES.map((h) => {
            const selected = rows.some((r) => r.key === h.key);
            return (
              <button
                key={h.key}
                type="button"
                data-testid={`invest-capture-chip-${h.key}`}
                aria-pressed={selected}
                onClick={() => toggleChip(h.key)}
                className={`press inline-flex min-h-[44px] items-center gap-2 rounded-full px-4 text-sm font-semibold ring-1 ${
                  selected ? 'bg-leaf text-on-leaf ring-leaf elev-1' : 'bg-card text-ink ring-line hover:bg-leaf-soft'
                }`}
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d={CHIP_ICON[h.key] ?? CHIP_ICON.other} />
                </svg>
                {h.label}
                {selected && (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M5 12.5l4.5 4.5L19 7" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      </Card>

      {rows.length > 0 && (
        <ul className="stagger mt-4 space-y-3">
          {rows.map((r) => (
            <li key={r.key}>
              <Card data-testid={`invest-capture-row-${r.key}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-lg font-extrabold">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-leaf-soft" aria-hidden="true">
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-leaf" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                        <path d={CHIP_ICON[r.key] ?? CHIP_ICON.other} />
                      </svg>
                    </span>
                    {r.label}
                  </span>
                  <Button size="sm" variant="secondary" data-testid={`invest-capture-remove-${r.key}`} aria-label={S.capture.remove(r.label)} onClick={() => removeRow(r.key)}>
                    {S.common.delete}
                  </Button>
                </div>
                {r.requiresLabel && (
                  <label className="mt-3 block text-sm">
                    <span className="font-semibold">{S.capture.otherPlaceholder}</span>
                    <input
                      data-testid={`invest-capture-label-${r.key}`}
                      className={field}
                      value={r.typedLabel}
                      maxLength={LEDGER_WHAT_MAX_LENGTH + 1}
                      placeholder={S.capture.otherPlaceholder}
                      onChange={(e) => patchRow(r.key, { typedLabel: e.target.value })}
                    />
                  </label>
                )}
                <label className="mt-3 block text-sm">
                  <span className="font-semibold">{S.capture.amountLabel}</span>
                  <div className="relative mt-1">
                    <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 font-semibold text-muted">$</span>
                    <input
                      data-testid={`invest-capture-amount-${r.key}`}
                      inputMode="decimal"
                      className="min-h-[48px] w-full rounded-2xl bg-ground py-2 pl-8 pr-3 text-lg font-bold ring-1 ring-line transition num focus:outline-none focus:ring-2 focus:ring-leaf"
                      value={r.amount}
                      onChange={(e) => patchRow(r.key, { amount: e.target.value })}
                    />
                  </div>
                </label>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p role="alert" data-testid="invest-capture-error" className="mt-3 text-sm font-semibold text-coral-ink">
          {error}
        </p>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        <Button data-testid="invest-capture-save" disabled={!canSave} onClick={save}>
          {S.capture.save}
        </Button>
        <Button variant="secondary" data-testid="invest-capture-cancel" onClick={() => navigate('/invest')}>
          {S.common.cancel}
        </Button>
      </div>
    </Screen>
  );
}
