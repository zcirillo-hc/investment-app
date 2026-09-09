import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import type { Paycheck } from '../domain/interfaces';
import { catchCents } from '../domain/catch';
import { MAX_CATCH_PCT, MIN_CATCH_PCT } from '../config';
import { S } from '../content/strings';
import { Button } from './Button';
import { Money } from './Money';
import { RichText } from './Term';
import { usePrefersReducedMotion } from '../lib/hooks';

interface Props {
  paycheck: Paycheck;
  defaultPct: number;
  onAccept: (pct: number) => void;
  onDecline: () => void;
}

/** Plan 6.9. Bottom sheet on mobile, centered modal on desktop. Sits under the nav and demo tray (z-30). */
export function CatchSheet({ paycheck, defaultPct, onAccept, onDecline }: Props) {
  const reduced = usePrefersReducedMotion();
  const [pct, setPct] = useState(defaultPct);
  const [changing, setChanging] = useState(false);
  useEffect(() => {
    setPct(defaultPct);
    setChanging(false);
  }, [paycheck.id, defaultPct]);
  const amount = catchCents(paycheck.amountCents, pct);
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center lg:items-center" role="presentation">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" aria-hidden="true" />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="catch-title"
        data-testid="catch-sheet"
        data-paycheck-id={paycheck.id}
        initial={reduced ? false : { y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 260, damping: 26 }}
        /* Short viewports with the tray open and "Change %" expanded used to push the
           accept button off the top, so the sheet caps its height and scrolls inside. */
        className="relative max-h-[90dvh] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-3xl bg-card p-5 pb-[calc(1.25rem+var(--bottom-inset,64px)+env(safe-area-inset-bottom))] elev-3 ring-1 ring-line lg:rounded-3xl lg:pb-5"
      >
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-line lg:hidden" />
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-coral-soft" aria-hidden="true">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-coral-ink" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 8.5h16v9H4zM12 15a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" />
            </svg>
          </span>
          <h2 id="catch-title" className="text-xs font-bold uppercase tracking-[0.14em] text-muted">
            <RichText text={S.catchSheet.title} />
          </h2>
        </div>
        <p className="mt-2 text-[22px] font-extrabold leading-tight num">{S.catchSheet.landed(paycheck.amountCents)}</p>
        <p className="mt-2 text-base leading-snug">
          {S.catchSheet.questionPrefix(pct)}
          <Money cents={amount} testId="catch-amount" className="font-bold" />.
        </p>
        {changing && (
          <div className="mt-3 rounded-2xl bg-leaf-soft p-3" data-testid="catch-pct-stepper">
            <div className="text-xs font-semibold text-muted">{S.catchSheet.pctLabel}</div>
            <div className="mt-2 flex items-center gap-3">
              <button
                type="button"
                data-testid="catch-pct-minus"
                aria-label={S.catchSheet.minus}
                className="press h-11 w-11 rounded-full bg-card text-xl font-bold ring-1 ring-line elev-1"
                onClick={() => setPct((p) => Math.max(MIN_CATCH_PCT, p - 1))}
              >
                -
              </button>
              <input
                type="range"
                min={MIN_CATCH_PCT}
                max={MAX_CATCH_PCT}
                value={pct}
                onChange={(e) => setPct(Number(e.target.value))}
                className="h-11 flex-1 accent-leaf"
                aria-label={S.catchSheet.pctLabel}
                data-testid="catch-pct-range"
              />
              <span data-testid="catch-pct-value" className="w-12 text-center font-mono text-lg font-bold">
                {pct}%
              </span>
              <button
                type="button"
                data-testid="catch-pct-plus"
                aria-label={S.catchSheet.plus}
                className="press h-11 w-11 rounded-full bg-card text-xl font-bold ring-1 ring-line elev-1"
                onClick={() => setPct((p) => Math.min(MAX_CATCH_PCT, p + 1))}
              >
                +
              </button>
            </div>
            <div className="mt-2 text-xs text-muted">{S.catchSheet.thisDepositOnly}</div>
          </div>
        )}
        <div className="mt-4 flex flex-col gap-2">
          <Button size="lg" full data-testid="catch-accept" onClick={() => onAccept(pct)}>
            {S.catchSheet.accept(amount)}
          </Button>
          <Button variant="secondary" full data-testid="catch-decline" onClick={onDecline}>
            {S.catchSheet.decline}
          </Button>
          {!changing && (
            <button type="button" data-testid="catch-change-pct" className="press mt-1 inline-flex min-h-[44px] items-center justify-center text-sm font-semibold text-leaf underline" onClick={() => setChanging(true)}>
              {S.catchSheet.changePct}
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
