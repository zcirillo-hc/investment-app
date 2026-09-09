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
 *
 * Test report V2-5. Those two paragraphs used to disagree with each other: a wrong `auth`
 * against a subscribed endpoint answered 403 and against an unsubscribed one answered 200,
 * which told an unauthenticated caller whether a given endpoint is subscribed. That is the
 * exact distinction `schedule.ts` refuses to draw, and the reasoning written there applies
 * here unchanged.
 *
 * The response is now uniform: a caller who has not proved they are the subscriber always
 * gets `200 {ok: true, deleted: 0}`, whether the row exists or not. `deleted: 0` is the
 * literal truth in both cases, idempotency survives (which uniform 403 would have broken:
 * the second unsubscribe of a pair, and the "delete everything" flow after a 410 has already
 * removed the row, both legitimately find nothing), and the row is still not deleted without
 * the secret. Only a caller who presents the matching `auth` learns anything, and by then
 * they have proved they are the subscriber.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb, table } from '../_lib/db.js';
import {
  badRequest,
  hashEndpoint,
  methodOnly,
  parseUnsubscribeBody,
  readJsonBody,
  secretEquals,
  sendJson,
} from '../_lib/validate.js';

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

    // V2-5: no early return on a mismatch. A wrong secret falls through to the same
    // `{ok: true, deleted: 0}` an unknown endpoint gets, so the two are indistinguishable.
    if (rows.length > 0 && secretEquals(rows[0].auth, body.auth)) {
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
