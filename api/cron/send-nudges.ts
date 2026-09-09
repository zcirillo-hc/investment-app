/**
 * Plan v2 6.8 and 11.4. The scheduler.
 *
 * `GET /api/cron/send-nudges`, `Authorization: Bearer $CRON_SECRET`, returning
 * `{ due, sent, deleted, failed }`.
 *
 * It is trigger agnostic by design (6.8a). Vercel Cron sends the bearer automatically once a
 * day on production; the same authenticated call made by hand, against `vercel dev` or the
 * deployed URL, is indistinguishable from it. That is what makes criterion 22 checkable on
 * demand rather than once every 24 hours, and it is why the route holds no state between
 * calls: the per local day lock lives in `last_sent_local_date`, not in the caller.
 *
 * The clock is always the real one here. `runSend`'s `asOf` parameter exists for the
 * integration suite's daylight saving cases and is deliberately NOT reachable from a query
 * string, a header or a body: an attacker who could move this route's clock could replay a
 * send or skip a day for everyone.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_lib/db';
import { runSend } from '../_lib/due';
import { sendOne } from '../_lib/push';
import { methodOnly, secretEquals, sendJson } from '../_lib/validate';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (!methodOnly(req, res, 'GET')) return;

  const expected = process.env.CRON_SECRET;
  if (!expected) {
    // Refusing to run beats running unauthenticated. A deploy missing the secret is a
    // configuration fault, and it shows up here rather than as an open send loop.
    sendJson(res, 500, { ok: false, error: 'not configured' });
    return;
  }

  const header = req.headers.authorization ?? '';
  const presented = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
  if (presented === '' || !secretEquals(presented, expected)) {
    sendJson(res, 401, { ok: false, error: 'unauthorized' });
    return;
  }

  try {
    const report = await runSend({ sql: getDb(), sender: sendOne });
    // 6.6 names exactly these four. `swept` and `expired` stay internal so the documented
    // shape is the shape, and so nothing about retention is inferable from a bearer holder.
    sendJson(res, 200, { due: report.due, sent: report.sent, deleted: report.deleted, failed: report.failed });
  } catch {
    sendJson(res, 500, { ok: false, error: 'send run failed' });
  }
}
