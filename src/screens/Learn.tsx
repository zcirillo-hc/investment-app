import { useAppStore } from '../state/store';
import { S } from '../content/strings';
import { LEARN_TRACKS, learnItemsInTrack } from '../content/learn';
import { Screen, ScreenTitle } from '../components/Screen';
import { AppLink } from '../lib/hooks';
import { trackSkin, TrackBadge } from '../components/LearnTrackMark';
import { learnReadCount, learnTotal, learnIsRead } from '../domain/selectors';

/**
 * Plan v2 section 8.9. The library: three tracks, sixteen pieces, no locks.
 *
 * Two decisions this screen has to keep visibly true.
 *
 * R12.5: nothing here is locked. There is no unlock check anywhere in this file and no locked
 * branch to render, because a person who wants to know how a brokerage account works on day
 * one should be able to read it on day one, and gating education behind having skipped a
 * coffee would be the app deciding what someone is ready to know.
 *
 * 8.9: progress is a plain count, not a ring. No percentage complete, no badge for finishing,
 * because finishing is not the point. The confidence path keeps the ring, because the path is
 * the thing you earn by using the app.
 *
 * Visual polish pass, 2026-09-09. Sixteen identical white pills read as a syllabus. Each
 * track now has its own colour, badge and count, and each piece is numbered inside its track,
 * so the library is something to browse rather than something to get through. The progress
 * line stays a plain count in words: criterion 27 greps this screen for a "%" and for a
 * progress ring, and neither may appear.
 */

export function Learn() {
  const state = useAppStore();
  const read = learnReadCount(state);
  const total = learnTotal();
  return (
    <Screen id="learn">
      <ScreenTitle title={S.learn.title} sub={S.learn.sub} />

      {/* R15.6: once at the top of this screen, and not repeated per piece. */}
      <p className="mt-4 rounded-2xl bg-leaf-soft p-3.5 text-sm leading-snug ring-1 ring-leaf/15" data-testid="learn-not-advice">
        {S.learn.notAdvice}
      </p>

      {/*
        A plain count, in words, with a row of sixteen ticks beside it. The ticks are marked
        aria-hidden and carry no number of their own: the sentence is the accessible fact, and
        criterion 27 requires that this stay a count rather than becoming a percentage.
      */}
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="text-sm font-bold" data-testid="learn-progress" data-read={read} data-total={total}>
          {S.learn.progress(read, total)}
        </p>
        <div className="flex flex-1 gap-1" aria-hidden="true">
          {Array.from({ length: total }, (_, i) => (
            <span key={i} className={`h-1.5 flex-1 rounded-full ${i < read ? 'bg-leaf' : 'bg-line'}`} />
          ))}
        </div>
      </div>

      {LEARN_TRACKS.map((track) => {
        const items = learnItemsInTrack(track.key);
        const skin = trackSkin(track.key);
        const trackRead = items.filter((i) => learnIsRead(state, i.id)).length;
        return (
          <section key={track.key} className="mt-6" data-testid={`learn-track-${track.key}`}>
            <div className={`rounded-card p-3.5 ring-1 ring-line/60 ${skin.panel}`}>
              <div className="flex items-start gap-3">
                <span className="mt-0.5">
                  <TrackBadge skin={skin} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                    <h2 className="text-lg font-extrabold leading-tight">{track.title}</h2>
                    <span className="text-xs font-bold text-muted num">{S.learn.trackCount(trackRead, items.length)}</span>
                  </div>
                  <p className="mt-0.5 text-sm leading-snug text-muted">{track.blurb}</p>
                </div>
              </div>

              <ul className="stagger mt-3 space-y-2">
                {items.map((item, i) => {
                  const isRead = learnIsRead(state, item.id);
                  return (
                    <li key={item.id}>
                      <AppLink
                        to={`/learn/${item.id}`}
                        data-testid={`learn-item-${item.id}`}
                        data-read={isRead ? 'true' : 'false'}
                        className="lift flex min-h-[56px] items-center gap-3 rounded-2xl bg-card p-3 pr-3.5 ring-1 ring-line/70 elev-1"
                      >
                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-extrabold num ${skin.pill}`} aria-hidden="true">
                          {i + 1}
                        </span>
                        <span className="min-w-0 flex-1 font-bold leading-snug">{item.title}</span>
                        {isRead ? (
                          <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${skin.pill}`}>{S.learn.readBadge}</span>
                        ) : (
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="shrink-0 text-muted" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M9 5l7 7-7 7" />
                          </svg>
                        )}
                      </AppLink>
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>
        );
      })}
    </Screen>
  );
}
