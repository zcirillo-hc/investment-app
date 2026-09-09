import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useAppStore } from '../state/store';
import { S } from '../content/strings';
import { LESSON_BY_ID } from '../content/lessons';
import { Screen } from '../components/Screen';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { RichText } from '../components/Term';
import { LessonVisual } from '../components/LessonVisual';
import { AppRedirect, useAppNavigate } from '../lib/hooks';
import { lessonUiState } from '../domain/selectors';
import type { LessonId } from '../domain/types';
import { LESSON_IDS } from '../domain/types';

/** Plan 6.11 and criterion 14: opening an unlocked lesson marks it read; Got it returns to the path. */
export function Lesson() {
  const { id } = useParams();
  const state = useAppStore();
  const markLessonRead = useAppStore((s) => s.markLessonRead);
  const navigate = useAppNavigate();
  const valid = LESSON_IDS.includes(id as LessonId);
  const lessonId = id as LessonId;
  const st = valid ? lessonUiState(state, lessonId) : 'locked';

  useEffect(() => {
    if (valid && st === 'new') markLessonRead(lessonId);
  }, [valid, st, lessonId, markLessonRead]);

  if (!valid) return <AppRedirect to="/lessons" />;
  const lesson = LESSON_BY_ID[lessonId];

  return (
    <Screen id="lesson">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted">{S.lessons.title}</div>
      <h1 className="mt-1 text-2xl font-extrabold" data-testid="lesson-title">
        {lesson.title}
      </h1>
      {st === 'locked' ? (
        <Card className="mt-4" data-testid="lesson-locked">
          <p className="text-muted">{S.lessons.notYet}</p>
          <p className="mt-1 text-sm"><RichText text={lesson.unlockHint} /></p>
        </Card>
      ) : (
        <Card className="mt-4">
          <LessonVisual id={lessonId} />
          <p className="text-lg leading-relaxed" data-testid="lesson-body">
            <RichText text={lesson.body} />
          </p>
        </Card>
      )}
      {/* Cycle 8, R15.6 and 9.8a: on every lesson page, not only at the top of the path. */}
      <p className="mt-4 rounded-2xl bg-leaf-soft p-3.5 text-sm leading-snug ring-1 ring-leaf/15" data-testid="lesson-not-advice">
        {S.lessons.notAdvice}
      </p>

      <div className="mt-6">
        <Button size="lg" full data-testid="lesson-got-it" onClick={() => navigate('/lessons')}>
          {st === 'locked' ? S.lessons.backToPath : S.common.gotIt}
        </Button>
      </div>
    </Screen>
  );
}
