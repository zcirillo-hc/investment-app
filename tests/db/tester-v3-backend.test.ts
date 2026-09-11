/**
 * TESTER, cycle 3: the two V2-3 follow ups the coder asked for and nobody ran (build notes,
 * "What the tester should re-check, near each fix"): more than two overlapping runs, and a
 * claim followed by a sender that throws (release, then recordFailure, two statements).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetDb } from '../../api/_lib/db';
import { runSend } from '../../api/_lib/due';
import type { Sender } from '../../api/_lib/push';
import { db, insertRow, localParts, makeSub, readRow, truncate } from './helpers';

beforeEach(async () => {
  await truncate();
});
afterEach(() => {
  resetDb();
});

async function dueRow(label: string) {
  const s = makeSub(label);
  const tz = 'UTC';
  const { date, minute } = localParts(tz, new Date());
  await insertRow({ ...s, tz, nudgeLocalDate: date, nudgeLocalMinute: Math.min(1439, minute + 5) });
  return { s, date };
}

describe('V2-3 follow ups', () => {
  it('five overlapping runs deliver exactly one notification', async () => {
    const { s, date } = await dueRow('five');
    let sends = 0;
    const slow: Sender = async () => {
      sends += 1;
      await new Promise((r) => setTimeout(r, 300));
      return { kind: 'ok' };
    };
    await Promise.all(Array.from({ length: 5 }, () => runSend({ sql: db(), sender: slow })));
    const row = await readRow(s.endpointHash);
    // eslint-disable-next-line no-console
    console.log(`AUDIT-RESULT five-concurrent sends=${sends} row=${JSON.stringify(row)}`);
    expect(sends).toBe(1);
    expect(row?.last_sent_local_date).toBe(date);
  });

  it('a sender that throws after the claim releases the day, counts one failure, and the next run still sends', async () => {
    const { s } = await dueRow('throw');
    const boom: Sender = async () => {
      throw new Error('push service exploded');
    };
    await runSend({ sql: db(), sender: boom });
    const mid = await readRow(s.endpointHash);
    let sends = 0;
    await runSend({
      sql: db(),
      sender: async () => {
        sends += 1;
        return { kind: 'ok' };
      },
    });
    const end = await readRow(s.endpointHash);
    // eslint-disable-next-line no-console
    console.log(`AUDIT-RESULT throw-then-ok: after throw ${JSON.stringify(mid)}; second run sends=${sends} ${JSON.stringify(end)}`);
    expect(mid?.fail_count).toBe(1);
    expect(mid?.last_sent_local_date, 'a failed send must not burn the day').toBeNull();
    expect(mid?.nudge_local_minute, 'the minute must survive a failed send').not.toBeNull();
    expect(sends).toBe(1);
    expect(end?.fail_count).toBe(0);
  });

  it('a 429 inside a concurrent pair leaves the row untouched and the other run does not double send', async () => {
    const { s } = await dueRow('rl');
    let calls = 0;
    const flaky: Sender = async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 200));
      return calls === 1 ? { kind: 'rateLimited' } : { kind: 'ok' };
    };
    await Promise.all([runSend({ sql: db(), sender: flaky }), runSend({ sql: db(), sender: flaky })]);
    const row = await readRow(s.endpointHash);
    // eslint-disable-next-line no-console
    console.log(`AUDIT-RESULT 429-pair: calls=${calls} ${JSON.stringify(row)}`);
    expect(calls, 'only one run may own the row at a time').toBe(1);
    expect(row?.fail_count).toBe(0);
    expect(row?.last_sent_local_date).toBeNull();
  });
});
