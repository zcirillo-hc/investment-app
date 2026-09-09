// Plan v2 R4. Nudge candidacy, timing, the daily cap, mute and outcomes. Pure TypeScript.
import type { Habit, Nudge, NudgeStatus, Place } from './types';
import type { Cents } from './interfaces';
import { compareOrdinal } from './money';
import { NUDGE_LEAD_MINUTES } from '../config';

export interface NudgeSettings {
  nudgesEnabled: boolean;
  quietStartMinute: number;
  quietEndMinute: number;
  mutedPlaceIds: string[];
}

export interface NudgeCandidate {
  placeId: string;
  displayName: string;
  usualMinute: number;
  nudgeMinute: number;
  estimateCents: Cents;
}

/** Plan v2 R4.2: the nudge lands twenty minutes before the usual time. May be negative. */
export function nudgeMinuteFor(usualMinute: number): number {
  return usualMinute - NUDGE_LEAD_MINUTES;
}

/** Plan v2 R4.2: a nudge minute before midnight is not nudged that day. */
export function isNudgeMinuteOnSameDay(nudgeMinute: number): boolean {
  return nudgeMinute >= 0;
}

/**
 * Plan v2 R4.3: the nudge fires only inside quiet hours, 06:00 to 21:00 inclusive by default.
 * Outside that range there is no nudge, silently.
 */
export function isWithinQuietHours(nudgeMinute: number, quietStartMinute: number, quietEndMinute: number): boolean {
  return nudgeMinute >= quietStartMinute && nudgeMinute <= quietEndMinute;
}

/** Plan v2 R4.8: per place mute and global mute are independent. */
export function isPlaceMuted(mutedPlaceIds: string[], placeId: string): boolean {
  return mutedPlaceIds.includes(placeId);
}

export function setPlaceMuted(mutedPlaceIds: string[], placeId: string, muted: boolean): string[] {
  const without = mutedPlaceIds.filter((id) => id !== placeId);
  if (!muted) return without;
  return [...without, placeId].sort(compareOrdinal);
}

export function alreadyNudgedOn(nudges: Nudge[], dayIndex: number): boolean {
  return nudges.some((n) => n.dayIndex === dayIndex);
}

/**
 * Plan v2 R4.1: a place is a nudge candidate if it is a habit (R3.5), is nudge eligible
 * (R3.6, which is exactly "it has an estimate"), is not muted, global nudges are on, and it
 * has not already been nudged on this dayIndex. R4.5 is the "global nudges are on" clause:
 * habits are still detected and shown while nudges are off.
 */
export function nudgeCandidates(
  places: Place[],
  habits: Habit[],
  nudges: Nudge[],
  settings: NudgeSettings,
  dayIndex: number,
): NudgeCandidate[] {
  if (!settings.nudgesEnabled) return [];
  if (alreadyNudgedOn(nudges, dayIndex)) return [];
  const nameOf = new Map(places.map((p) => [p.id, p.displayName]));
  const out: NudgeCandidate[] = [];
  for (const h of habits) {
    if (!h.isHabit) continue;
    if (h.usualMinute === null) continue;
    if (h.estimateCents === null) continue;
    if (isPlaceMuted(settings.mutedPlaceIds, h.placeId)) continue;
    if (!nameOf.has(h.placeId)) continue;
    out.push({
      placeId: h.placeId,
      displayName: nameOf.get(h.placeId) ?? h.placeId,
      usualMinute: h.usualMinute,
      nudgeMinute: nudgeMinuteFor(h.usualMinute),
      estimateCents: h.estimateCents,
    });
  }
  return out.sort((a, b) => compareOrdinal(a.placeId, b.placeId));
}

export interface SelectableCandidate {
  placeId: string;
  usualMinute: number;
}

/**
 * Plan v2 R4.4: at most one nudge exists per dayIndex across all places. When several
 * candidates qualify, choose the smallest nudgeMinute; if two tie, choose the smaller place
 * id by ordinal (byte wise) string comparison. R4.2 and R4.3 filter first.
 */
export function selectNudge<T extends SelectableCandidate>(
  candidates: T[],
  quietStartMinute: number,
  quietEndMinute: number,
): { candidate: T; nudgeMinute: number } | null {
  let best: { candidate: T; nudgeMinute: number } | null = null;
  for (const c of candidates) {
    const nudgeMinute = nudgeMinuteFor(c.usualMinute);
    if (!isNudgeMinuteOnSameDay(nudgeMinute)) continue;
    if (!isWithinQuietHours(nudgeMinute, quietStartMinute, quietEndMinute)) continue;
    if (
      best === null ||
      nudgeMinute < best.nudgeMinute ||
      (nudgeMinute === best.nudgeMinute && compareOrdinal(c.placeId, best.candidate.placeId) < 0)
    ) {
      best = { candidate: c, nudgeMinute };
    }
  }
  return best;
}

/**
 * The demo tray's "Force a nudge now" and `?nudge=1` (plan 5.4): the same ranking, but
 * ignoring R4.2 and R4.3. R4.1 still applies, which is why this takes candidates rather than
 * the raw habit list.
 */
export function selectNudgeIgnoringTime<T extends SelectableCandidate>(candidates: T[]): { candidate: T; nudgeMinute: number } | null {
  let best: { candidate: T; nudgeMinute: number } | null = null;
  for (const c of candidates) {
    const nudgeMinute = Math.max(0, nudgeMinuteFor(c.usualMinute));
    if (
      best === null ||
      nudgeMinute < best.nudgeMinute ||
      (nudgeMinute === best.nudgeMinute && compareOrdinal(c.placeId, best.candidate.placeId) < 0)
    ) {
      best = { candidate: c, nudgeMinute };
    }
  }
  return best;
}

export function nudgeIdFor(dayIndex: number): string {
  return `nudge:${dayIndex}`;
}

export function makeNudge(candidate: NudgeCandidate, dayIndex: number, nudgeMinute: number): Nudge {
  return {
    id: nudgeIdFor(dayIndex),
    placeId: candidate.placeId,
    displayName: candidate.displayName,
    dayIndex,
    nudgeMinute,
    estimateCents: candidate.estimateCents,
    status: 'pending',
  };
}

/**
 * Plan v2 R4.6: a nudge that is still pending when the day advances becomes expired,
 * silently. No event is written, no counter moves, and no copy anywhere refers to it (R4.7).
 */
export function expirePendingNudges(nudges: Nudge[], newDayIndex: number): Nudge[] {
  let changed = false;
  const out = nudges.map((n) => {
    if (n.status === 'pending' && n.dayIndex < newDayIndex) {
      changed = true;
      return { ...n, status: 'expired' as const };
    }
    return n;
  });
  return changed ? out : nudges;
}

/** The one nudge the user can act on right now, if any. */
export function pendingNudge(nudges: Nudge[], dayIndex: number): Nudge | null {
  return nudges.find((n) => n.status === 'pending' && n.dayIndex === dayIndex) ?? null;
}

/** Plan v2 R11.3: deleting a place cancels a pending nudge for it, silently. */
export function cancelNudgesForPlace(nudges: Nudge[], placeId: string): Nudge[] {
  let changed = false;
  const out = nudges.map((n) => {
    if (n.placeId === placeId && n.status === 'pending') {
      changed = true;
      return { ...n, status: 'expired' as const };
    }
    return n;
  });
  return changed ? out : nudges;
}

export interface NudgeSchedulePayload {
  nudgeLocalDate: string;
  nudgeLocalMinute: number | null;
}

/**
 * Plan v2 R14.2. What the client publishes to the schedule route: one date and one integer
 * minute, and nothing else. No place id, no display name, no amount, no jar figure, no counter
 * and no event ever appears in this object (R11.6), which is why it is built here, in the pure
 * domain, rather than assembled ad hoc at the call site.
 *
 * A null minute clears the schedule. That covers three cases which are all the same signal to
 * the server: there is no pending nudge, the nudge is not pending any more (it was taken,
 * dismissed or expired), or R4.2 and R4.3 suppressed it for today.
 */
export function nudgeSchedulePayload(
  nudge: { nudgeMinute: number; status?: NudgeStatus } | null,
  date: string,
  quietStartMinute: number,
  quietEndMinute: number,
): NudgeSchedulePayload {
  if (nudge === null) return { nudgeLocalDate: date, nudgeLocalMinute: null };
  if (nudge.status !== undefined && nudge.status !== 'pending') return { nudgeLocalDate: date, nudgeLocalMinute: null };
  if (!isNudgeMinuteOnSameDay(nudge.nudgeMinute)) return { nudgeLocalDate: date, nudgeLocalMinute: null };
  if (!isWithinQuietHours(nudge.nudgeMinute, quietStartMinute, quietEndMinute)) {
    return { nudgeLocalDate: date, nudgeLocalMinute: null };
  }
  return { nudgeLocalDate: date, nudgeLocalMinute: nudge.nudgeMinute };
}
