/**
 * Plan v2 6.6 and R14.2. `POST /api/push/schedule`.
 *
 * Sets or clears the next nudge minute. The body carries no place id, no display name, no
 * amount, no jar figure, no counter and no event: five fields, and three of them describe a
 * clock.
 *
 * Authorisation is 6.6's model in full: the caller presents the endpoint AND the
 * subscription's own `auth` secret, compared against the stored value in constant time.
 * There is no session and no token. A mismatch returns 403 and changes nothing.
 *
 * An endpoint with no row also returns 403 rather than 404. The distinction would tell an
 * unauthenticated caller whether a given endpoint is subscribed, and the honest answer to
 * both cases is the same one: you have not proved you are the subscriber.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb, table } from '../_lib/db.js';
import {
  badRequest,
  hashEndpoint,
  methodOnly,
  parseScheduleBody,
  readJsonBody,
  secretEquals,
  sendJson,
} from '../_lib/validate.js';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (!methodOnly(req, res, 'POST')) return;

  // R14.3: an invalid or spoofed tz is rejected with a 400 and nothing is stored. A bad row
  // in a shared query can take out the whole cron run for everyone in the batch, so this is
  // the point at which that has to be stopped.
  const body = parseScheduleBody(readJsonBody(req));
  if (!body) {
    badRequest(res);
    return;
  }

  const endpointHash = hashEndpoint(body.endpoint);

  try {
    const sql = getDb();
    const rows = (await sql.query(`select auth from ${table('push_subs')} where endpoint_hash = $1`, [
      endpointHash,
    ])) as unknown as Array<{ auth: string }>;

    if (rows.length === 0 || !secretEquals(rows[0].auth, body.auth)) {
      sendJson(res, 403, { ok: false, error: 'forbidden' });
      return;
    }

    await sql.query(
      `update ${table('push_subs')}
          set tz                 = $2,
              nudge_local_date   = $3::date,
              nudge_local_minute = $4,
              enabled            = true,
              updated_at         = now()
        where endpoint_hash = $1`,
      [endpointHash, body.tz, body.nudgeLocalDate, body.nudgeLocalMinute],
    );
  } catch {
    sendJson(res, 500, { ok: false, error: 'storage unavailable' });
    return;
  }

  sendJson(res, 200, { ok: true });
}
