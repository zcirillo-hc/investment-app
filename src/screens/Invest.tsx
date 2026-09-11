import { useEffect, useState } from 'react';
import { useAppStore } from '../state/store';
import { useUiStore } from '../state/uiStore';
import { S } from '../content/strings';
import { Screen, ScreenTitle } from '../components/Screen';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Money } from '../components/Money';
import { RichText } from '../components/Term';
import { EmptyState } from '../components/EmptyState';
import { LedgerForm } from '../components/LedgerForm';
import { AppLink } from '../lib/hooks';
import { formatDateLongSafe } from '../domain/dates';
import { sortedLedger } from '../domain/ledger';
import { formatTerm, formatYield, isBondRow, maturityOf } from '../domain/maturity';
import { formatCents } from '../domain/money';
import { HOLDING_TYPES } from '../content/holdingTypes';
import { currentDate, ledgerCount, ledgerFirstDate, ledgerTotal } from '../domain/selectors';

/**
 * Plan v2 section 8.7. The manual investment ledger. R7.3: this screen shows no current
 * value, no growth, no percentage return and no chart, and there is no selector it could ask
 * for one. Criterion 11 scans the rendered page for a "%" next to a ledger figure.
 *
 * Visual polish pass, 2026-09-09. The empty screen used to be three stacked cards saying
 * roughly the same thing twice, with "Nothing recorded yet." underneath in a bare box. It is
 * one warm empty state now, with the two ways in as its actions, and each ledger row reads as
 * a receipt rather than as a form. Both test ids the specs use survive, one on the empty
 * state and one on its body line.
 */
export function Invest() {
  const state = useAppStore();
  const addLedgerEntry = useAppStore((s) => s.addLedgerEntry);
  const updateLedgerEntry = useAppStore((s) => s.updateLedgerEntry);
  const deleteLedgerEntry = useAppStore((s) => s.deleteLedgerEntry);
  const markLearnSurface = useAppStore((s) => s.markLearnSurface);
  const showToast = useUiStore((s) => s.showToast);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  /**
   * Plan R12.5: the first visit to this screen SURFACES E01 on Home. It does not unlock it:
   * E01 was readable from day 0 and stays readable whether this ever runs or not. Recording
   * the moment is idempotent, so a second visit cannot re-surface a card the user dismissed.
   */
  useEffect(() => {
    markLearnSurface('firstInvestVisit');
  }, [markLearnSurface]);

  const date = currentDate(state);
  const rows = sortedLedger(state.ledger);
  const total = ledgerTotal(state);
  const count = ledgerCount(state);
  const first = ledgerFirstDate(state);

  return (
    <Screen id="invest">
      <ScreenTitle title={S.invest.title} sub={S.invest.sub} />

      <Card tone="leaf" elevation="high" className="mt-4">
        <div className="text-xs font-bold uppercase tracking-[0.14em] text-muted">
          <RichText text={S.home.movedLabel} />
        </div>
        <Money cents={total} countUp testId="invest-total" className="mt-1 block text-[40px] font-extrabold leading-none num sm:text-5xl" />
        <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
          <span className="rounded-full bg-card px-3 py-1.5 ring-1 ring-line/70" data-testid="invest-count">
            {S.invest.count(count)}
          </span>
          {first && (
            <span className="rounded-full bg-card px-3 py-1.5 text-muted ring-1 ring-line/70" data-testid="invest-first-date">
              {S.invest.since(formatDateLongSafe(first))}
            </span>
          )}
        </div>
        {/* Plan 9.3: the honest line, at the top of Invest as well as on Home. */}
        <p className="mt-3 rounded-2xl bg-card/70 p-3 text-sm leading-snug text-muted" data-testid="invest-honest-line">
          {S.home.movedLine(total)}
        </p>
      </Card>

      {/*
        * Cycle 8, R15.6 and 9.8a. Next to the ledger total on purpose: this is the one screen
        * where a reader is looking at their own money while the app is talking about
        * investing in general, and it is the screen the library surfaces a piece onto.
        */}
      <p className="mt-4 rounded-2xl bg-leaf-soft p-3.5 text-sm leading-snug ring-1 ring-leaf/15" data-testid="invest-not-advice">
        {S.invest.notAdvice}
      </p>

      {/*
        * R18. What the six holding types are, in plain words. Deliberately STATIC: every user
        * sees all six in the same order with the same text no matter what their ledger holds,
        * because R15.4 forbids educational content that varies with what somebody owns. It
        * explains, it never recommends.
        */}
      <Card className="mt-4" data-testid="invest-types-card">
        <h2 className="text-base font-extrabold">{S.invest.typesTitle}</h2>
        <p className="mt-1 text-sm text-muted">{S.invest.typesSub}</p>
        <ul className="mt-3 space-y-3">
          {HOLDING_TYPES.map((h) => (
            <li key={h.key} data-testid={`invest-type-${h.key}`} className="rounded-2xl bg-ground p-3">
              <h3 className="text-sm font-extrabold">{h.label}</h3>
              <p className="mt-1 text-sm leading-snug">{h.what}</p>
              <AppLink to={`/learn/${h.learnId}`} className="mt-1 inline-flex min-h-[44px] items-center text-sm font-bold text-leaf underline" data-testid={`invest-type-link-${h.key}`}>
                {S.invest.typesReadMore}
              </AppLink>
            </li>
          ))}
        </ul>
      </Card>

      {/* Plan 8.7a: the primary action when the ledger is empty, a secondary link once it has entries. */}
      {count === 0 ? (
        <EmptyState
          className="mt-4"
          spot="invest"
          testId="invest-capture-entry-empty"
          bodyTestId="invest-empty"
          title={S.capture.emptyEntryTitle}
          body={S.capture.emptyEntryBody}
          action={
            <>
              <AppLink
                to="/invest/capture"
                data-testid="invest-capture-entry"
                className="press inline-flex min-h-[44px] items-center justify-center rounded-full bg-leaf px-5 font-semibold text-on-leaf elev-1"
              >
                {S.capture.emptyEntryCta}
              </AppLink>
              {!adding && !editingId && (
                <Button variant="secondary" data-testid="invest-add" onClick={() => setAdding(true)}>
                  {S.invest.addOne}
                </Button>
              )}
            </>
          }
        />
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {!adding && !editingId && (
            <Button data-testid="invest-add" onClick={() => setAdding(true)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                <path d="M12 5.5v13M5.5 12h13" />
              </svg>
              {S.invest.add}
            </Button>
          )}
          <AppLink
            to="/invest/capture"
            data-testid="invest-capture-entry"
            className="press inline-flex min-h-[44px] items-center rounded-full bg-card px-4 text-sm font-semibold text-leaf ring-1 ring-line/70"
          >
            {S.capture.secondaryEntry}
          </AppLink>
        </div>
      )}

      {adding && (
        <LedgerForm
          testIdPrefix="ledger"
          title={S.invest.formTitle}
          currentDate={date}
          source="manual"
          onSave={(draft) => {
            const r = addLedgerEntry(draft);
            if (r.ok) {
              setAdding(false);
              showToast(S.invest.savedToast);
            }
            return r;
          }}
          onCancel={() => setAdding(false)}
        />
      )}

      {rows.length > 0 && (
        <ul className="stagger mt-4 space-y-3">
          {rows.map((e) => (
            <li key={e.id}>
              <Card data-testid="ledger-row" data-id={e.id} data-cents={e.amountCents} data-source={e.source}>
                {editingId === e.id ? (
                  <LedgerForm
                    testIdPrefix="ledger-edit"
                    title={S.invest.editTitle}
                    initial={e}
                    currentDate={date}
                    source={e.source}
                    onSave={(draft) => {
                      const r = updateLedgerEntry(e.id, draft);
                      if (r.ok) setEditingId(null);
                      return r;
                    }}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <>
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-leaf-soft" aria-hidden="true">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-leaf" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M4 19h16M7.5 16v-5M12 16V6.5M16.5 16v-3" />
                        </svg>
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                          <span className="text-lg font-extrabold leading-tight" data-testid="ledger-row-what">
                            {e.what}
                          </span>
                          <Money cents={e.amountCents} testId="ledger-row-amount" className="text-lg font-extrabold num" />
                        </div>
                        <div className="mt-0.5 text-sm text-muted" data-testid="ledger-row-date">
                          {formatDateLongSafe(e.date)}
                        </div>
                        {(() => {
                          // R16.5, V2-23: the picked type shows whenever the typed name differs
                          // from it, so a CD named "Individual stock" still reads as a CD.
                          // Something else is skipped: its name is always the user's own.
                          const t = HOLDING_TYPES.find((h) => h.key === e.holdingType);
                          if (!t || t.requiresLabel || t.label.toLowerCase() === e.what.trim().toLowerCase()) return null;
                          return (
                            <p className="mt-1 inline-flex rounded-full bg-ground px-2.5 py-0.5 text-xs font-semibold text-muted ring-1 ring-line" data-testid={`ledger-row-type-${e.id}`}>
                              {t.label}
                            </p>
                          );
                        })()}
                        {e.note && <p className="mt-1.5 rounded-xl bg-ground px-2.5 py-1.5 text-sm">{e.note}</p>}
                        {(() => {
                          // R16. Only shows when the entry actually carries both, so every
                          // pre R16 entry and every non bond row is untouched.
                          const m = isBondRow(e) && e.termMonths !== undefined && e.yieldBps !== undefined ? maturityOf(e.amountCents, e.yieldBps, e.termMonths) : null;
                          if (!m) return null;
                          return (
                            <p className="mt-1.5 rounded-xl bg-leaf-soft px-2.5 py-1.5 text-sm font-semibold" data-testid={`ledger-maturity-${e.id}`}>
                              {S.invest.maturityLine(formatYield(m.yieldBps), formatTerm(m.termMonths), formatCents(m.interestCents), formatCents(m.valueAtMaturityCents))}
                            </p>
                          );
                        })()}
                        {e.source === 'jar' && (
                          <p className="mt-1.5 inline-flex rounded-full bg-leaf-soft px-2.5 py-1 text-xs font-bold text-leaf">{S.invest.jarSourced}</p>
                        )}
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" variant="secondary" data-testid={`ledger-edit-${e.id}`} onClick={() => setEditingId(e.id)}>
                        {S.common.edit}
                      </Button>
                      <Button size="sm" variant="secondary" data-testid={`ledger-delete-${e.id}`} onClick={() => setConfirmId(e.id)}>
                        {S.common.delete}
                      </Button>
                    </div>
                    {confirmId === e.id && (
                      <div className="mt-3 rounded-2xl bg-coral-soft p-3" data-testid="ledger-delete-confirm">
                        {/* R7.4: deleting a jar sourced entry does not restore the jar, and the copy says so. */}
                        <p className="text-sm">{S.invest.deleteWarn}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="danger"
                            data-testid="ledger-delete-yes"
                            onClick={() => {
                              deleteLedgerEntry(e.id);
                              setConfirmId(null);
                            }}
                          >
                            {S.invest.deleteYes}
                          </Button>
                          <Button size="sm" variant="secondary" data-testid="ledger-delete-cancel" onClick={() => setConfirmId(null)}>
                            {S.common.cancel}
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </Screen>
  );
}
