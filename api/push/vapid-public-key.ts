/**
 * Plan v2 6.6 and 6.5 step 2. Returns the VAPID PUBLIC key as `{ key }`.
 *
 * The public key is not a secret: the browser has to hold it to subscribe, and it is
 * recoverable from any subscription. The private key is never read in this file.
 *
 * Cacheable for an hour per 6.6. It changes only when the key pair is rotated, which is a
 * deliberate act that invalidates every existing subscription anyway.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { methodOnly, sendJson } from '../_lib/validate.js';

export default function handler(req: VercelRequest, res: VercelResponse): void {
  if (!methodOnly(req, res, 'GET')) return;

  const key = process.env.VAPID_PUBLIC_KEY;
  if (!key) {
    // The client treats this as a server error, leaves the toggle off, and says the nudge
    // service could not be reached (6.12). It never half enables anything.
    sendJson(res, 500, { ok: false, error: 'not configured' });
    return;
  }

  res.setHeader('cache-control', 'public, max-age=3600');
  sendJson(res, 200, { key });
}
