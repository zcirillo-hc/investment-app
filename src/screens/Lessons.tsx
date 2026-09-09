import { useAppStore } from '../state/store';
import { useUiStore } from '../state/uiStore';
import { S } from '../content/strings';
import { LESSONS } from '../content/lessons';
import { Screen, ScreenTitle } from '../components/Screen';
import { Card } from '../components/Card';
import { RichText } from '../components/Term';
import { ProgressRing } from '../components/ProgressRing';
import { MilestoneModal } from '../components/MilestoneCard';
import { AppLink } from '../lib/hooks';
import { lessonUiState, readCount } from '../domain/selectors';
import { LESSON_IDS } from '../domain/types';
import { formatDateLongSafe, safeSimDate } from '../domain/dates';

/**
 * Visual polish pass, 2026-09-09. The ring gets a card of its own so it reads as the thing
 * you are earning, and the eight lessons are numbered along a path rather than listed. The
 * three states keep a word each ("Locked", "New", "Read") beside their colour, so nothing
 * here is carried by colour alone.
 */
const STATE_PILL: Record<string, string> = {
  new: 'bg-coral text-on-coral',
  read: 'bg-leaf-soft text-leaf',
  locked: 'bg-line text-muted',
};

export function Lessons() {
  const state = useAppStore();
  const fired = useUiStore((s) => s.milestoneModal);
  const closeMilestone = useUiStore((s) => s.closeMilestone);
  const read = readCount(state);
  const total = LESSON_IDS.length;
  return (
    <Screen id="lessons">
      <ScreenTitle title={S.lessons.title} sub={S.lessons.sub} />

      {/* R15.6: once at the top of this screen. The same sentence is on Learn and in Settings. */}
      <p className="mt-4 rounded-2xl bg-leaf-soft p-3.5 text-sm leading-snug ring-1 ring-leaf/15" data-testid="lessons-not-advice">
        {S.lessons.notAdvice}
      </p>

      <Card className="mt-4" elevation="high">
        <ProgressRing
          value={read}
          total={total}
          label={S.lessons.ringTitle}
          hint={S.lessons.ringHint(total - read)}
          aria={`${S.lessons.ring(read, total)} ${S.lessons.ringLabel}`}
        />
        {read === total && (
          <p className="mt-3 rounded-2xl bg-leaf-soft p-3 text-sm font-bold" data-testid="path-done">
            {S.lessons.pathDone}
          </p>
        )}
        {/*
          Plan 8.8: one line below the ring links to the library. The ring keeps counting only
          the eight path lessons, because putting sixteen ungated articles into the same circle
          would turn a small satisfying ring into a homework tracker.
        */}
        <AppLink
          to="/learn"
          data-testid="learn-link"
          className="press mt-3 inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-ground px-4 text-sm font-bold text-leaf ring-1 ring-line/70"
        >
          {S.lessons.learnLink}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 5l7 7-7 7" />
          </svg>
        </AppLink>
      </Card>

      <ul className="stagger mt-5 space-y-2.5">
        {LESSONS.map((l, i) => {
          const st = lessonUiState(state, l.id);
          const inner = (
            <div
              className={`flex items-center gap-3 rounded-card p-4 ring-1 elev-1 ${
                st === 'locked' ? 'bg-card/60 text-muted ring-line' : st === 'new' ? 'bg-coral-soft ring-coral/60' : 'bg-card ring-line'
              } ${st === 'locked' ? '' : 'lift'}`}
            >
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-extrabold num ${
                  st === 'locked' ? 'bg-line text-muted' : st === 'new' ? 'bg-coral text-on-coral' : 'bg-leaf-soft text-leaf'
                }`}
                aria-hidden="true"
              >
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className={`font-bold leading-snug ${st === 'locked' ? '' : 'text-ink'}`}>{l.title}</div>
                {st === 'locked' && (
                  <div className="mt-0.5 text-xs leading-snug">
                    <RichText text={S.lessons.lockedHint(l.unlockHint)} />
                  </div>
                )}
              </div>
              <span data-testid={`lesson-state-${st}`} className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${STATE_PILL[st]}`}>
                {S.lessons.state[st]}
              </span>
            </div>
          );
          return (
            <li key={l.id} data-testid={`lesson-card-${l.id}`} data-state={st}>
              {st === 'locked' ? inner : <AppLink to={`/lessons/${l.id}`} className="block">{inner}</AppLink>}
            </li>
          );
        })}
      </ul>
      {fired === 'pathFinished' && state.milestones.pathFinished !== null && (
        <MilestoneModal
          items={[{ milestone: 'pathFinished', dateLabel: formatDateLongSafe(safeSimDate(state.clock.startDate, state.milestones.pathFinished)) }]}
          name={state.profile.name}
          onClose={closeMilestone}
        />
      )}
    </Screen>
  );
}
