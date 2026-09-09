/**
 * Plan v2 6.8 and R14.4, R14.5, R14.8, R14.9. The due query, the stale sweep, the 90 day
 * delete, and the send loop with an INJECTABLE SENDER so the whole thing is testable without
 * generating a real push (11.3).
 *
 * The SQL below is the SQL that ships. `tests/db/*` runs these same functions against a real
 * Neon schema rather than re-implementing the query in TypeScript, which is the second
 * implementation section 7 spent this cycle deleting.
 *
 * ONE deliberate addition to the plan's snippets: every statement reads its clock from
 * `coalesce($1::timestamptz, now())` rather than from `now()` alone. With `asOf` left null,
 * which is what the cron route always passes, this is exactly `now()`. It exists because
 * 11.3 requires daylight saving cases across the March and November transitions, and there
 * is no way to assert those against a clock the test cannot move. `asOf` is never reachable
 * from an HTTP request: `api/cron/send-nudges.ts` does not read it from the query string,
 * a header or a body.
 */
import type { NeonQueryFunction } from '@neondatabase/serverless';
import { table } from './db';
import { nudgePayload, type Sender } from './push';

export type Db = NeonQueryFunction<false, false>;

/** R14.8: the fifth consecutive failure of any non 404, 410 or 429 kind deletes the row. */
export const MAX_FAIL_COUNT = 5;

/** R14.5. A nudge more than this many minutes past its minute is never sent. */
export const GRACE_MINUTES = 60;

/** 6.8. One run's batch ceiling. */
export const DUE_LIMIT = 500;

/** R14.9. A row untouched for this long is deleted by the scheduler. */
export const RETENTION_DAYS = 90;

export interface DueRow {
  endpoint_hash: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  /** The row's own local date, as text, because it is what goes in the payload (R14.6). */
  local_date: string;
}

/** `now()` in production; a fixed instant in a test. Postgres does the zone arithmetic. */
const NOW = 'coalesce($1::timestamptz, now())';

/**
 * R14.4. A row is due when, evaluated in its OWN time zone at the instant this run fires:
 * the nudge date is today, the minute is set, it has not already been sent today, and the
 * minute is not more than 60 minutes in the past.
 *
 * There is deliberately NO upper bound on `nudge_local_minute`. Under one run a day, dropping
 * a row because its target time has not arrived yet would mean it never gets sent at all,
 * which is worse than sending it early (6.8).
 */
export async function selectDue(sql: Db, asOf: string | null = null): Promise<DueRow[]> {
  const rows = await sql.query(
    `select endpoint_hash, endpoint, p256dh, auth,
            to_char((${NOW} at time zone tz)::date, 'YYYY-MM-DD') as local_date
       from ${table('push_subs')}
      where enabled
        and nudge_local_minute is not null
        and nudge_local_date = (${NOW} at time zone tz)::date
        and last_sent_local_date is distinct from (${NOW} at time zone tz)::date
        and nudge_local_minute >  (extract(hour   from (${NOW} at time zone tz)) * 60
                                 + extract(minute from (${NOW} at time zone tz))) - $2
      order by endpoint_hash
      limit ${DUE_LIMIT}`,
    [asOf, GRACE_MINUTES],
  );
  return rows as unknown as DueRow[];
}

/** 6.8. Clears the minute and takes the per local day lock, so a second call cannot resend. */
export async function markSent(sql: Db, endpointHash: string, localDate: string): Promise<void> {
  await sql.query(
    `update ${table('push_subs')}
        set last_sent_local_date = $2::date, nudge_local_minute = null, fail_count = 0, updated_at = now()
      where endpoint_hash = $1`,
    [endpointHash, localDate],
  );
}

/** R14.8. 404 and 410 both mean the subscription is gone, so the row goes immediately. */
export async function deleteRow(sql: Db, endpointHash: string): Promise<number> {
  const rows = await sql.query(`delete from ${table('push_subs')} where endpoint_hash = $1 returning endpoint_hash`, [
    endpointHash,
  ]);
  return (rows as unknown as unknown[]).length;
}

export interface FailureResult {
  failCount: number;
  deleted: boolean;
}

/**
 * R14.8. Any failure that is not 404, 410 or 429 increments `fail_count`; at 5 the row is
 * deleted. Two round trips on purpose: a CTE that updates and deletes the same row in one
 * statement is exactly the case Postgres documents as having limited visibility between
 * sub-statements, and this is not the place to be clever.
 */
export async function recordFailure(sql: Db, endpointHash: string): Promise<FailureResult> {
  const rows = (await sql.query(
    `update ${table('push_subs')}
        set fail_count = fail_count + 1, updated_at = now()
      where endpoint_hash = $1
      returning fail_count`,
    [endpointHash],
  )) as unknown as Array<{ fail_count: number }>;
  if (rows.length === 0) return { failCount: 0, deleted: false };
  const failCount = Number(rows[0].fail_count);
  if (failCount >= MAX_FAIL_COUNT) {
    await deleteRow(sql, endpointHash);
    return { failCount, deleted: true };
  }
  return { failCount, deleted: false };
}

/**
 * 6.8. What makes a dropped nudge stay dropped rather than firing tomorrow morning at the
 * wrong moment: any minute still set for a local date already in the past is cleared.
 */
export async function staleSweep(sql: Db, asOf: string | null = null): Promise<number> {
  const rows = await sql.query(
    `update ${table('push_subs')} set nudge_local_minute = null, updated_at = now()
      where nudge_local_minute is not null
        and nudge_local_date < (${NOW} at time zone tz)::date
      returning endpoint_hash`,
    [asOf],
  );
  return (rows as unknown as unknown[]).length;
}

/** R14.9. Covers a browser that vanished without unsubscribing. */
export async function deleteAncient(sql: Db, asOf: string | null = null): Promise<number> {
  const rows = await sql.query(
    `delete from ${table('push_subs')}
      where updated_at < ${NOW} - ($2 || ' days')::interval
      returning endpoint_hash`,
    [asOf, String(RETENTION_DAYS)],
  );
  return (rows as unknown as unknown[]).length;
}

/** The four numbers `/api/cron/send-nudges` answers with (6.6). */
export interface SendReport {
  due: number;
  sent: number;
  deleted: number;
  failed: number;
}

/** Everything a test wants to know, which is the report plus the two housekeeping counts. */
export interface FullSendReport extends SendReport {
  swept: number;
  expired: number;
}

export interface RunSendOptions {
  sql: Db;
  sender: Sender;
  /** Null in production. A fixed instant in a test (see the file header). */
  asOf?: string | null;
}

/**
 * The whole run. Sends first, because that is the time critical work and a housekeeping
 * failure must not cost anyone their nudge, then sweeps, then prunes.
 *
 * A sender that throws is treated as a generic failure rather than being allowed to abort
 * the batch: one unreachable push service must not cost every other subscriber their nudge.
 */
export async function runSend(options: RunSendOptions): Promise<FullSendReport> {
  const { sql, sender } = options;
  const asOf = options.asOf ?? null;
  const rows = await selectDue(sql, asOf);

  let sent = 0;
  let deleted = 0;
  let failed = 0;

  for (const row of rows) {
    const target = { endpoint: row.endpoint, p256dh: row.p256dh, auth: row.auth };
    let outcome;
    try {
      outcome = await sender(target, nudgePayload(row.local_date));
    } catch {
      outcome = { kind: 'failed' as const, status: null };
    }
    if (outcome.kind === 'ok') {
      await markSent(sql, row.endpoint_hash, row.local_date);
      sent += 1;
    } else if (outcome.kind === 'gone') {
      deleted += (await deleteRow(sql, row.endpoint_hash)) > 0 ? 1 : 0;
    } else if (outcome.kind === 'rateLimited') {
      // R14.8: 429 leaves the row untouched and does not increment anything. It is not
      // counted as a failure either, because it is the push service asking us to wait.
      continue;
    } else {
      const result = await recordFailure(sql, row.endpoint_hash);
      failed += 1;
      if (result.deleted) deleted += 1;
    }
  }

  const swept = await staleSweep(sql, asOf);
  const expired = await deleteAncient(sql, asOf);
  return { due: rows.length, sent, deleted, failed, swept, expired };
}
