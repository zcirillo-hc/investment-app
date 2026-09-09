/**
 * Plan v2 6.6. Body shape checks, the IANA time zone check, the endpoint hash, and the small
 * HTTP helpers every route shares.
 *
 * Two rules from 6.6 are enforced here rather than left to each route:
 *
 *  - Unknown or malformed bodies return 400 with a FIXED message and are never logged with
 *    their contents.
 *  - No function in this file logs an endpoint, an auth secret or a time zone. Nothing here
 *    writes to the console at all.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';

/** The one message a malformed request ever gets back. It names no field and echoes nothing. */
export const BAD_REQUEST_MESSAGE = 'bad request';

export function sendJson(res: VercelResponse, status: number, body: unknown): void {
  // Set explicitly rather than trusting the framework: criterion 19 is an assertion about
  // this exact header, and the SPA rewrite used to hand back HTML with a 200 instead.
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.status(status).send(JSON.stringify(body));
}

export function badRequest(res: VercelResponse): void {
  sendJson(res, 400, { ok: false, error: BAD_REQUEST_MESSAGE });
}

/**
 * Rejects any method other than the one named, per 6.6. Returns false when it has already
 * answered the request.
 */
export function methodOnly(req: VercelRequest, res: VercelResponse, method: 'GET' | 'POST'): boolean {
  if (req.method === method) return true;
  res.setHeader('allow', method);
  sendJson(res, 405, { ok: false, error: 'method not allowed' });
  return false;
}

/**
 * The Vercel Node runtime parses a JSON body onto `req.body`. It does not when the
 * content-type is missing or wrong, and it does not in every test harness, so a string body
 * is parsed here too. Anything unparseable is `null`, which every caller turns into a 400.
 */
export function readJsonBody(req: VercelRequest): Record<string, unknown> | null {
  const raw: unknown = req.body;
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  } else if (raw instanceof Buffer) {
    try {
      value = JSON.parse(raw.toString('utf8'));
    } catch {
      return null;
    }
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** sha256(endpoint), lowercase hex, 64 characters. The primary key (6.10). */
export function hashEndpoint(endpoint: string): string {
  return createHash('sha256').update(endpoint, 'utf8').digest('hex');
}

/**
 * R14.3 and 6.8 step 1. A zone is valid when `Intl` will build a formatter with it. This is
 * also what stops a spoofed `tz` becoming a row that crashes the cron for every user in the
 * batch: an invalid name never reaches the column.
 *
 * `Intl` accepts a bare offset like `+05:30` in some runtimes, and accepts `UTC`. The offset
 * forms are rejected on purpose (an offset is wrong twice a year, R14.3); `UTC` is kept
 * because a browser that cannot resolve a zone is specified to send exactly that.
 */
export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string') return false;
  if (tz.length < 1 || tz.length > 64) return false;
  if (tz === 'UTC') return true;
  // Region/City, optionally Region/Sub/City. Rules out every offset spelling before Intl sees it.
  if (!/^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+){1,2}$/.test(tz)) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** YYYY-MM-DD, and a real calendar date rather than 2026-02-31. */
export function isLocalDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}

/** 0..1439, matching the column's own check constraint (6.7). */
export function isMinuteOfDay(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 1439;
}

/** A push endpoint is a URL from the browser's push service and it is a secret. */
export function isEndpoint(value: unknown): value is string {
  if (typeof value !== 'string' || value.length < 8 || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}

/** The two base64url subscription keys the browser generates. */
export function isSubscriptionKey(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max && /^[A-Za-z0-9_=-]+$/.test(value);
}

/**
 * 6.6: `schedule` and `unsubscribe` prove the caller is the subscriber by holding the
 * subscription's own `auth` secret, compared in constant time.
 *
 * Both sides are hashed first so the comparison is over two 32 byte buffers. `timingSafeEqual`
 * throws on a length mismatch, and a comparison that throws on unequal lengths has already
 * leaked the length.
 */
export function secretEquals(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a, 'utf8').digest();
  const hb = createHash('sha256').update(b, 'utf8').digest();
  return timingSafeEqual(ha, hb);
}

export interface SubscribeBody {
  endpoint: string;
  p256dh: string;
  auth: string;
  tz: string;
}

export function parseSubscribeBody(body: Record<string, unknown> | null): SubscribeBody | null {
  if (!body) return null;
  const sub = body.subscription;
  if (typeof sub !== 'object' || sub === null) return null;
  const { endpoint, keys } = sub as { endpoint?: unknown; keys?: unknown };
  if (typeof keys !== 'object' || keys === null) return null;
  const { p256dh, auth } = keys as { p256dh?: unknown; auth?: unknown };
  if (!isEndpoint(endpoint)) return null;
  if (!isSubscriptionKey(p256dh, 256)) return null;
  if (!isSubscriptionKey(auth, 64)) return null;
  if (!isValidTimeZone(body.tz)) return null;
  return { endpoint, p256dh, auth, tz: body.tz };
}

export interface ScheduleBody {
  endpoint: string;
  auth: string;
  tz: string;
  nudgeLocalDate: string | null;
  nudgeLocalMinute: number | null;
}

/**
 * R14.2. A null `nudgeLocalMinute` clears the schedule, and a cleared schedule is allowed to
 * carry a null date with it. A non null minute must have a date to go with it, because a
 * minute with no date cannot be evaluated against any local day.
 */
export function parseScheduleBody(body: Record<string, unknown> | null): ScheduleBody | null {
  if (!body) return null;
  const { endpoint, auth, tz, nudgeLocalDate, nudgeLocalMinute } = body;
  if (!isEndpoint(endpoint)) return null;
  if (!isSubscriptionKey(auth, 64)) return null;
  if (!isValidTimeZone(tz)) return null;
  if (nudgeLocalMinute === null || nudgeLocalMinute === undefined) {
    if (nudgeLocalDate !== null && nudgeLocalDate !== undefined && !isLocalDate(nudgeLocalDate)) return null;
    return {
      endpoint,
      auth,
      tz,
      nudgeLocalDate: isLocalDate(nudgeLocalDate) ? nudgeLocalDate : null,
      nudgeLocalMinute: null,
    };
  }
  if (!isMinuteOfDay(nudgeLocalMinute)) return null;
  if (!isLocalDate(nudgeLocalDate)) return null;
  return { endpoint, auth, tz, nudgeLocalDate, nudgeLocalMinute };
}

export interface UnsubscribeBody {
  endpoint: string;
  auth: string;
}

export function parseUnsubscribeBody(body: Record<string, unknown> | null): UnsubscribeBody | null {
  if (!body) return null;
  const { endpoint, auth } = body;
  if (!isEndpoint(endpoint)) return null;
  if (!isSubscriptionKey(auth, 64)) return null;
  return { endpoint, auth };
}
