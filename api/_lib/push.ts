/**
 * Plan v2 6.6 and R14.6 to R14.8. The `web-push` wiring, `sendOne()`, and the `WebPushError`
 * mapping the scheduler acts on.
 *
 * This module runs on the Node.js runtime and never on the edge: `web-push` needs Node's
 * crypto. No file under `api/` declares `runtime: 'edge'` (6.6).
 *
 * Nothing here logs an endpoint, an auth secret or a payload.
 */
import webpush, { WebPushError } from 'web-push';

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * R14.8, and it is the whole reason the scheduler needs a result type rather than a boolean.
 *
 *  - `gone`         404 or 410. The subscription no longer exists. Delete the row.
 *  - `rateLimited`  429. Leave the row untouched and increment nothing.
 *  - `failed`       anything else. Increment `fail_count`; the fifth one deletes the row.
 */
export type SendOutcome =
  | { kind: 'ok' }
  | { kind: 'gone'; status: number }
  | { kind: 'rateLimited' }
  | { kind: 'failed'; status: number | null };

export type Sender = (target: PushTarget, payload: string) => Promise<SendOutcome>;

/** R14.6. The payload is exactly this and carries nothing else. */
export function nudgePayload(localDate: string): string {
  return JSON.stringify({ v: 2, t: 'nudge', d: localDate });
}

let configured = false;

/**
 * Lazy, for the same reason `getDb()` is lazy (6.7): importing this module during a build or
 * a type check must not require the secrets to exist.
 */
export function configureVapid(): void {
  if (configured) return;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) {
    throw new Error('VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT must all be set');
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

/** Test only, so a suite can change the environment between cases. */
export function resetVapid(): void {
  configured = false;
}

export function classifyStatus(status: number | null): SendOutcome {
  if (status === null) return { kind: 'failed', status: null };
  if (status >= 200 && status < 300) return { kind: 'ok' };
  if (status === 404 || status === 410) return { kind: 'gone', status };
  if (status === 429) return { kind: 'rateLimited' };
  return { kind: 'failed', status };
}

/** The real sender. `api/_lib/due.ts` takes it as an argument so tests can inject their own. */
export const sendOne: Sender = async (target, payload) => {
  configureVapid();
  try {
    await webpush.sendNotification(
      { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
      payload,
      { TTL: 3600 },
    );
    return { kind: 'ok' };
  } catch (err) {
    if (err instanceof WebPushError) return classifyStatus(err.statusCode);
    return { kind: 'failed', status: null };
  }
};
