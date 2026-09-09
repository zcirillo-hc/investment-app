/**
 * Plan v2 11.3, criteria 21, 22 and 25. The four subscription routes and the cron route's
 * bearer check, called as the plain `(req, res)` functions they are, against the real table.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import health from '../../api/health';
import subscribe from '../../api/push/subscribe';
import schedule from '../../api/push/schedule';
import unsubscribe from '../../api/push/unsubscribe';
import sendNudges from '../../api/cron/send-nudges';
import vapidPublicKey from '../../api/push/vapid-public-key';
import { countRows, makeSub, mockReq, mockRes, readRow, truncate } from './helpers';

async function post(handler: typeof subscribe, body: unknown) {
  const { res, recorded } = mockRes();
  await handler(mockReq({ method: 'POST', body, headers: { 'content-type': 'application/json' } }), res);
  return recorded;
}

beforeEach(async () => {
  await truncate();
});

describe('6.6 POST /api/push/subscribe', () => {
  it('creates exactly one row keyed by the sha256 of the endpoint (criterion 21)', async () => {
    const sub = makeSub();
    const r = await post(subscribe, {
      subscription: { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      tz: 'America/New_York',
    });
    expect(r.status).toBe(200);
    expect(r.json()).toEqual({ ok: true });
    expect(await countRows()).toBe(1);
    const row = await readRow(sub.endpointHash);
    expect(row?.endpoint_hash).toBe(sub.endpointHash);
    expect(row?.tz).toBe('America/New_York');
  });

  it('is idempotent: subscribing twice from the same browser still yields one row', async () => {
    const sub = makeSub();
    const body = {
      subscription: { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      tz: 'America/New_York',
    };
    expect((await post(subscribe, body)).status).toBe(200);
    expect((await post(subscribe, { ...body, tz: 'Europe/Lisbon' })).status).toBe(200);
    expect(await countRows()).toBe(1);
    expect((await readRow(sub.endpointHash))?.tz).toBe('Europe/Lisbon');
  });

  it('does not clear a pending minute when the same browser re-subscribes', async () => {
    const sub = makeSub();
    const body = {
      subscription: { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      tz: 'America/New_York',
    };
    await post(subscribe, body);
    await post(schedule, {
      endpoint: sub.endpoint,
      auth: sub.auth,
      tz: 'America/New_York',
      nudgeLocalDate: '2026-06-29',
      nudgeLocalMinute: 440,
    });
    await post(subscribe, body);
    const row = await readRow(sub.endpointHash);
    expect(row?.nudge_local_minute).toBe(440);
    expect(row?.nudge_local_date).toBe('2026-06-29');
  });

  it('rejects a spoofed time zone with a 400 and stores nothing (R14.3)', async () => {
    const sub = makeSub();
    for (const tz of ['Not/AZone', '+05:30', '"; drop table push_subs; --', '', 'x'.repeat(80)]) {
      const r = await post(subscribe, {
        subscription: { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        tz,
      });
      expect(r.status, tz).toBe(400);
    }
    expect(await countRows()).toBe(0);
  });

  it('accepts UTC, which is what a browser that cannot resolve a zone sends', async () => {
    const sub = makeSub();
    const r = await post(subscribe, {
      subscription: { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      tz: 'UTC',
    });
    expect(r.status).toBe(200);
  });

  it('rejects a malformed body with one fixed message that echoes nothing back', async () => {
    for (const body of [null, {}, { subscription: {} }, { subscription: { endpoint: 'http://x.test/a' } }, 'nonsense']) {
      const r = await post(subscribe, body);
      expect(r.status).toBe(400);
      expect(r.json()).toEqual({ ok: false, error: 'bad request' });
    }
    expect(await countRows()).toBe(0);
  });

  it('rejects every method but POST', async () => {
    const { res, recorded } = mockRes();
    await subscribe(mockReq({ method: 'GET' }), res);
    expect(recorded.status).toBe(405);
  });
});

describe('6.6 POST /api/push/schedule', () => {
  async function subscribed() {
    const sub = makeSub();
    await post(subscribe, {
      subscription: { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      tz: 'America/New_York',
    });
    return sub;
  }

  it('stores the date and the minute for a caller holding the auth secret', async () => {
    const sub = await subscribed();
    const r = await post(schedule, {
      endpoint: sub.endpoint,
      auth: sub.auth,
      tz: 'America/Denver',
      nudgeLocalDate: '2026-06-29',
      nudgeLocalMinute: 440,
    });
    expect(r.status).toBe(200);
    const row = await readRow(sub.endpointHash);
    expect(row?.nudge_local_date).toBe('2026-06-29');
    expect(row?.nudge_local_minute).toBe(440);
    expect(row?.tz).toBe('America/Denver');
  });

  it('clears the schedule on a null minute (R14.2)', async () => {
    const sub = await subscribed();
    await post(schedule, {
      endpoint: sub.endpoint,
      auth: sub.auth,
      tz: 'America/New_York',
      nudgeLocalDate: '2026-06-29',
      nudgeLocalMinute: 440,
    });
    const r = await post(schedule, {
      endpoint: sub.endpoint,
      auth: sub.auth,
      tz: 'America/New_York',
      nudgeLocalDate: '2026-06-29',
      nudgeLocalMinute: null,
    });
    expect(r.status).toBe(200);
    expect((await readRow(sub.endpointHash))?.nudge_local_minute).toBeNull();
  });

  it('returns 403 and changes nothing for a valid endpoint with the wrong auth', async () => {
    const sub = await subscribed();
    await post(schedule, {
      endpoint: sub.endpoint,
      auth: sub.auth,
      tz: 'America/New_York',
      nudgeLocalDate: '2026-06-29',
      nudgeLocalMinute: 440,
    });
    const r = await post(schedule, {
      endpoint: sub.endpoint,
      auth: 'wrongsecretwrongsecret',
      tz: 'America/New_York',
      nudgeLocalDate: '2026-07-01',
      nudgeLocalMinute: 999,
    });
    expect(r.status).toBe(403);
    const row = await readRow(sub.endpointHash);
    expect(row?.nudge_local_date).toBe('2026-06-29');
    expect(row?.nudge_local_minute).toBe(440);
  });

  it('returns 403 for an endpoint with no row, rather than revealing that it has none', async () => {
    const stranger = makeSub();
    const r = await post(schedule, {
      endpoint: stranger.endpoint,
      auth: stranger.auth,
      tz: 'America/New_York',
      nudgeLocalDate: '2026-06-29',
      nudgeLocalMinute: 440,
    });
    expect(r.status).toBe(403);
    expect(await countRows()).toBe(0);
  });

  it('rejects an invalid tz, an out of range minute and an impossible date', async () => {
    const sub = await subscribed();
    const base = { endpoint: sub.endpoint, auth: sub.auth, tz: 'America/New_York', nudgeLocalDate: '2026-06-29' };
    for (const bad of [
      { ...base, tz: 'Mars/Olympus', nudgeLocalMinute: 440 },
      { ...base, nudgeLocalMinute: 1440 },
      { ...base, nudgeLocalMinute: -1 },
      { ...base, nudgeLocalMinute: 12.5 },
      { ...base, nudgeLocalDate: '2026-02-31', nudgeLocalMinute: 440 },
      { ...base, nudgeLocalDate: 'yesterday', nudgeLocalMinute: 440 },
      { ...base, nudgeLocalDate: null, nudgeLocalMinute: 440 },
    ]) {
      const r = await post(schedule, bad);
      expect(r.status, JSON.stringify(bad.nudgeLocalMinute) + ' ' + String(bad.tz)).toBe(400);
    }
    expect((await readRow(sub.endpointHash))?.nudge_local_minute).toBeNull();
  });
});

describe('6.6 POST /api/push/unsubscribe', () => {
  it('deletes exactly one row and reports it (criterion 25)', async () => {
    const a = makeSub();
    const b = makeSub();
    for (const s of [a, b]) {
      await post(subscribe, {
        subscription: { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        tz: 'America/New_York',
      });
    }
    const r = await post(unsubscribe, { endpoint: a.endpoint, auth: a.auth });
    expect(r.status).toBe(200);
    expect(r.json()).toEqual({ ok: true, deleted: 1 });
    expect(await countRows()).toBe(1);
    expect(await readRow(a.endpointHash)).toBeNull();
    expect(await readRow(b.endpointHash)).not.toBeNull();
  });

  it('is idempotent: a second unsubscribe reports deleted 0 rather than failing', async () => {
    const sub = makeSub();
    await post(subscribe, {
      subscription: { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      tz: 'UTC',
    });
    expect((await post(unsubscribe, { endpoint: sub.endpoint, auth: sub.auth })).json()).toEqual({
      ok: true,
      deleted: 1,
    });
    expect((await post(unsubscribe, { endpoint: sub.endpoint, auth: sub.auth })).json()).toEqual({
      ok: true,
      deleted: 0,
    });
  });

  /**
   * Test report V2-5. This case used to assert 403, which is what made the route a
   * subscription oracle: an unsubscribed endpoint with the same wrong auth answered 200. The
   * refusal itself is the assertion that matters and it is unchanged (the row is still there),
   * but the STATUS now has to match what an unknown endpoint gets, or the pair of responses
   * still answers "is this endpoint subscribed" to a caller who cannot prove anything.
   */
  it('refuses to delete a row belonging to another browser when the auth is wrong, indistinguishably from an unknown endpoint', async () => {
    const sub = makeSub();
    await post(subscribe, {
      subscription: { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      tz: 'UTC',
    });
    const known = await post(unsubscribe, { endpoint: sub.endpoint, auth: 'notthesecret' });
    expect(await countRows(), 'the row is not deleted without the secret').toBe(1);

    const unknown = await post(unsubscribe, { endpoint: makeSub().endpoint, auth: 'notthesecret' });
    expect([known.status, known.json()], 'a wrong auth must not reveal that a row exists').toEqual([
      unknown.status,
      unknown.json(),
    ]);
    expect(known.status).toBe(200);
    expect(known.json()).toEqual({ ok: true, deleted: 0 });
  });
});

describe('6.6 GET /api/health', () => {
  it('answers 200 with JSON and the applied migration id (criterion 19)', async () => {
    const { res, recorded } = mockRes();
    await health(mockReq({ method: 'GET' }), res);
    expect(recorded.status).toBe(200);
    expect(recorded.headers['content-type']).toContain('application/json');
    expect(recorded.json()).toEqual({ ok: true, db: true, migration: '0001' });
  });
});

describe('6.6 GET /api/push/vapid-public-key', () => {
  it('returns the public key as { key }, cacheable for an hour', async () => {
    const { res, recorded } = mockRes();
    await vapidPublicKey(mockReq({ method: 'GET' }), res);
    expect(recorded.status).toBe(200);
    const body = recorded.json<{ key: string }>();
    expect(typeof body.key).toBe('string');
    expect(body.key.length).toBeGreaterThan(80);
    expect(recorded.headers['cache-control']).toBe('public, max-age=3600');
  });

  it('never returns the private key', async () => {
    const { res, recorded } = mockRes();
    await vapidPublicKey(mockReq({ method: 'GET' }), res);
    const priv = process.env.VAPID_PRIVATE_KEY ?? '';
    expect(priv.length).toBeGreaterThan(8);
    expect(recorded.body.includes(priv)).toBe(false);
  });
});

describe('6.8 GET /api/cron/send-nudges, the bearer check (criterion 22)', () => {
  async function call(headers: Record<string, string>) {
    const { res, recorded } = mockRes();
    await sendNudges(mockReq({ method: 'GET', headers }), res);
    return recorded;
  }

  it('returns 401 with no bearer, an empty bearer, and a wrong bearer', async () => {
    expect((await call({})).status).toBe(401);
    expect((await call({ authorization: 'Bearer ' })).status).toBe(401);
    expect((await call({ authorization: 'Bearer wrong' })).status).toBe(401);
    expect((await call({ authorization: process.env.CRON_SECRET ?? 'x' })).status).toBe(401);
  });

  it('returns 200 and the four counts with the correct bearer', async () => {
    const secret = process.env.CRON_SECRET;
    expect(secret, 'CRON_SECRET must be in .env.local for this suite').toBeTruthy();
    const r = await call({ authorization: `Bearer ${secret}` });
    expect(r.status).toBe(200);
    expect(Object.keys(r.json()).sort()).toEqual(['deleted', 'due', 'failed', 'sent']);
  });

  it('rejects a POST even with the correct bearer', async () => {
    const { res, recorded } = mockRes();
    await sendNudges(mockReq({ method: 'POST', headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }), res);
    expect(recorded.status).toBe(405);
  });
});
