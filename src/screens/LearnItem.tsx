import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useAppStore } from '../state/store';
import { S } from '../content/strings';
import { LEARN_ITEM_BY_ID, LEARN_TRACKS, learnItemsInTrack } from '../content/learn';
import { Screen } from '../components/Screen';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { RichText } from '../components/Term';
import { TrackBadge, trackSkin } from '../components/LearnTrackMark';
import { AppRedirect, useAppNavigate } from '../lib/hooks';

/**
 * Plan v2 section 8.9. The reader for one Learn piece.
 *
 * It reuses `Lesson.tsx`'s reader body verbatim in shape: the same `Card`, the same
 * `RichText` tooltip handling, the same "Got it" control. What it deliberately does not reuse
 * is the locked branch, because R12.5 means there is no such state here: an unknown id
 * redirects, and every known id renders.
 *
 * Visual polish pass, 2026-09-09: the page now says which track it belongs to and where it
 * sits in that track, and the body is set at a reading size on a measure that stops at about
 * sixty characters. R15.6 still holds: the standing not advice line appears on the library
 * header and not on any piece, and criterion 27 asserts that absence.
 */
export function LearnItem() {
  const { id } = useParams();
  const markLearnRead = useAppStore((s) => s.markLearnRead);
  const navigate = useAppNavigate();
  const item = id ? LEARN_ITEM_BY_ID[id] : undefined;

  useEffect(() => {
    if (item) markLearnRead(item.id);
  }, [item, markLearnRead]);

  if (!item) return <AppRedirect to="/learn" />;

  const skin = trackSkin(item.track);
  const track = LEARN_TRACKS.find((t) => t.key === item.track);
  const siblings = learnItemsInTrack(item.track);
  const index = siblings.findIndex((s) => s.id === item.id) + 1;

  return (
    <Screen id="learn-item">
      <div className="flex items-center gap-2.5 pt-1">
        <TrackBadge skin={skin} size={32} />
        <div className="min-w-0">
          <div className="truncate text-sm font-bold">{track ? track.title : S.learn.title}</div>
          <div className="text-xs text-muted num">{S.learn.trackPosition(index, siblings.length)}</div>
        </div>
      </div>

      <h1 className="mt-3 text-[26px] font-extrabold leading-tight tracking-tight sm:text-3xl" data-testid="learn-item-title">
        {item.title}
      </h1>

      <Card className="mt-4" elevation="high">
        <span className={`mb-4 block h-1 w-12 rounded-full ${skin.badge}`} aria-hidden="true" />
        <p className="max-w-[62ch] text-[17px] leading-[1.75] sm:text-lg" data-testid="learn-item-body">
          <RichText text={item.body} />
        </p>
      </Card>

      {/*
        * Cycle 8, R15.6 and 9.8a. It used to be deliberate that this line did NOT appear here:
        * the library index carried it once and repeating it per piece read as nervousness.
        * The amendment reverses that, and the reason is specific rather than legalistic. The
        * library is now allowed to state general principles, and a reader who arrives at one
        * piece from a deep link or a surfacing card never sees the index. That reader would be
        * the only one who never sees the sentence that makes this education rather than
        * advice. One short line, the same one, in the same words.
        */}
      <p className="mt-4 rounded-2xl bg-leaf-soft p-3.5 text-sm leading-snug ring-1 ring-leaf/15" data-testid="learn-item-not-advice">
        {S.learn.notAdvice}
      </p>

      <div className="mt-6">
        <Button size="lg" full data-testid="learn-item-got-it" onClick={() => navigate('/learn')}>
          {S.common.gotIt}
        </Button>
      </div>
    </Screen>
  );
}
