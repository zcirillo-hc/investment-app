import type { Nudge } from '../domain/types';
import { clampMinuteOfDay } from '../domain/dates';
import { formatCents } from '../domain/money';
import { NUDGE_LEAD_MINUTES } from '../config';
import { S } from '../content/strings';
import { Card } from './Card';
import { Button } from './Button';
import { RichText } from './Term';

/**
 * Plan v2 section 8.2 and 9.2. One card, one sentence, two buttons. The estimate is shown with
 * its label (R5.4). "Not today" expires the nudge with no consequence and no follow up
 * (R4.6, R4.7), which is why this component has no third state and no dismissal copy.
 *
 * The usual time in the copy is the nudge minute plus the R4.2 lead, rather than a stored
 * field, so the Nudge shape stays exactly the one plan 5.2 lists.
 *
 * Visual polish pass, 2026-09-09. This is the moment the whole app is for, so it now looks
 * like a decision rather than like a row in a list: the amount is drawn once, large, moving
 * from a coin into a jar, and the two answers are a full width pair. Not one word of copy
 * changed, and in particular there is still nothing here for the person who says no.
 */
export function NudgeCard({ nudge, onSkip, onDismiss }: { nudge: Nudge; onSkip: () => void; onDismiss: () => void }) {
  return (
    <Card tone="amber" elevation="high" className="mt-3 overflow-hidden" data-testid="nudge-card" data-place={nudge.placeId} data-estimate={nudge.estimateCents}>
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-on-amber" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 7v5l3 2" />
            <circle cx="12" cy="12" r="9" />
          </svg>
        </span>
        <div className="text-xs font-bold uppercase tracking-[0.14em] text-muted">{S.nudge.kicker}</div>
      </div>

      <h2 className="mt-2 text-2xl font-extrabold leading-tight tracking-tight" data-testid="nudge-title">
        {S.nudge.title(nudge.displayName)}
      </h2>

      {/* The amount, once, as a picture: a coin going into a jar. Decorative, and every number
          in it is repeated in the sentence underneath, so nothing here is the only copy of a fact. */}
      <div className="mt-3 flex items-center justify-center gap-3 rounded-2xl bg-card/70 px-3 py-3" aria-hidden="true">
        <span className="rounded-full bg-amber px-3 py-1.5 text-lg font-extrabold text-on-amber num">{formatCents(nudge.estimateCents)}</span>
        <svg width="26" height="16" viewBox="0 0 26 16" fill="none" className="text-muted" aria-hidden="true">
          <path d="M1 8h20M16 3l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
        </svg>
        <svg width="30" height="34" viewBox="0 0 30 34" aria-hidden="true">
          <rect x="9" y="2" width="12" height="5" rx="2.2" className="fill-leaf" />
          <rect x="4.5" y="8" width="21" height="23" rx="6.5" className="fill-card stroke-leaf" strokeWidth="2.4" />
          <rect x="7" y="19" width="16" height="10" rx="4.5" className="fill-coral" />
        </svg>
      </div>

      <p className="mt-3 text-base leading-snug" data-testid="nudge-body">
        {S.nudge.body(nudge.estimateCents, clampMinuteOfDay(nudge.nudgeMinute + NUDGE_LEAD_MINUTES))}
      </p>
      <p className="mt-1 text-xs text-muted" data-testid="nudge-estimate-label">
        <RichText text={S.nudge.estimateLabel} />
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button className="flex-1" data-testid="nudge-skip" onClick={onSkip}>
          {S.nudge.skip}
        </Button>
        <Button variant="secondary" data-testid="nudge-not-today" onClick={onDismiss}>
          {S.nudge.notToday}
        </Button>
      </div>
    </Card>
  );
}
