// Plan v2 section 7.2: a thin loader over shared/content/lessons.json.
import raw from '../../shared/content/lessons.json';
import type { FearOption, LessonId } from '../domain/types';

export interface Lesson {
  id: LessonId;
  title: string;
  /** Terms are marked as [[key]] or [[key|display text]] and render through Term. */
  body: string;
  unlockHint: string;
}

export const LESSONS: Lesson[] = raw.lessons as Lesson[];

export const LESSON_BY_ID: Record<LessonId, Lesson> = Object.fromEntries(LESSONS.map((l) => [l.id, l])) as Record<LessonId, Lesson>;

// R12.2, unchanged from v1.
export const FEAR_LESSON: Record<FearOption, LessonId> = {
  rent: 'L6',
  pointless: 'L7',
  confused: 'L8',
  losing: 'L4',
};

export const FEAR_LESSON_POOL: LessonId[] = ['L6', 'L7', 'L8'];
