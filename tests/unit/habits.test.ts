// Plan v2 R3. Habit detection, at its exact thresholds.
import { describe, expect, it } from 'vitest';
import type { PlaceVisit } from '../../src/domain/interfaces';
import type { Habit, Place } from '../../src/domain/types';
import { habitFor, habitStatusOf, isHabitFrom, recomputeHabits, spreadMinutesOf, usualMinuteOf } from '../../src/domain/habits';

function place(id: string): Place {
  return { id, displayName: id, firstSeenDay: 0, lastSeenDay: 20, coarseLabel: null };
}

function visitsAt(placeId: string, days: number[], minutes: number[], amountCents: number | null = 435): PlaceVisit[] {
  return days.map((d, i) => ({
    id: `${d}-${i}`,
    placeId,
    displayName: placeId,
    dayIndex: d,
    date: '2026-06-15',
    minuteOfDay: minutes[i],
    amountCents,
  }));
}

describe('R3.3 the usual minute is the lower median', () => {
  it('takes index floor((n - 1) / 2) of the sorted minutes', () => {
    expect(usualMinuteOf([480, 495, 510, 505])).toBe(495);
  });

  it('is the middle element for an odd count', () => {
    expect(usualMinuteOf([520, 480, 500])).toBe(500);
  });

  it('takes the lower of the two middles for an even count, never their average', () => {
    // An averaged median of [480, 500] would be 490, which is not a minute anyone visited.
    expect(usualMinuteOf([480, 500])).toBe(480);
  });

  it('is null for no visits', () => {
    expect(usualMinuteOf([])).toBeNull();
  });

  it('does not mutate its input', () => {
    const minutes = [520, 480, 500];
    usualMinuteOf(minutes);
    expect(minutes).toEqual([520, 480, 500]);
  });
});

describe('R3.4 the spread is the lower median absolute deviation', () => {
  it('is 0 when every visit is at the same minute', () => {
    expect(spreadMinutesOf([500, 500, 500], 500)).toBe(0);
  });

  it('is the lower median of the deviations', () => {
    expect(spreadMinutesOf([480, 500, 520], 500)).toBe(20);
  });

  it('accepts exactly 45 and rejects 46', () => {
    expect(spreadMinutesOf([455, 500, 545], 500)).toBe(45);
    expect(spreadMinutesOf([454, 500, 546], 500)).toBe(46);
    expect(isHabitFrom([455, 500, 545])).toBe(true);
    expect(isHabitFrom([454, 500, 546])).toBe(false);
  });

  it('is null for no visits', () => {
    expect(spreadMinutesOf([], 500)).toBeNull();
  });
});

describe('R3.2 the visit threshold', () => {
  it('rejects exactly 2 and accepts exactly 3', () => {
    expect(isHabitFrom([500, 500])).toBe(false);
    expect(isHabitFrom([500, 500, 500])).toBe(true);
  });
});

describe('R3.5 habit status is recomputed from the window every tick', () => {
  it('counts only visits inside the 14 day window', () => {
    const visits = visitsAt('p', [0, 1, 2, 20], [500, 500, 500, 500]);
    const h = habitFor(place('p'), visits, 20);
    // Days 0, 1 and 2 are outside the window ending on day 20.
    expect(h.visitCount).toBe(1);
    expect(h.isHabit).toBe(false);
  });

  it('drops habit status the day the window falls below the threshold, with no hysteresis', () => {
    const visits = visitsAt('p', [10, 11, 12], [500, 500, 500]);
    expect(habitFor(place('p'), visits, 12).isHabit).toBe(true);
    // Fourteen days later the same visits are all outside the window.
    expect(habitFor(place('p'), visits, 26).isHabit).toBe(false);
  });

  it('reports the usual minute and the spread alongside the flag', () => {
    const h = habitFor(place('p'), visitsAt('p', [10, 11, 12], [480, 500, 520]), 12);
    expect(h).toMatchObject({ placeId: 'p', isHabit: true, visitCount: 3, usualMinute: 500, spreadMinutes: 20 });
  });

  it('carries the estimate, which uses its own 60 day window and not the habit window', () => {
    // The habit window ending on day 50 is days 37 to 50, so the priced visit on day 20 is
    // outside it, and the 60 day estimate window reaches back to day -10, so it is inside that.
    const visits = [...visitsAt('p', [48, 49, 50], [500, 500, 500], null), ...visitsAt('p', [20], [500], 500)];
    const h = habitFor(place('p'), visits, 50);
    expect(h.visitCount).toBe(3);
    expect(h.estimateCents).toBe(500);
  });

  it('R3.6: a habit with no priced visit has no estimate, which is what makes it nudge ineligible', () => {
    const h = habitFor(place('p'), visitsAt('p', [10, 11, 12], [500, 500, 500], null), 12);
    expect(h.isHabit).toBe(true);
    expect(h.estimateCents).toBeNull();
  });
});

describe('recomputeHabits', () => {
  it('R1.4: returns one habit per place, in place id order', () => {
    const places = [place('zed'), place('alpha')];
    const visits = [...visitsAt('zed', [12], [500]), ...visitsAt('alpha', [12], [500])];
    expect(recomputeHabits(places, visits, 12).map((h) => h.placeId)).toEqual(['alpha', 'zed']);
  });

  it('returns an entry even for a place with no visits left in the window', () => {
    const out = recomputeHabits([place('p')], [], 12);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ isHabit: false, visitCount: 0, usualMinute: null, spreadMinutes: null });
  });
});

describe('R3.2 and R3.4 in words, for the Places screen', () => {
  const h = (over: Partial<Habit>): Habit => ({
    placeId: 'p',
    isHabit: false,
    visitCount: 0,
    usualMinute: null,
    spreadMinutes: null,
    estimateCents: null,
    ...over,
  });

  it('says "not enough" below the visit threshold', () => {
    expect(habitStatusOf(h({ visitCount: 2 }))).toBe('notEnough');
    expect(habitStatusOf(null)).toBe('notEnough');
  });

  it('says "irregular" for a place visited often at scattered times', () => {
    expect(habitStatusOf(h({ visitCount: 5, isHabit: false }))).toBe('irregular');
  });

  it('says "habit" when both thresholds are met', () => {
    expect(habitStatusOf(h({ visitCount: 3, isHabit: true }))).toBe('habit');
  });
});
