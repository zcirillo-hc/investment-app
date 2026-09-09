// Plan v2 R4 and R14.2. Candidacy, timing, the daily cap, mute, outcomes, the schedule payload.
import { describe, expect, it } from 'vitest';
import type { Habit, Nudge, Place } from '../../src/domain/types';
import {
  alreadyNudgedOn,
  cancelNudgesForPlace,
  expirePendingNudges,
  isNudgeMinuteOnSameDay,
  isPlaceMuted,
  isWithinQuietHours,
  makeNudge,
  nudgeCandidates,
  nudgeMinuteFor,
  nudgeSchedulePayload,
  pendingNudge,
  selectNudge,
  selectNudgeIgnoringTime,
  setPlaceMuted,
  type NudgeSettings,
} from '../../src/domain/nudges';

const SETTINGS: NudgeSettings = { nudgesEnabled: true, quietStartMinute: 360, quietEndMinute: 1260, mutedPlaceIds: [] };

function place(id: string): Place {
  return { id, displayName: id.toUpperCase(), firstSeenDay: 0, lastSeenDay: 20, coarseLabel: null };
}

function habit(placeId: string, over: Partial<Habit> = {}): Habit {
  return { placeId, isHabit: true, visitCount: 3, usualMinute: 500, spreadMinutes: 5, estimateCents: 435, ...over };
}

function nudge(over: Partial<Nudge> = {}): Nudge {
  return { id: 'nudge:1', placeId: 'a', displayName: 'A', dayIndex: 1, nudgeMinute: 480, estimateCents: 435, status: 'pending', ...over };
}

describe('R4.2 nudge time', () => {
  it('is twenty minutes before the usual time', () => {
    expect(nudgeMinuteFor(500)).toBe(480);
  });

  it('allows exactly midnight and refuses the minute before it', () => {
    expect(isNudgeMinuteOnSameDay(nudgeMinuteFor(20))).toBe(true);
    expect(isNudgeMinuteOnSameDay(nudgeMinuteFor(19))).toBe(false);
  });
});

describe('R4.3 quiet hours', () => {
  it('is inclusive at both ends', () => {
    expect(isWithinQuietHours(360, 360, 1260)).toBe(true);
    expect(isWithinQuietHours(1260, 360, 1260)).toBe(true);
  });

  it('excludes the minute either side', () => {
    expect(isWithinQuietHours(359, 360, 1260)).toBe(false);
    expect(isWithinQuietHours(1261, 360, 1260)).toBe(false);
  });
});

describe('R4.1 candidacy', () => {
  const places = [place('a'), place('b')];
  const habits = [habit('a'), habit('b')];

  it('R4.5: produces nothing while nudges are off, though habits are still detected', () => {
    expect(nudgeCandidates(places, habits, [], { ...SETTINGS, nudgesEnabled: false }, 1)).toEqual([]);
  });

  it('R4.4: produces nothing once the day already has a nudge', () => {
    expect(nudgeCandidates(places, habits, [nudge({ dayIndex: 1 })], SETTINGS, 1)).toEqual([]);
  });

  it('counts an already expired nudge as having used the day, so a day can never get a second', () => {
    expect(nudgeCandidates(places, habits, [nudge({ dayIndex: 1, status: 'expired' })], SETTINGS, 1)).toEqual([]);
  });

  it('skips a place that is not a habit', () => {
    const out = nudgeCandidates(places, [habit('a'), habit('b', { isHabit: false })], [], SETTINGS, 1);
    expect(out.map((c) => c.placeId)).toEqual(['a']);
  });

  it('R3.6: skips a habit with no estimate', () => {
    const out = nudgeCandidates(places, [habit('a'), habit('b', { estimateCents: null })], [], SETTINGS, 1);
    expect(out.map((c) => c.placeId)).toEqual(['a']);
  });

  it('R4.8: skips a muted place while the others still qualify', () => {
    const out = nudgeCandidates(places, habits, [], { ...SETTINGS, mutedPlaceIds: ['a'] }, 1);
    expect(out.map((c) => c.placeId)).toEqual(['b']);
  });

  it('skips a habit whose place record is gone', () => {
    const out = nudgeCandidates([place('a')], habits, [], SETTINGS, 1);
    expect(out.map((c) => c.placeId)).toEqual(['a']);
  });

  it('carries the display name and the estimate onto the candidate', () => {
    const [c] = nudgeCandidates(places, habits, [], SETTINGS, 1);
    expect(c).toMatchObject({ placeId: 'a', displayName: 'A', usualMinute: 500, nudgeMinute: 480, estimateCents: 435 });
  });
});

describe('R4.4 the daily cap and its tie break', () => {
  it('picks the earliest nudge minute', () => {
    const chosen = selectNudge([{ placeId: 'late', usualMinute: 540 }, { placeId: 'early', usualMinute: 500 }], 360, 1260);
    expect(chosen?.candidate.placeId).toBe('early');
  });

  it('breaks a tie by the smaller place id, byte wise', () => {
    const chosen = selectNudge([{ placeId: 'corner espresso', usualMinute: 500 }, { placeId: 'campus coffee', usualMinute: 500 }], 360, 1260);
    expect(chosen?.candidate.placeId).toBe('campus coffee');
  });

  it('is order independent, so a refactor cannot change the result by changing iteration order', () => {
    const a = selectNudge([{ placeId: 'corner espresso', usualMinute: 500 }, { placeId: 'campus coffee', usualMinute: 500 }], 360, 1260);
    const b = selectNudge([{ placeId: 'campus coffee', usualMinute: 500 }, { placeId: 'corner espresso', usualMinute: 500 }], 360, 1260);
    expect(a?.candidate.placeId).toBe(b?.candidate.placeId);
  });

  it('filters R4.2 and R4.3 before ranking, and can select nothing at all', () => {
    expect(selectNudge([{ placeId: 'dawn', usualMinute: 19 }], 360, 1260)).toBeNull();
    expect(selectNudge([{ placeId: 'night', usualMinute: 1300 }], 360, 1260)).toBeNull();
    expect(selectNudge([], 360, 1260)).toBeNull();
  });

  it('the demo force ignores R4.2 and R4.3 but keeps the ranking', () => {
    const chosen = selectNudgeIgnoringTime([{ placeId: 'night', usualMinute: 1300 }]);
    expect(chosen?.candidate.placeId).toBe('night');
    expect(chosen?.nudgeMinute).toBe(1280);
  });

  it('the demo force clamps a negative minute to 0 rather than emitting one', () => {
    expect(selectNudgeIgnoringTime([{ placeId: 'dawn', usualMinute: 10 }])?.nudgeMinute).toBe(0);
  });
});

describe('R4.6 outcomes', () => {
  it('expires a pending nudge from a previous day, silently', () => {
    const out = expirePendingNudges([nudge({ dayIndex: 1 })], 2);
    expect(out[0].status).toBe('expired');
  });

  it('leaves today alone', () => {
    const nudges = [nudge({ dayIndex: 2 })];
    expect(expirePendingNudges(nudges, 2)).toBe(nudges);
  });

  it('never revives a resolved nudge', () => {
    const out = expirePendingNudges([nudge({ dayIndex: 1, status: 'skipped' })], 2);
    expect(out[0].status).toBe('skipped');
  });

  it('finds only today pending nudge', () => {
    expect(pendingNudge([nudge({ dayIndex: 1 })], 1)?.id).toBe('nudge:1');
    expect(pendingNudge([nudge({ dayIndex: 1 })], 2)).toBeNull();
    expect(pendingNudge([nudge({ dayIndex: 1, status: 'skipped' })], 1)).toBeNull();
  });

  it('R11.3: deleting a place cancels its pending nudge and leaves the others', () => {
    const out = cancelNudgesForPlace([nudge({ placeId: 'a' }), nudge({ id: 'nudge:2', placeId: 'b' })], 'a');
    expect(out.map((n) => n.status)).toEqual(['expired', 'pending']);
  });

  it('reports whether a day already has a nudge', () => {
    expect(alreadyNudgedOn([nudge({ dayIndex: 3 })], 3)).toBe(true);
    expect(alreadyNudgedOn([nudge({ dayIndex: 3 })], 4)).toBe(false);
  });
});

describe('R4.8 mute', () => {
  it('adds and removes, and keeps the list sorted so it is stable', () => {
    expect(setPlaceMuted([], 'b', true)).toEqual(['b']);
    expect(setPlaceMuted(['b'], 'a', true)).toEqual(['a', 'b']);
    expect(setPlaceMuted(['a', 'b'], 'a', false)).toEqual(['b']);
  });

  it('is idempotent, so muting twice does not duplicate an entry', () => {
    expect(setPlaceMuted(['a'], 'a', true)).toEqual(['a']);
  });

  it('reports mute state', () => {
    expect(isPlaceMuted(['a'], 'a')).toBe(true);
    expect(isPlaceMuted(['a'], 'b')).toBe(false);
  });
});

describe('makeNudge', () => {
  it('gives one id per day, so two selections on the same day cannot both exist', () => {
    const c = { placeId: 'a', displayName: 'A', usualMinute: 500, nudgeMinute: 480, estimateCents: 435 };
    expect(makeNudge(c, 7, 480).id).toBe('nudge:7');
  });

  it('freezes the estimate that was shown (R5.3)', () => {
    const c = { placeId: 'a', displayName: 'A', usualMinute: 500, nudgeMinute: 480, estimateCents: 441 };
    expect(makeNudge(c, 7, 480)).toMatchObject({ estimateCents: 441, status: 'pending', displayName: 'A' });
  });
});

describe('R14.2 the schedule payload', () => {
  it('carries one date and one minute, and nothing else', () => {
    const out = nudgeSchedulePayload({ nudgeMinute: 460, status: 'pending' }, '2026-06-29', 360, 1260);
    expect(Object.keys(out).sort()).toEqual(['nudgeLocalDate', 'nudgeLocalMinute']);
  });

  it('R11.6: never carries a place id, a display name, an amount or a counter', () => {
    const out = nudgeSchedulePayload({ nudgeMinute: 460, status: 'pending' }, '2026-06-29', 360, 1260) as unknown as Record<string, unknown>;
    for (const banned of ['placeId', 'displayName', 'estimateCents', 'jarCents', 'name']) {
      expect(out[banned]).toBeUndefined();
    }
  });

  it('clears the schedule with a null minute in every suppressed case', () => {
    const date = '2026-06-29';
    expect(nudgeSchedulePayload(null, date, 360, 1260).nudgeLocalMinute).toBeNull();
    expect(nudgeSchedulePayload({ nudgeMinute: -1, status: 'pending' }, date, 360, 1260).nudgeLocalMinute).toBeNull();
    expect(nudgeSchedulePayload({ nudgeMinute: 1300, status: 'pending' }, date, 360, 1260).nudgeLocalMinute).toBeNull();
    expect(nudgeSchedulePayload({ nudgeMinute: 460, status: 'skipped' }, date, 360, 1260).nudgeLocalMinute).toBeNull();
    expect(nudgeSchedulePayload({ nudgeMinute: 460, status: 'expired' }, date, 360, 1260).nudgeLocalMinute).toBeNull();
  });

  it('always publishes the date, even when it is clearing the minute', () => {
    expect(nudgeSchedulePayload(null, '2026-07-01', 360, 1260).nudgeLocalDate).toBe('2026-07-01');
  });
});
