/**
 * Plan v2 11.3, R14.6, R14.8 and criterion 26. The send loop with an injected sender, so no
 * real push is generated and every failure branch is reachable.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { MAX_FAIL_COUNT, runSend } from '../../api/_lib/due';
import { classifyStatus, nudgePayload, type PushTarget, type SendOutcome, type Sender } from '../../api/_lib/push';
import { db, insertRow, localParts, makeSub, readRow, truncate } from './helpers';

const NY = 'America/New_York';
const ASOF = new Date('2026-06-15T14:00:00Z');
const AT = ASOF.toISOString();

async function dueRow(label = 'send') {
  const sub = makeSub(label);
  const here = localParts(NY, ASOF);
  await insertRow({ ...sub, tz: NY, nudgeLocalDate: here.date, nudgeLocalMinute: here.minute + 30 });
  return { ...sub, localDate: here.date };
}

interface Recorder {
  sender: Sender;
  calls: Array<{ target: PushTarget; payload: string }>;
}

/** A sender that records what it was asked to send and answers with a fixed outcome. */
function recording(outcome: SendOutcome): Recorder {
  const calls: Array<{ target: PushTarget; payload: string }> = [];
  return {
    calls,
    sender: async (target, payload) => {
      calls.push({ target, payload });
      return outcome;
    },
  };
}

beforeEach(async () => {
  await truncate();
});

describe('R14.6 the payload', () => {
  it('is exactly {"v":2,"t":"nudge","d":"YYYY-MM-DD"} and carries nothing else', () => {
    expect(nudgePayload('2026-06-29')).toBe('{"v":2,"t":"nudge","d":"2026-06-29"}');
    const parsed = JSON.parse(nudgePayload('2026-06-29')) as Record<string, unknown>;
    expect(Object.keys(parsed).sort()).toEqual(['d', 't', 'v']);
  });

  it('carries the local date the DEVICE asked for, which is what the worker matches on', async () => {
    const row = await dueRow();
    const rec = recording({ kind: 'ok' });
    await runSend({ sql: db(), sender: rec.sender, asOf: AT });
    expect(rec.calls.length).toBe(1);
    expect(rec.calls[0].payload).toBe(nudgePayload(row.localDate));
    expect(rec.calls[0].target).toEqual({ endpoint: row.endpoint, p256dh: row.p256dh, auth: row.auth });
  });

  it('sends no place, no amount, no jar figure and no name, because it sends 36 bytes', async () => {
    const row = await dueRow();
    const rec = recording({ kind: 'ok' });
    await runSend({ sql: db(), sender: rec.sender, asOf: AT });
    expect(rec.calls[0].payload).toBe(`{"v":2,"t":"nudge","d":"${row.localDate}"}`);
  });
});

describe('R14.8 failure handling (criterion 26)', () => {
  it('a 410 deletes the row', async () => {
    const row = await dueRow();
    const report = await runSend({ sql: db(), sender: recording({ kind: 'gone', status: 410 }).sender, asOf: AT });
    expect(report).toMatchObject({ due: 1, sent: 0, deleted: 1, failed: 0 });
    expect(await readRow(row.endpointHash)).toBeNull();
  });

  it('a 404 deletes the row', async () => {
    const row = await dueRow();
    const report = await runSend({ sql: db(), sender: recording({ kind: 'gone', status: 404 }).sender, asOf: AT });
    expect(report).toMatchObject({ deleted: 1 });
    expect(await readRow(row.endpointHash)).toBeNull();
  });

  it('a 429 leaves the row untouched, with fail_count unchanged and the minute still set', async () => {
    const row = await dueRow();
    const before = await readRow(row.endpointHash);
    const report = await runSend({ sql: db(), sender: recording({ kind: 'rateLimited' }).sender, asOf: AT });
    expect(report).toMatchObject({ due: 1, sent: 0, deleted: 0, failed: 0 });
    const after = await readRow(row.endpointHash);
    expect(after?.fail_count).toBe(0);
    expect(after?.nudge_local_minute).toBe(before?.nudge_local_minute);
    expect(after?.last_sent_local_date).toBeNull();
  });

  it('five consecutive generic failures delete the row, and the fourth does not', async () => {
    const row = await dueRow();
    const rec = recording({ kind: 'failed', status: 500 });
    for (let attempt = 1; attempt < MAX_FAIL_COUNT; attempt += 1) {
      const report = await runSend({ sql: db(), sender: rec.sender, asOf: AT });
      expect(report, `attempt ${attempt}`).toMatchObject({ due: 1, sent: 0, failed: 1, deleted: 0 });
      expect((await readRow(row.endpointHash))?.fail_count).toBe(attempt);
    }
    const last = await runSend({ sql: db(), sender: rec.sender, asOf: AT });
    expect(last).toMatchObject({ due: 1, sent: 0, failed: 1, deleted: 1 });
    expect(await readRow(row.endpointHash)).toBeNull();
  });

  it('a sender that throws is a generic failure and does not abort the rest of the batch', async () => {
    const a = await dueRow('throws');
    const b = await dueRow('survives');
    const sender: Sender = async (target) => {
      if (target.endpoint === a.endpoint) throw new Error('push service unreachable');
      return { kind: 'ok' };
    };
    const report = await runSend({ sql: db(), sender, asOf: AT });
    expect(report).toMatchObject({ due: 2, sent: 1, failed: 1 });
    expect((await readRow(a.endpointHash))?.fail_count).toBe(1);
    expect((await readRow(b.endpointHash))?.last_sent_local_date).toBe(b.localDate);
  });

  it('a success resets fail_count to 0', async () => {
    const sub = makeSub();
    const here = localParts(NY, ASOF);
    await insertRow({ ...sub, tz: NY, nudgeLocalDate: here.date, nudgeLocalMinute: here.minute + 30, failCount: 3 });
    await runSend({ sql: db(), sender: recording({ kind: 'ok' }).sender, asOf: AT });
    const row = await readRow(sub.endpointHash);
    expect(row?.fail_count).toBe(0);
    expect(row?.nudge_local_minute).toBeNull();
    expect(row?.last_sent_local_date).toBe(here.date);
  });
});

describe('R14.8 the WebPushError status mapping', () => {
  it('maps 404 and 410 to gone, 429 to rateLimited, and everything else to failed', () => {
    expect(classifyStatus(201)).toEqual({ kind: 'ok' });
    expect(classifyStatus(404)).toEqual({ kind: 'gone', status: 404 });
    expect(classifyStatus(410)).toEqual({ kind: 'gone', status: 410 });
    expect(classifyStatus(429)).toEqual({ kind: 'rateLimited' });
    expect(classifyStatus(400)).toEqual({ kind: 'failed', status: 400 });
    expect(classifyStatus(500)).toEqual({ kind: 'failed', status: 500 });
    expect(classifyStatus(null)).toEqual({ kind: 'failed', status: null });
  });
});

describe('6.8 a whole run', () => {
  it('sends, sweeps and prunes in one pass, and reports the four numbers', async () => {
    const sending = await dueRow('a');
    const stale = makeSub('stale');
    await insertRow({ ...stale, tz: NY, nudgeLocalDate: '2026-06-14', nudgeLocalMinute: 440 });
    const ancient = makeSub('ancient');
    // Absolute, because the run below is evaluated at ASOF and the retention window is
    // measured from that same instant.
    await insertRow({ ...ancient, tz: NY, updatedAt: '2026-01-01T00:00:00Z' });

    const report = await runSend({ sql: db(), sender: recording({ kind: 'ok' }).sender, asOf: AT });
    expect(report.due).toBe(1);
    expect(report.sent).toBe(1);
    expect(report.swept).toBe(1);
    expect(report.expired).toBe(1);
    expect((await readRow(sending.endpointHash))?.last_sent_local_date).toBe(sending.localDate);
    expect((await readRow(stale.endpointHash))?.nudge_local_minute).toBeNull();
    expect(await readRow(ancient.endpointHash)).toBeNull();
  });

  it('a second run the same day sends nothing, which is what makes the manual trigger safe', async () => {
    await dueRow();
    const rec = recording({ kind: 'ok' });
    expect((await runSend({ sql: db(), sender: rec.sender, asOf: AT })).sent).toBe(1);
    expect((await runSend({ sql: db(), sender: rec.sender, asOf: AT })).sent).toBe(0);
    expect(rec.calls.length).toBe(1);
  });
});
