/**
 * Shared fixtures for the integration suite (plan v2 11.3).
 *
 * The route handlers are plain `(req, res)` functions, so they are called directly here with
 * a minimal request and a recording response. That exercises the real parsing, the real auth
 * check and the real SQL; what it does not exercise is Vercel's own routing, which is what
 * criterion 19 covers against `vercel dev` instead.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { table } from '../../api/_lib/db';
import type { Db } from '../../api/_lib/due';
import { hashEndpoint } from '../../api/_lib/validate';

export function db(): Db {
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  return neon(url);
}

export const PUSH_SUBS = (): string => table('push_subs');

export async function truncate(): Promise<void> {
  await db().query(`delete from ${PUSH_SUBS()}`);
}

export interface Recorded {
  status: number;
  headers: Record<string, string>;
  body: string;
  json: <T = Record<string, unknown>>() => T;
}

export function mockRes(): { res: VercelResponse; recorded: Recorded } {
  const recorded: Recorded = {
    status: 200,
    headers: {},
    body: '',
    json: <T,>() => JSON.parse(recorded.body) as T,
  };
  const res = {
    setHeader(key: string, value: unknown) {
      recorded.headers[key.toLowerCase()] = String(value);
      return res;
    },
    status(code: number) {
      recorded.status = code;
      return res;
    },
    send(body: unknown) {
      recorded.body = typeof body === 'string' ? body : JSON.stringify(body);
      return res;
    },
    json(body: unknown) {
      recorded.body = JSON.stringify(body);
      return res;
    },
  };
  return { res: res as unknown as VercelResponse, recorded };
}

export function mockReq(init: {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}): VercelRequest {
  return {
    method: init.method ?? 'GET',
    body: init.body,
    headers: init.headers ?? {},
    query: {},
    cookies: {},
  } as unknown as VercelRequest;
}

let counter = 0;

export interface Sub {
  endpoint: string;
  endpointHash: string;
  p256dh: string;
  auth: string;
}

/** A subscription that looks like a real one: an https endpoint and two base64url keys. */
export function makeSub(label = ''): Sub {
  counter += 1;
  const id = `${label || 'sub'}-${counter}-${Math.random().toString(36).slice(2, 10)}`;
  const endpoint = `https://fcm.googleapis.com/fcm/send/${id}`;
  return {
    endpoint,
    endpointHash: hashEndpoint(endpoint),
    p256dh: `BP${'x'.repeat(20)}${counter}`,
    auth: `authsecret${counter}${'y'.repeat(6)}`,
  };
}

export interface RowInit extends Sub {
  tz: string;
  nudgeLocalDate?: string | null;
  nudgeLocalMinute?: number | null;
  lastSentLocalDate?: string | null;
  enabled?: boolean;
  failCount?: number;
  /** Postgres interval text, e.g. `91 days`, subtracted from the real `now()`. */
  updatedAgo?: string;
  /** An absolute `updated_at`, for cases evaluated at a fixed `asOf` rather than at now(). */
  updatedAt?: string;
}

export async function insertRow(init: RowInit): Promise<void> {
  await db().query(
    `insert into ${PUSH_SUBS()}
       (endpoint_hash, endpoint, p256dh, auth, tz, nudge_local_date, nudge_local_minute,
        last_sent_local_date, enabled, fail_count, updated_at)
     values ($1, $2, $3, $4, $5, $6::date, $7, $8::date, $9, $10,
             coalesce($12::timestamptz, now() - $11::interval))`,
    [
      init.endpointHash,
      init.endpoint,
      init.p256dh,
      init.auth,
      init.tz,
      init.nudgeLocalDate ?? null,
      init.nudgeLocalMinute ?? null,
      init.lastSentLocalDate ?? null,
      init.enabled ?? true,
      init.failCount ?? 0,
      init.updatedAgo ?? '0 seconds',
      init.updatedAt ?? null,
    ],
  );
}

export interface StoredRow {
  endpoint_hash: string;
  tz: string;
  nudge_local_date: string | null;
  nudge_local_minute: number | null;
  last_sent_local_date: string | null;
  enabled: boolean;
  fail_count: number;
}

export async function readRow(endpointHash: string): Promise<StoredRow | null> {
  const rows = (await db().query(
    `select endpoint_hash, tz,
            to_char(nudge_local_date, 'YYYY-MM-DD')     as nudge_local_date,
            nudge_local_minute,
            to_char(last_sent_local_date, 'YYYY-MM-DD') as last_sent_local_date,
            enabled, fail_count
       from ${PUSH_SUBS()} where endpoint_hash = $1`,
    [endpointHash],
  )) as unknown as StoredRow[];
  return rows[0] ?? null;
}

export async function countRows(): Promise<number> {
  const rows = (await db().query(`select count(*)::int as c from ${PUSH_SUBS()}`)) as unknown as Array<{ c: number }>;
  return rows[0].c;
}

/** The local date and minute of day a given zone is at, at a given instant. */
export function localParts(tz: string, at: Date): { date: string; minute: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    minute: Number(get('hour')) * 60 + Number(get('minute')),
  };
}
