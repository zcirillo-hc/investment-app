/**
 * Plan v2 section 6.4. The one IndexedDB record the service worker reads.
 *
 * It is never sent anywhere. It exists so the notification text can be written on the device
 * rather than on the server (6.9), which is the whole point of the design: the server learns a
 * push endpoint, a time zone and a minute, and never a place name or an amount (R11.6).
 *
 * The three constants below are the source of truth. `public/sw.js` carries a copy of each,
 * with a comment naming this file, because the worker is hand written plain JavaScript with no
 * bundler and cannot import them. `tests/unit/sw-constants.test.ts` asserts the copies match:
 * a silent divergence here produces the 9.2a fallback notification forever, with no error
 * anywhere to explain it.
 */
import { del, get, set } from 'idb-keyval';

export const PENDING_NUDGE_DB = 'keyval-store';
export const PENDING_NUDGE_STORE = 'keyval';
export const PENDING_NUDGE_KEY = 'spare-change-pending-nudge';

export interface PendingNudgeRecord {
  v: 2;
  /** YYYY-MM-DD, the local date the nudge is for. */
  date: string;
  /** 0..1439, the nudge minute (R4.2). */
  minute: number;
  /** Display name, for the notification text. Never leaves the device. */
  placeName: string;
  /** R5.1. Integer cents, never a float (R1.1). */
  estimateCents: number;
}

export function isPendingNudgeRecord(v: unknown): v is PendingNudgeRecord {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    r.v === 2 &&
    typeof r.date === 'string' &&
    typeof r.minute === 'number' &&
    Number.isInteger(r.minute) &&
    r.minute >= 0 &&
    r.minute <= 1439 &&
    typeof r.placeName === 'string' &&
    typeof r.estimateCents === 'number' &&
    Number.isInteger(r.estimateCents)
  );
}

/**
 * Writing and clearing both swallow their own failures. A browser with IndexedDB blocked
 * still runs the whole product (6.12); the only thing it loses is a personalised notification
 * body, which degrades to the 9.2a fallback rather than to an error.
 */
export async function writePendingNudge(record: PendingNudgeRecord): Promise<void> {
  try {
    await set(PENDING_NUDGE_KEY, record);
  } catch {
    /* IndexedDB unavailable: the worker will show the 9.2a fallback instead. */
  }
}

export async function clearPendingNudge(): Promise<void> {
  try {
    await del(PENDING_NUDGE_KEY);
  } catch {
    /* ignore */
  }
}

export async function readPendingNudge(): Promise<PendingNudgeRecord | null> {
  try {
    const v = await get(PENDING_NUDGE_KEY);
    return isPendingNudgeRecord(v) ? v : null;
  } catch {
    return null;
  }
}
