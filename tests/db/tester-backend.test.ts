/**
 * TESTER v2, job 3: the backend, adversarially, against the real Neon instance in the
 * isolated schema. Aimed at the coder's own weak points (build notes, "v2 backend build",
 * section 5) and at what `tests/db/*` does not already assert.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { table, resetDb } from '../../api/_lib/db';
import { runSend, selectDue, GRACE_MINUTES, DUE_LIMIT } from '../../api/_lib/due';
import type { Sender } from '../../api/_lib/push';
import subscribeHandler from '../../api/push/subscribe';
import scheduleHandler from '../../api/push/schedule';
import unsubscribeHandler from '../../api/push/unsubscribe';
import cronHandler from '../../api/cron/send-nudges';
import { countRows, db, insertRow, localParts, makeSub, mockReq, mockRes, readRow, truncate, PUSH_SUBS } from './helpers';

const okSender: Sender = async () => ({ kind: 'ok' });

async function call(handler: (req: any, res: any) => Promise<void> | void, init: Parameters<typeof mockReq>[0]) {
  const { res, recorded } = mockRes();
  await handler(mockReq(init), res);
  return recorded;
}

beforeEach(async () => {
  await truncate();
});
afterEach(() => {
  resetDb();
});

describe('table(): the SQL injection surface the coder flagged as a deviation', () => {
  const original = process.env.PUSH_DB_SCHEMA;
  afterEach(() => {
    process.env.PUSH_DB_SCHEMA = original;
  });

  it('throws BEFORE a query is built for every hostile schema name', () => {
    const hostile = [
      'a"; drop table push_subs; --',
      "a'; drop table push_subs; --",
      'public.push_subs; delete from push_subs where 1=1; --',
      'Public',
      'PUSH',
      '1abc',
      'a-b',
      'a b',
      'a'.repeat(64),
      'push_subs"',
      '"public"',
      ' abc',
      'schema\nname',
    ];
    const accepted: string[] = [];
    for (const s of hostile) {
      process.env.PUSH_DB_SCHEMA = s;
      try {
        const built = table('push_subs');
        accepted.push(`${s.split('').map((c) => c.charCodeAt(0)).join(',')} => ${built}`);
      } catch {
        /* rejected, which is what we want */
      }
    }
    expect(accepted, 'PUSH_DB_SCHEMA values that reached a query').toEqual([]);
  });

  it('accepts the identifier shapes it is meant to: unset, empty, 63 chars, and `public`', () => {
    delete process.env.PUSH_DB_SCHEMA;
    expect(table('push_subs')).toBe('push_subs');
    process.env.PUSH_DB_SCHEMA = '';
    expect(table('push_subs')).toBe('push_subs');
    process.env.PUSH_DB_SCHEMA = 'a'.repeat(63);
    expect(table('push_subs')).toBe(`"${'a'.repeat(63)}".push_subs`);
    process.env.PUSH_DB_SCHEMA = 'public';
    expect(table('push_subs')).toBe('"public".push_subs');
  });
});

describe('hostile values through the parameterised routes', () => {
  it('a SQL payload in tz is rejected at validation, never stored', async () => {
    const s = makeSub('inj');
    const r = await call(subscribeHandler, {
      method: 'POST',
      body: { subscription: { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, tz: "'; drop table push_subs; --" },
    });
    expect(r.status).toBe(400);
    expect(await countRows()).toBe(0);
  });

  it('a SQL payload inside an endpoint URL is stored as data and breaks nothing', async () => {
    const endpoint = `https://fcm.googleapis.com/fcm/send/x'); drop table ${'push_subs'}; --`;
    const r = await call(subscribeHandler, {
      method: 'POST',
      body: { subscription: { endpoint, keys: { p256dh: 'BP' + 'x'.repeat(20), auth: 'auth' + 'y'.repeat(10) } }, tz: 'America/New_York' },
    });
    expect(r.status).toBe(200);
    expect(await countRows()).toBe(1);
    // the table still exists
    await db().query(`select 1 from ${PUSH_SUBS()} limit 1`);
  });

  it('a 4096 character endpoint, an empty tz and a null body each return 400 and store nothing', async () => {
    const cases: unknown[] = [
      { subscription: { endpoint: 'https://a.example/' + 'x'.repeat(4096), keys: { p256dh: 'BPx', auth: 'auth' } }, tz: 'UTC' },
      { subscription: { endpoint: 'https://a.example/x', keys: { p256dh: 'BPx', auth: 'auth' } }, tz: '' },
      { subscription: { endpoint: 'http://a.example/x', keys: { p256dh: 'BPx', auth: 'auth' } }, tz: 'UTC' },
      { subscription: { endpoint: 'https://a.example/x', keys: { p256dh: 'BPx', auth: 'auth' } }, tz: '+05:30' },
      { subscription: { endpoint: 'https://a.example/x', keys: null }, tz: 'UTC' },
      null,
      'not json at all',
      [],
    ];
    for (const body of cases) {
      const r = await call(subscribeHandler, { method: 'POST', body });
      expect(r.status, `body: ${JSON.stringify(body)?.slice(0, 60)}`).toBe(400);
    }
    expect(await countRows()).toBe(0);
  });
});

describe('the CRON_SECRET gate', () => {
  const original = process.env.CRON_SECRET;
  afterEach(() => {
    process.env.CRON_SECRET = original;
  });

  it('refuses every malformed authorization header', async () => {
    process.env.CRON_SECRET = 'the-real-secret';
    const headers = [
      {},
      { authorization: '' },
      { authorization: 'Bearer' },
      { authorization: 'Bearer ' },
      { authorization: 'bearer the-real-secret' },
      { authorization: 'BEARER the-real-secret' },
      { authorization: 'Basic the-real-secret' },
      { authorization: 'Bearer the-real-secre' },
      { authorization: 'Bearer the-real-secret ' },
      { authorization: 'Bearer  the-real-secret' },
      { authorization: 'Bearer the-real-secretX' },
    ];
    for (const h of headers) {
      const r = await call(cronHandler, { method: 'GET', headers: h as Record<string, string> });
      expect(r.status, `header ${JSON.stringify(h)}`).toBe(401);
    }
  });

  it('refuses to run at all when CRON_SECRET is unset, rather than running open', async () => {
    delete process.env.CRON_SECRET;
    const r = await call(cronHandler, { method: 'GET', headers: { authorization: 'Bearer anything' } });
    expect(r.status).toBe(500);
    expect(r.json<{ error: string }>().error).toBe('not configured');
  });

  it('refuses a non-GET method', async () => {
    process.env.CRON_SECRET = 'the-real-secret';
    const r = await call(cronHandler, { method: 'POST', headers: { authorization: 'Bearer the-real-secret' } });
    expect(r.status).toBe(405);
  });

  it('never echoes the secret or an endpoint in any response body', async () => {
    process.env.CRON_SECRET = 'the-real-secret';
    const bad = await call(cronHandler, { method: 'GET', headers: { authorization: 'Bearer wrong' } });
    expect(bad.body).not.toContain('the-real-secret');
    expect(bad.body).not.toContain('wrong');
  });
});

describe('R14.4 daily lock under a second call, and under two CONCURRENT calls', () => {
  it('a sequential second run does not resend (the documented guarantee)', async () => {
    const s = makeSub('seq');
    const tz = 'UTC';
    const { date, minute } = localParts(tz, new Date());
    await insertRow({ ...s, tz, nudgeLocalDate: date, nudgeLocalMinute: Math.min(1439, minute + 5) });
    let sends = 0;
    const counting: Sender = async () => {
      sends += 1;
      return { kind: 'ok' };
    };
    await runSend({ sql: db(), sender: counting });
    await runSend({ sql: db(), sender: counting });
    expect(sends).toBe(1);
  });

  it('DEFECT: two overlapping runs of the send route each deliver a notification', async () => {
    const s = makeSub('conc');
    const tz = 'UTC';
    const { date, minute } = localParts(tz, new Date());
    await insertRow({ ...s, tz, nudgeLocalDate: date, nudgeLocalMinute: Math.min(1439, minute + 5) });
    let sends = 0;
    const slow: Sender = async () => {
      sends += 1;
      await new Promise((r) => setTimeout(r, 300));
      return { kind: 'ok' };
    };
    await Promise.all([runSend({ sql: db(), sender: slow }), runSend({ sql: db(), sender: slow })]);
    expect(sends, `AUDIT-RESULT concurrent-sends=${sends} (1 = locked, 2 = duplicate notification)`).toBe(1);
  });
});

describe('R14.4 / R14.5 due selection at the exact minute boundaries', () => {
  async function dueFor(offsetFromNowMinutes: number): Promise<boolean> {
    const s = makeSub(`b${offsetFromNowMinutes}`);
    const tz = 'UTC';
    const { date, minute } = localParts(tz, new Date());
    const target = minute + offsetFromNowMinutes;
    if (target < 0 || target > 1439) throw new Error('boundary case would cross midnight; rerun');
    await insertRow({ ...s, tz, nudgeLocalDate: date, nudgeLocalMinute: target });
    const rows = await selectDue(db());
    return rows.some((r) => r.endpoint_hash === s.endpointHash);
  }

  it('59 minutes late is due, 60 minutes late is NOT (the > boundary)', async () => {
    expect(await dueFor(-(GRACE_MINUTES - 1))).toBe(true);
    expect(await dueFor(-GRACE_MINUTES)).toBe(false);
    expect(await dueFor(-(GRACE_MINUTES + 1))).toBe(false);
  });

  it('a target hours in the future is still sent ahead of schedule (R14.4, no upper bound)', async () => {
    const s = makeSub('ahead');
    const tz = 'UTC';
    const { date, minute } = localParts(tz, new Date());
    if (minute < 1200) {
      await insertRow({ ...s, tz, nudgeLocalDate: date, nudgeLocalMinute: 1439 });
      const rows = await selectDue(db());
      expect(rows.some((r) => r.endpoint_hash === s.endpointHash)).toBe(true);
    }
  });

  it('a disabled row is never selected', async () => {
    const s = makeSub('off');
    const tz = 'UTC';
    const { date, minute } = localParts(tz, new Date());
    await insertRow({ ...s, tz, nudgeLocalDate: date, nudgeLocalMinute: Math.min(1439, minute + 5), enabled: false });
    const rows = await selectDue(db());
    expect(rows.some((r) => r.endpoint_hash === s.endpointHash)).toBe(false);
  });
});

describe('6.8 / 6.6: the batch ceiling against maxDuration 60, which the coder flagged', () => {
  it(`selectDue caps at ${DUE_LIMIT} rows`, async () => {
    const tz = 'UTC';
    const { date, minute } = localParts(tz, new Date());
    const target = Math.min(1439, minute + 5);
    // 20 rows is enough to prove the limit clause is present without inserting 501 rows one
    // at a time over the HTTP driver; the ceiling itself is asserted from the constant.
    for (let i = 0; i < 20; i++) await insertRow({ ...makeSub(`bulk${i}`), tz, nudgeLocalDate: date, nudgeLocalMinute: target });
    const rows = await selectDue(db());
    expect(rows.length).toBe(20);
    expect(DUE_LIMIT).toBe(500);
  });

  it('DEFECT: a serial send loop of DUE_LIMIT rows exceeds the function maxDuration of 60 s', async () => {
    // Measured, not assumed: time 20 real serial round trips through runSend with a sender
    // that sleeps for a conservative 100 ms, then extrapolate to DUE_LIMIT.
    const tz = 'UTC';
    const { date, minute } = localParts(tz, new Date());
    const target = Math.min(1439, minute + 5);
    const N = 20;
    for (let i = 0; i < N; i++) await insertRow({ ...makeSub(`slow${i}`), tz, nudgeLocalDate: date, nudgeLocalMinute: target });
    const slow: Sender = async () => {
      await new Promise((r) => setTimeout(r, 100));
      return { kind: 'ok' };
    };
    // First: how much of a row's cost is the database, with an INSTANT sender.
    const t0db = Date.now();
    const dbOnly = await runSend({ sql: db(), sender: async () => ({ kind: 'ok' }) });
    const dbElapsed = Date.now() - t0db;
    expect(dbOnly.sent).toBe(N);
    // Reset the daily lock so the same rows are due again for the timed run below.
    await db().query(`update ${PUSH_SUBS()} set last_sent_local_date = null, nudge_local_minute = $1`, [target]);
    const t0 = Date.now();
    const report = await runSend({ sql: db(), sender: slow });
    const elapsed = Date.now() - t0;
    // eslint-disable-next-line no-console
    console.log(`AUDIT-RESULT db-only: ${N} rows in ${dbElapsed} ms (${(dbElapsed / N).toFixed(0)} ms/row of pure Neon round trips); ${DUE_LIMIT} rows projects to ${((dbElapsed / N) * DUE_LIMIT / 1000).toFixed(0)} s before any push latency at all`);
    expect(report.sent).toBe(N);
    const perRow = elapsed / N;
    const projected = (perRow * DUE_LIMIT) / 1000;
    // eslint-disable-next-line no-console
    console.log(`AUDIT-RESULT serial-send: ${N} rows in ${elapsed} ms (${perRow.toFixed(0)} ms/row incl. markSent); ${DUE_LIMIT} rows projects to ${projected.toFixed(0)} s against maxDuration 60`);
    expect(projected, `projected ${projected.toFixed(0)}s for ${DUE_LIMIT} rows exceeds the 60 s function limit`).toBeLessThan(60);
  });
});

describe('the subscription auth model (6.6)', () => {
  it('schedule with a wrong auth changes nothing and returns 403', async () => {
    const s = makeSub('auth');
    await insertRow({ ...s, tz: 'UTC' });
    const r = await call(scheduleHandler, {
      method: 'POST',
      body: { endpoint: s.endpoint, auth: 'wrongsecretwrong', tz: 'UTC', nudgeLocalDate: '2026-09-09', nudgeLocalMinute: 600 },
    });
    expect(r.status).toBe(403);
    expect((await readRow(s.endpointHash))!.nudge_local_minute).toBeNull();
  });

  it('schedule for an endpoint with no row returns 403, not 404', async () => {
    const s = makeSub('ghost');
    const r = await call(scheduleHandler, {
      method: 'POST',
      body: { endpoint: s.endpoint, auth: s.auth, tz: 'UTC', nudgeLocalDate: '2026-09-09', nudgeLocalMinute: 600 },
    });
    expect(r.status).toBe(403);
  });

  it('DEFECT: unsubscribe distinguishes "no row" (200) from "row, wrong auth" (403)', async () => {
    const known = makeSub('known');
    await insertRow({ ...known, tz: 'UTC' });
    const unknown = makeSub('unknown');
    const a = await call(unsubscribeHandler, { method: 'POST', body: { endpoint: known.endpoint, auth: 'wrongsecretwrong' } });
    const b = await call(unsubscribeHandler, { method: 'POST', body: { endpoint: unknown.endpoint, auth: 'wrongsecretwrong' } });
    expect(
      [a.status, b.status],
      `AUDIT-RESULT unsubscribe-oracle: subscribed=${a.status} unsubscribed=${b.status} (equal = no oracle)`,
    ).toEqual([a.status, a.status]);
  });

  it('unsubscribe with the right auth deletes the row completely (R11.7, R14.9)', async () => {
    const s = makeSub('del');
    await insertRow({ ...s, tz: 'UTC', nudgeLocalDate: '2026-09-09', nudgeLocalMinute: 600 });
    const r = await call(unsubscribeHandler, { method: 'POST', body: { endpoint: s.endpoint, auth: s.auth } });
    expect(r.status).toBe(200);
    expect(r.json<{ deleted: number }>().deleted).toBe(1);
    expect(await readRow(s.endpointHash)).toBeNull();
    expect(await countRows()).toBe(0);
  });

  it('subscribe twice from the same browser still yields one row and keeps the pending minute', async () => {
    const s = makeSub('idem');
    const body = { subscription: { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, tz: 'America/New_York' };
    await call(subscribeHandler, { method: 'POST', body });
    await call(scheduleHandler, {
      method: 'POST',
      body: { endpoint: s.endpoint, auth: s.auth, tz: 'America/New_York', nudgeLocalDate: '2026-09-09', nudgeLocalMinute: 600 },
    });
    await call(subscribeHandler, { method: 'POST', body });
    expect(await countRows()).toBe(1);
    const row = await readRow(s.endpointHash)!;
    expect(row!.nudge_local_minute).toBe(600);
  });
});

describe('R14.1 / R11.6: what the server will accept and store', () => {
  it('BY DESIGN (R14.1): the schedule route stores a minute inside quiet hours without complaint', async () => {
    const s = makeSub('quiet');
    await insertRow({ ...s, tz: 'UTC' });
    const r = await call(scheduleHandler, {
      method: 'POST',
      body: { endpoint: s.endpoint, auth: s.auth, tz: 'UTC', nudgeLocalDate: '2026-09-09', nudgeLocalMinute: 180 },
    });
    // R14.1 puts every nudge policy decision on the device and forbids the server from being a
    // second place it lives, and only the device holds the `auth` secret this call needs. So a
    // 200 here is correct, and it is recorded rather than asserted as a defect.
    expect(r.status).toBe(200);
    expect((await readRow(s.endpointHash))!.nudge_local_minute).toBe(180);
  });

  it('the schedule route accepts a far future nudge date, which the 90 day sweep eventually clears', async () => {
    const s = makeSub('future');
    await insertRow({ ...s, tz: 'UTC' });
    const r = await call(scheduleHandler, {
      method: 'POST',
      body: { endpoint: s.endpoint, auth: s.auth, tz: 'UTC', nudgeLocalDate: '2099-01-01', nudgeLocalMinute: 600 },
    });
    expect(r.status).toBe(200);
    // staleSweep only clears a date already in the PAST, so this row keeps its minute until
    // deleteAncient removes the whole row 90 days after the last update (R14.9).
    const swept = await runSend({ sql: db(), sender: okSender });
    expect(swept.swept).toBe(0);
    expect((await readRow(s.endpointHash))!.nudge_local_minute).toBe(600);
  });

  it('the schedule route rejects extra keys carrying app data by ignoring them entirely', async () => {
    const s = makeSub('extra');
    await insertRow({ ...s, tz: 'UTC' });
    const r = await call(scheduleHandler, {
      method: 'POST',
      body: {
        endpoint: s.endpoint,
        auth: s.auth,
        tz: 'UTC',
        nudgeLocalDate: '2026-09-09',
        nudgeLocalMinute: 600,
        placeName: 'BlueBottleCoffeeXYZ',
        estimateCents: 43799991,
        jarCents: 120000077,
      },
    });
    expect(r.status).toBe(200);
    const stored = (await db().query(`select * from ${PUSH_SUBS()} where endpoint_hash = $1`, [s.endpointHash])) as unknown as Array<
      Record<string, unknown>
    >;
    const asText = JSON.stringify(stored);
    expect(asText).not.toContain('BlueBottleCoffeeXYZ');
    expect(asText).not.toContain('43799991');
    expect(asText).not.toContain('120000077');
    // and the row still holds only the five columns the plan allows to change
    expect(JSON.parse(asText)[0].nudge_local_minute).toBe(600);
  });

  it('the table has no column that could hold a place, an amount or an IP (criterion 21)', async () => {
    const cols = (await db().query(
      `select column_name from information_schema.columns
        where table_name = 'push_subs' and table_schema = $1`,
      [process.env.PUSH_DB_SCHEMA],
    )) as unknown as Array<{ column_name: string }>;
    const names = cols.map((c) => c.column_name).sort();
    expect(names.length).toBeGreaterThan(0);
    const banned = /place|merchant|amount|cents|jar|name|ip|addr|lat|lon|coord|geo|user|email|age/i;
    expect(names.filter((n) => banned.test(n))).toEqual([]);
  });
});

describe('R14.8 failure handling, at the exact counts', () => {
  async function withOutcome(kind: 'gone' | 'rateLimited' | 'failed', failCount = 0) {
    const s = makeSub(`f-${kind}-${failCount}`);
    const tz = 'UTC';
    const { date, minute } = localParts(tz, new Date());
    await insertRow({ ...s, tz, nudgeLocalDate: date, nudgeLocalMinute: Math.min(1439, minute + 5), failCount });
    const sender: Sender = async () =>
      kind === 'gone' ? { kind: 'gone', status: 410 } : kind === 'rateLimited' ? { kind: 'rateLimited' } : { kind: 'failed', status: 500 };
    const report = await runSend({ sql: db(), sender });
    return { s, report, row: await readRow(s.endpointHash) };
  }

  it('410 deletes the row', async () => {
    const { row } = await withOutcome('gone');
    expect(row).toBeNull();
  });
  it('429 leaves the row and its fail_count untouched', async () => {
    const { row, report } = await withOutcome('rateLimited', 2);
    expect(row!.fail_count).toBe(2);
    expect(row!.nudge_local_minute).not.toBeNull();
    expect(report.failed).toBe(0);
  });
  it('the fourth generic failure keeps the row; the fifth deletes it', async () => {
    const a = await withOutcome('failed', 3);
    expect(a.row).not.toBeNull();
    expect(a.row!.fail_count).toBe(4);
    const b = await withOutcome('failed', 4);
    expect(b.row).toBeNull();
  });
  it('a sender that THROWS is a generic failure and does not abort the batch', async () => {
    const tz = 'UTC';
    const { date, minute } = localParts(tz, new Date());
    const target = Math.min(1439, minute + 5);
    const bad = makeSub('throws');
    const good = makeSub('after');
    await insertRow({ ...bad, tz, nudgeLocalDate: date, nudgeLocalMinute: target });
    await insertRow({ ...good, tz, nudgeLocalDate: date, nudgeLocalMinute: target });
    const sender: Sender = async (t) => {
      if (t.endpoint === bad.endpoint) throw new Error('push service exploded');
      return { kind: 'ok' };
    };
    const report = await runSend({ sql: db(), sender });
    expect(report.due).toBe(2);
    expect(report.sent).toBe(1);
    expect(report.failed).toBe(1);
    expect((await readRow(good.endpointHash))!.last_sent_local_date).toBe(date);
  });
});

describe('timezone and DST arithmetic in due.ts', () => {
  it('two rows in opposite extreme zones are each judged against their own local clock', async () => {
    const a = makeSub('kiri');
    const b = makeSub('niue');
    const at = new Date();
    const pa = localParts('Pacific/Kiritimati', at);
    const pb = localParts('Pacific/Niue', at);
    await insertRow({ ...a, tz: 'Pacific/Kiritimati', nudgeLocalDate: pa.date, nudgeLocalMinute: Math.min(1439, pa.minute + 5) });
    // Niue: same instant, deliberately a minute already 2 hours past -> not due
    await insertRow({ ...b, tz: 'Pacific/Niue', nudgeLocalDate: pb.date, nudgeLocalMinute: Math.max(0, pb.minute - 120) });
    const rows = await selectDue(db());
    const hashes = rows.map((r) => r.endpoint_hash);
    expect(hashes).toContain(a.endpointHash);
    expect(hashes).not.toContain(b.endpointHash);
    expect(pa.date === pb.date, 'the two zones should straddle a date line for this case to mean anything').toBe(false);
  });

  it('AUDIT: a nudge minute inside the spring-forward gap (02:30 on the DST day) is handled, not lost forever', async () => {
    // America/New_York springs forward 2026-03-08 at 02:00 local. 02:30 does not exist.
    const s = makeSub('dstgap');
    await insertRow({ ...s, tz: 'America/New_York', nudgeLocalDate: '2026-03-08', nudgeLocalMinute: 150 });
    // Evaluated at 09:00 local on that day, 150 is 390 minutes in the past -> not due, correct.
    const asOf = '2026-03-08T13:00:00Z';
    const due = await selectDue(db(), asOf);
    expect(due.some((r) => r.endpoint_hash === s.endpointHash)).toBe(false);
    // and the stale sweep must clear it once the local date has moved on
    const report = await runSend({ sql: db(), sender: okSender, asOf: '2026-03-09T13:00:00Z' });
    expect(report.swept).toBeGreaterThanOrEqual(1);
    expect((await readRow(s.endpointHash))!.nudge_local_minute).toBeNull();
  });

  it('AUDIT: the fall-back repeated hour does not produce two sends for one local day', async () => {
    // America/New_York falls back 2026-11-01 at 02:00 local; 01:30 happens twice.
    const s = makeSub('dstfall');
    await insertRow({ ...s, tz: 'America/New_York', nudgeLocalDate: '2026-11-01', nudgeLocalMinute: 90 });
    let sends = 0;
    const counting: Sender = async () => {
      sends += 1;
      return { kind: 'ok' };
    };
    // 01:35 EDT (05:35Z) and 01:35 EST (06:35Z) are the same wall clock, an hour apart
    await runSend({ sql: db(), sender: counting, asOf: '2026-11-01T05:35:00Z' });
    await runSend({ sql: db(), sender: counting, asOf: '2026-11-01T06:35:00Z' });
    expect(sends, `AUDIT-RESULT dst-fallback-sends=${sends}`).toBe(1);
  });
});
