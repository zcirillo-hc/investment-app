/**
 * Plan v2 6.6, R14.9 and 6.9. `POST /api/push/unsubscribe`.
 *
 * Deletes the row, which is the entire server side record of a person. There is no archive,
 * no backup and no second table, so this is a complete deletion.
 *
 * Idempotent on purpose. The client calls it when nudges are turned off, when everything is
 * deleted, and from the service worker after an endpoint rotation, by which time a 404 or
 * 410 from the push service may already have removed the row. An endpoint with no row is a
 * success with `deleted: 0`, not an error, because the caller's intent has been satisfied.
 * An endpoint that DOES have a row still has to present the matching `auth` secret (6.6).
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb, table } from '../_lib/db';
import {
  badRequest,
  hashEndpoint,
  methodOnly,
  parseUnsubscribeBody,
  readJsonBody,
  secretEquals,
  sendJson,
} from '../_lib/validate';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (!methodOnly(req, res, 'POST')) return;

  const body = parseUnsubscribeBody(readJsonBody(req));
  if (!body) {
    badRequest(res);
    return;
  }

  const endpointHash = hashEndpoint(body.endpoint);
  let deleted = 0;

  try {
    const sql = getDb();
    const rows = (await sql.query(`select auth from ${table('push_subs')} where endpoint_hash = $1`, [
      endpointHash,
    ])) as unknown as Array<{ auth: string }>;

    if (rows.length > 0) {
      if (!secretEquals(rows[0].auth, body.auth)) {
        sendJson(res, 403, { ok: false, error: 'forbidden' });
        return;
      }
      const gone = (await sql.query(
        `delete from ${table('push_subs')} where endpoint_hash = $1 returning endpoint_hash`,
        [endpointHash],
      )) as unknown as unknown[];
      deleted = gone.length;
    }
  } catch {
    sendJson(res, 500, { ok: false, error: 'storage unavailable' });
    return;
  }

  sendJson(res, 200, { ok: true, deleted });
}
