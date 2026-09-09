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
import { table } from './db.js';
import { nudgePayload, type Sender } from './push.js';

export type Db = NeonQueryFunction<false, false>;

/** R14.8: the fifth consecutive failure of any non 404, 410 or 429 kind deletes the row. */
export const MAX_FAIL_COUNT = 5;

/** R14.5. A nudge more than this many minutes past its minute is never sent. */
export const GRACE_MINUTES = 60;

/** 6.8. One run's batch ceiling. */
export const DUE_LIMIT = 500;

/**
 * Test report V2-4, and the number the report asked for.
 *
 * `vercel.json` gives this function `maxDuration: 60`. The tester measured a serial `runSend`
 * against real Neon at 136 to 153 ms per row with a sender sleeping 100 ms, of which 33 to
 * 58 ms is pure database round trips. A serial pass over a full `DUE_LIMIT` batch therefore
 * projects to 68 to 76 s, which does not fit, and about the last fifth of a full batch would
 * silently get no nudge.
 *
 * `DUE_LIMIT` is not the lever. It is the plan's number (6.8), a run happens once a day, and
 * dropping rows out of the batch means dropping people's nudges for that day. The lever is
 * that every row's cost is latency, not work: a push send and a single row update, both
 * waiting on somebody else's network. So the loop runs a fixed size pool instead of one at a
 * time.
 *
 * The arithmetic, stated so it can be checked rather than trusted, and asserted by
 * `tests/db/send-budget.test.ts`:
 *
 *   worst case per row      250 ms   (measured worst was 153; this is 1.6x that, deliberately
 *                                     pessimistic about a slow push service)
 *   DUE_LIMIT / CONCURRENCY  63      (500 rows in pools of 8)
 *   projected wall clock     15.6 s  against a 45 s send budget, a 2.9x margin
 *
 * Eight, not eighty: the ceiling here is other people's rate limits and one Neon HTTP
 * connection, and a run that trips a 429 storm has made things worse, not faster.
 */
export const SEND_CONCURRENCY = 8;

/** `maxDuration` in `vercel.json`, in seconds. Duplicated here so a test can compare them. */
export const MAX_DURATION_SECONDS = 60;

/**
 * The wall clock budget for the send phase. No NEW row is started once this is spent; rows
 * already in flight finish. The remaining 15 s covers the two housekeeping statements, a cold
 * start and the platform's own overhead, so the function returns a report rather than being
 * killed halfway through a batch.
 *
 * A row that does not get started keeps its minute and is picked up by the next run; if no run
 * comes before the local date rolls over, `staleSweep` clears it, which is 6.8's existing
 * answer to a dropped nudge and is why a partial batch is safe rather than corrupting.
 */
export const SEND_BUDGET_MS = 45_000;

/** The pessimistic per row figure the budget above is justified against. */
export const ASSUMED_MS_PER_ROW = 250;

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

/**
 * Test report V2-3, and R14.4's daily lock made to mean what it says.
 *
 * The lock used to be taken in `markSent`, AFTER the push had already gone out, so two runs
 * that overlapped both selected the row and both sent. The tester measured exactly that:
 * `concurrent-sends=2`. 11.4 tells the tester to trigger this route by hand, and a platform
 * retry overlapping the original does the same thing in production, so "it only fires once a
 * day" is not the guarantee.
 *
 * The claim is now taken BEFORE the send, as one conditional update. Postgres re-evaluates an
 * `UPDATE`'s qualifier against the committed row after taking the row lock, so of two
 * concurrent claims exactly one matches a row and the other matches none. Returning zero rows
 * is not an error: it means another run owns this row for today, and this one skips it.
 *
 * It returns the PREVIOUS `last_sent_local_date` so `releaseClaim` can put it back. A claim is
 * released whenever the send did not actually happen, which is what keeps R14.8 true: a 429
 * still has to leave the row completely untouched, minute and all.
 */
export async function claimForSend(sql: Db, endpointHash: string, localDate: string): Promise<{ claimed: boolean; previous: string | null }> {
  const rows = (await sql.query(
    `with prev as (
       select endpoint_hash, to_char(last_sent_local_date, 'YYYY-MM-DD') as previous
         from ${table('push_subs')}
        where endpoint_hash = $1
     )
     update ${table('push_subs')} p
        set last_sent_local_date = $2::date, updated_at = now()
       from prev
      where p.endpoint_hash = prev.endpoint_hash
        and p.last_sent_local_date is distinct from $2::date
     returning prev.previous as previous`,
    [endpointHash, localDate],
  )) as unknown as Array<{ previous: string | null }>;
  if (rows.length === 0) return { claimed: false, previous: null };
  return { claimed: true, previous: rows[0].previous ?? null };
}

/** Undoes `claimForSend` when the send did not happen, so the row is exactly as it was. */
export async function releaseClaim(sql: Db, endpointHash: string, previous: string | null): Promise<void> {
  await sql.query(
    `update ${table('push_subs')} set last_sent_local_date = $2::date where endpoint_hash = $1`,
    [endpointHash, previous],
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
  /** V2-3: rows another overlapping run had already claimed for today. */
  skipped: number;
  /** V2-4: rows the send budget ran out before reaching. Zero in every normal run. */
  unstarted: number;
}

/** Everything a test wants to know, plus the two counts a partial batch needs to be visible. */
export interface RunSendOptions {
  sql: Db;
  sender: Sender;
  /** Null in production. A fixed instant in a test (see the file header). */
  asOf?: string | null;
  /** Test seam for the V2-4 budget. Production always uses `SEND_BUDGET_MS`. */
  budgetMs?: number;
  /** Test seam for the V2-4 pool size. Production always uses `SEND_CONCURRENCY`. */
  concurrency?: number;
  /** Injectable so a budget test does not have to actually wait. */
  now?: () => number;
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
  const budgetMs = options.budgetMs ?? SEND_BUDGET_MS;
  const concurrency = Math.max(1, options.concurrency ?? SEND_CONCURRENCY);
  const now = options.now ?? Date.now;
  const rows = await selectDue(sql, asOf);

  let sent = 0;
  let deleted = 0;
  let failed = 0;
  let skipped = 0;
  let unstarted = 0;

  const startedAt = now();
  let cursor = 0;

  /** One row, start to finish. Every branch either owns the claim or has given it back. */
  const handle = async (row: DueRow): Promise<void> => {
    // V2-3: take the per local day lock BEFORE sending, not after.
    const claim = await claimForSend(sql, row.endpoint_hash, row.local_date);
    if (!claim.claimed) {
      skipped += 1;
      return;
    }
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
      return;
    }
    if (outcome.kind === 'gone') {
      // The row goes entirely, so there is no claim left to release.
      deleted += (await deleteRow(sql, row.endpoint_hash)) > 0 ? 1 : 0;
      return;
    }
    if (outcome.kind === 'rateLimited') {
      // R14.8: 429 leaves the row untouched and does not increment anything. It is not
      // counted as a failure either, because it is the push service asking us to wait. The
      // claim has to come back off for "untouched" to be true.
      await releaseClaim(sql, row.endpoint_hash, claim.previous);
      return;
    }
    // R14.8: a generic failure keeps the minute and is retried by the next run, so the claim
    // comes back off here too. Without that, one 500 would cost this row its whole day.
    await releaseClaim(sql, row.endpoint_hash, claim.previous);
    const result = await recordFailure(sql, row.endpoint_hash);
    failed += 1;
    if (result.deleted) deleted += 1;
  };

  /**
   * V2-4. A fixed size pool rather than one row at a time, and a wall clock budget so a run
   * that is going to overrun `maxDuration` stops starting work and returns a report instead of
   * being killed with rows half processed.
   */
  const worker = async (): Promise<void> => {
    for (;;) {
      const i = cursor;
      cursor += 1;
      if (i >= rows.length) return;
      if (now() - startedAt >= budgetMs) {
        unstarted += rows.length - i;
        cursor = rows.length;
        return;
      }
      await handle(rows[i]);
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, rows.length) }, () => worker()));

  const swept = await staleSweep(sql, asOf);
  const expired = await deleteAncient(sql, asOf);
  return { due: rows.length, sent, deleted, failed, swept, expired, skipped, unstarted };
}
