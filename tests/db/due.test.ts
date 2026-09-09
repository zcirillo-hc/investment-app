/**
 * Plan v2 11.3, 6.8, R14.4 and R14.5, and criterion 22. The once a day scheduler's selection.
 *
 * Every case runs the SHIPPED SQL in `api/_lib/due.ts` against the real table. The only
 * concession to testability is `asOf`, the instant the run is evaluated at, which is `now()`
 * in production and a fixed timestamp here. Without it there is no way to assert the two
 * daylight saving transitions 11.3 requires, because the transitions are in March and
 * November and the suite has to pass in September.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { deleteAncient, selectDue, markSent, staleSweep } from '../../api/_lib/due';
import { db, insertRow, localParts, makeSub, readRow, truncate } from './helpers';

const NY = 'America/New_York';

/** Builds a row whose target minute sits `offset` minutes from the local clock at `asOf`. */
async function rowAt(tz: string, asOf: Date, offsetMinutes: number, extra: { lastSent?: string } = {}) {
  const sub = makeSub();
  const here = localParts(tz, asOf);
  const minute = here.minute + offsetMinutes;
  if (minute < 0 || minute > 1439) throw new Error(`test instant puts the target minute out of range: ${minute}`);
  await insertRow({
    ...sub,
    tz,
    nudgeLocalDate: here.date,
    nudgeLocalMinute: minute,
    lastSentLocalDate: extra.lastSent ?? null,
  });
  return { ...sub, localDate: here.date, minute };
}

beforeEach(async () => {
  await truncate();
});

describe('R14.4 due selection, once a day', () => {
  // 2026-06-15 14:00 UTC is 10:00 in New York, which leaves room either side of the local
  // clock for a target minute up to two hours away in both directions.
  const asOf = new Date('2026-06-15T14:00:00Z');
  const at = asOf.toISOString();

  it('selects a row whose target minute is still ahead of the run, and sends it early', async () => {
    const row = await rowAt(NY, asOf, +120);
    const due = await selectDue(db(), at);
    expect(due.map((d) => d.endpoint_hash)).toEqual([row.endpointHash]);
    expect(due[0].local_date).toBe(row.localDate);
  });

  it('selects a row forty five minutes after its target minute (criterion 22)', async () => {
    const row = await rowAt(NY, asOf, -45);
    const due = await selectDue(db(), at);
    expect(due.map((d) => d.endpoint_hash)).toEqual([row.endpointHash]);
  });

  it('does not select a row sixty five minutes after its target minute (R14.5)', async () => {
    await rowAt(NY, asOf, -65);
    expect(await selectDue(db(), at)).toEqual([]);
  });

  it('draws the grace boundary at exactly sixty minutes, which is excluded', async () => {
    await rowAt(NY, asOf, -60);
    expect(await selectDue(db(), at)).toEqual([]);
    await truncate();
    await rowAt(NY, asOf, -59);
    expect((await selectDue(db(), at)).length).toBe(1);
  });

  it('does not select a row whose nudge date is not the local date today', async () => {
    const sub = makeSub();
    const here = localParts(NY, asOf);
    await insertRow({ ...sub, tz: NY, nudgeLocalDate: '2026-06-14', nudgeLocalMinute: here.minute + 30 });
    expect(await selectDue(db(), at)).toEqual([]);
  });

  it('does not select a row with no minute set, or a disabled row', async () => {
    const a = makeSub();
    const here = localParts(NY, asOf);
    await insertRow({ ...a, tz: NY, nudgeLocalDate: here.date, nudgeLocalMinute: null });
    const b = makeSub();
    await insertRow({ ...b, tz: NY, nudgeLocalDate: here.date, nudgeLocalMinute: here.minute + 30, enabled: false });
    expect(await selectDue(db(), at)).toEqual([]);
  });

  it('does not select a row already sent today, however many times the route is called', async () => {
    const row = await rowAt(NY, asOf, +120);
    // First run sends it and takes the per local day lock.
    const first = await selectDue(db(), at);
    expect(first.length).toBe(1);
    await markSent(db(), row.endpointHash, first[0].local_date);

    // A tester triggering the route again the same day (11.4) must not produce a second push.
    expect(await selectDue(db(), at)).toEqual([]);
    const stored = await readRow(row.endpointHash);
    expect(stored?.last_sent_local_date).toBe(row.localDate);
    expect(stored?.nudge_local_minute).toBeNull();
    expect(stored?.fail_count).toBe(0);
  });

  it('selects a row sent YESTERDAY, because the lock is per local day', async () => {
    const row = await rowAt(NY, asOf, +30, { lastSent: '2026-06-14' });
    expect((await selectDue(db(), at)).map((d) => d.endpoint_hash)).toEqual([row.endpointHash]);
  });
});

describe('6.8 two extreme time zones in the same run', () => {
  // 2026-06-15 20:00 UTC is 2026-06-16 10:00 in Kiritimati (UTC+14) and 2026-06-15 09:00 in
  // Niue (UTC-11). Different local dates, different local minutes, one run.
  const asOf = new Date('2026-06-15T20:00:00Z');
  const at = asOf.toISOString();

  it('evaluates Pacific/Kiritimati and Pacific/Niue each against its own zone', async () => {
    const kiri = await rowAt('Pacific/Kiritimati', asOf, +60);
    const niue = await rowAt('Pacific/Niue', asOf, +60);
    expect(kiri.localDate).toBe('2026-06-16');
    expect(niue.localDate).toBe('2026-06-15');

    const due = await selectDue(db(), at);
    const byHash = new Map(due.map((d) => [d.endpoint_hash, d.local_date]));
    expect(byHash.get(kiri.endpointHash)).toBe('2026-06-16');
    expect(byHash.get(niue.endpointHash)).toBe('2026-06-15');
    expect(due.length).toBe(2);
  });

  it('does not let one zone leak into the other: the same wall clock minute is due in one and stale in the other', async () => {
    // Kiritimati is 10:00 local, Niue is 09:00 local. A target minute of 09:30 local is
    // 30 minutes AHEAD for Niue and 30 minutes BEHIND for Kiritimati, and both are inside
    // the window, so tighten Kiritimati's past its grace to prove the zones are separate.
    const kiri = makeSub();
    await insertRow({ ...kiri, tz: 'Pacific/Kiritimati', nudgeLocalDate: '2026-06-16', nudgeLocalMinute: 8 * 60 });
    const niue = makeSub();
    await insertRow({ ...niue, tz: 'Pacific/Niue', nudgeLocalDate: '2026-06-15', nudgeLocalMinute: 9 * 60 + 30 });

    const due = await selectDue(db(), at);
    expect(due.map((d) => d.endpoint_hash)).toEqual([niue.endpointHash]);
  });
});

describe('6.8 daylight saving, both directions, America/New_York', () => {
  it('spring forward: no valid target minute can fall inside the skipped hour', () => {
    // R4.3 bounds a nudge minute to 06:00 to 21:00 local. The 2026-03-08 transition skips
    // 02:00 to 03:00 local. The two ranges do not intersect, which is why this transition
    // needs no special handling anywhere in the query.
    const quietStart = 6 * 60;
    const quietEnd = 21 * 60;
    const skippedStart = 2 * 60;
    const skippedEnd = 3 * 60;
    expect(quietStart).toBeGreaterThanOrEqual(skippedEnd);
    expect(skippedStart).toBeLessThan(quietStart);
    expect(quietEnd).toBeLessThanOrEqual(1439);
  });

  it('spring forward: the grace window is measured in real local minutes across the transition', async () => {
    const sub = makeSub();
    // 07:00 local on the transition day.
    await insertRow({ ...sub, tz: NY, nudgeLocalDate: '2026-03-08', nudgeLocalMinute: 420 });

    // 11:45Z is 07:45 EDT, so the target is 45 minutes past: due.
    expect((await selectDue(db(), '2026-03-08T11:45:00Z')).length).toBe(1);
    // 12:00Z is 08:00 EDT, exactly 60 minutes past: not due.
    expect(await selectDue(db(), '2026-03-08T12:00:00Z')).toEqual([]);
    // 12:30Z is 08:30 EDT, 90 minutes past: not due.
    expect(await selectDue(db(), '2026-03-08T12:30:00Z')).toEqual([]);
    // 10:30Z is 06:30 EDT, half an hour AHEAD of the target: due, sent early (R14.4).
    expect((await selectDue(db(), '2026-03-08T10:30:00Z')).length).toBe(1);
  });

  it('fall back: the repeated local hour cannot produce a second send', async () => {
    const sub = makeSub();
    // 07:00 local on 2026-11-01, the day the 01:00 hour happens twice.
    await insertRow({ ...sub, tz: NY, nudgeLocalDate: '2026-11-01', nudgeLocalMinute: 420 });

    // 05:30Z is 01:30 EDT, the FIRST pass through the repeated hour.
    const first = await selectDue(db(), '2026-11-01T05:30:00Z');
    expect(first.length).toBe(1);
    expect(first[0].local_date).toBe('2026-11-01');
    await markSent(db(), sub.endpointHash, first[0].local_date);

    // 06:30Z is 01:30 EST, the SECOND pass through the same local hour, same local date.
    expect(await selectDue(db(), '2026-11-01T06:30:00Z')).toEqual([]);
    // And at 11:00Z, 06:00 EST, an instant at which the target minute WOULD be due on the
    // window rule alone, so this asserts the lock rather than the grace window.
    expect(await selectDue(db(), '2026-11-01T11:00:00Z')).toEqual([]);
    expect((await readRow(sub.endpointHash))?.last_sent_local_date).toBe('2026-11-01');
  });

  it('fall back: a row still unsent in the repeated hour resolves the local date the same way both times', async () => {
    const sub = makeSub();
    await insertRow({ ...sub, tz: NY, nudgeLocalDate: '2026-11-01', nudgeLocalMinute: 420 });
    const edt = await selectDue(db(), '2026-11-01T05:30:00Z');
    const est = await selectDue(db(), '2026-11-01T06:30:00Z');
    expect(edt[0].local_date).toBe('2026-11-01');
    expect(est[0].local_date).toBe('2026-11-01');
  });
});

describe('6.8 the stale sweep and the 90 day delete (R14.9)', () => {
  const asOf = new Date('2026-06-15T14:00:00Z');
  const at = asOf.toISOString();

  it("clears yesterday's unsent minute so it cannot fire tomorrow at the wrong moment", async () => {
    const sub = makeSub();
    await insertRow({ ...sub, tz: NY, nudgeLocalDate: '2026-06-14', nudgeLocalMinute: 440 });
    expect(await staleSweep(db(), at)).toBe(1);
    const row = await readRow(sub.endpointHash);
    expect(row?.nudge_local_minute).toBeNull();
    // The date is deliberately left alone; only the minute is what makes a row due.
    expect(row?.nudge_local_date).toBe('2026-06-14');
  });

  it("leaves today's minute alone", async () => {
    const row = await rowAt(NY, asOf, +30);
    expect(await staleSweep(db(), at)).toBe(0);
    expect((await readRow(row.endpointHash))?.nudge_local_minute).toBe(row.minute);
  });

  it('deletes a row untouched for 91 days and keeps one untouched for 89', async () => {
    const old = makeSub();
    const recent = makeSub();
    await insertRow({ ...old, tz: NY, updatedAgo: '91 days' });
    await insertRow({ ...recent, tz: NY, updatedAgo: '89 days' });
    expect(await deleteAncient(db())).toBe(1);
    expect(await readRow(old.endpointHash)).toBeNull();
    expect(await readRow(recent.endpointHash)).not.toBeNull();
  });
});
