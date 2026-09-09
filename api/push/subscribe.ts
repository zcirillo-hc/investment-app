/**
 * Plan v2 6.6. `POST /api/push/subscribe`.
 *
 * Upserts on the endpoint hash, so a repeat subscribe is idempotent and never creates a
 * second row for the same browser (criterion 21). The service worker calls this again after
 * a `pushsubscriptionchange` with a rotated endpoint, which is a different hash and
 * therefore a different row; the worker posts the old endpoint to `/api/push/unsubscribe`
 * immediately afterwards so the old row goes (6.5 step 5).
 *
 * A repeat subscribe deliberately does NOT clear `nudge_local_date` or `nudge_local_minute`:
 * the app re-subscribes on every open in some browsers, and dropping the pending minute
 * there would silently cancel that morning's nudge. It does reset `fail_count` and
 * `enabled`, because a browser that just subscribed is by definition reachable again.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb, table } from '../_lib/db';
import { badRequest, hashEndpoint, methodOnly, parseSubscribeBody, readJsonBody, sendJson } from '../_lib/validate';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (!methodOnly(req, res, 'POST')) return;

  const body = parseSubscribeBody(readJsonBody(req));
  if (!body) {
    badRequest(res);
    return;
  }

  try {
    const sql = getDb();
    await sql.query(
      `insert into ${table('push_subs')} (endpoint_hash, endpoint, p256dh, auth, tz)
       values ($1, $2, $3, $4, $5)
       on conflict (endpoint_hash) do update
          set endpoint   = excluded.endpoint,
              p256dh     = excluded.p256dh,
              auth       = excluded.auth,
              tz         = excluded.tz,
              enabled    = true,
              fail_count = 0,
              updated_at = now()`,
      [hashEndpoint(body.endpoint), body.endpoint, body.p256dh, body.auth, body.tz],
    );
  } catch {
    // 6.6: no route logs an endpoint, an auth secret or a time zone, and this catch is the
    // one place a driver error would carry all three back out in a message.
    sendJson(res, 500, { ok: false, error: 'storage unavailable' });
    return;
  }

  sendJson(res, 200, { ok: true });
}
