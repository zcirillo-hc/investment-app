/**
 * Plan v2 section 6.6. THE API SEAM.
 *
 * ==========================================================================================
 * This is the only file in `src/` that knows a network route exists. Everything above it
 * (`src/lib/push.ts`, the Nudges card, the store) talks to the `PushApi` interface below and
 * never to `fetch`. The backend pass fills in the four routes named here; nothing in the UI
 * changes when it does, and nothing here may ever import from `api/` (plan 6.1: anything
 * reachable from `src/` ends up in the browser bundle, and the VAPID private key must never be
 * reachable from there).
 * ==========================================================================================
 *
 * The shapes are the ones plan 6.6 tabulates, verbatim:
 *
 *   GET  /api/health                  -> { ok, migration }
 *   GET  /api/push/vapid-public-key   -> { key }
 *   POST /api/push/subscribe          { subscription: { endpoint, keys: { p256dh, auth } }, tz }
 *   POST /api/push/schedule           { endpoint, auth, tz, nudgeLocalDate, nudgeLocalMinute }
 *   POST /api/push/unsubscribe        { endpoint, auth }  -> { ok, deleted }
 *
 * Two rules from 6.6 and R14.11 are enforced here rather than left to each caller:
 * nothing personal ever goes in a URL or a query string, so every body travels as JSON on a
 * POST; and every call has a five second timeout and a caught rejection, so no screen can
 * block on the network.
 */

export const API_TIMEOUT_MS = 5000;

/** What a caller gets back. Never a thrown error: R14.11 forbids a fetch throwing into React. */
export type ApiResult<T> = { ok: true; value: T } | { ok: false; kind: 'network' | 'server' };

export interface PushSubscriptionPayload {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface SchedulePayload {
  endpoint: string;
  auth: string;
  tz: string;
  nudgeLocalDate: string | null;
  /** A null minute clears the schedule (R14.2). */
  nudgeLocalMinute: number | null;
}

export interface PushApi {
  vapidPublicKey(): Promise<ApiResult<string>>;
  subscribe(subscription: PushSubscriptionPayload, tz: string): Promise<ApiResult<true>>;
  schedule(payload: SchedulePayload): Promise<ApiResult<true>>;
  unsubscribe(endpoint: string, auth: string): Promise<ApiResult<{ deleted: number }>>;
}

async function call<T>(path: string, init: RequestInit, pick: (body: unknown) => T | null): Promise<ApiResult<T>> {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), API_TIMEOUT_MS) : null;
  try {
    const res = await fetch(path, { ...init, signal: controller?.signal });
    if (!res.ok) return { ok: false, kind: 'server' };
    // 6.6, criterion 19: the SPA rewrite used to swallow /api and hand back the HTML shell
    // with a 200, so a non-JSON body here is a routing fault, not a parse bug. It is reported
    // as a server problem so the Nudges card says something true rather than crashing.
    const type = res.headers.get('content-type') ?? '';
    if (!type.includes('application/json')) return { ok: false, kind: 'server' };
    const value = pick(await res.json());
    if (value === null) return { ok: false, kind: 'server' };
    return { ok: true, value };
  } catch {
    return { ok: false, kind: 'network' };
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}

function postJson(body: unknown): RequestInit {
  return { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
}

function okTrue(body: unknown): true | null {
  return typeof body === 'object' && body !== null && (body as { ok?: unknown }).ok === true ? true : null;
}

/** The real implementation. Every route below is written by the backend pass. */
export const httpPushApi: PushApi = {
  vapidPublicKey: () =>
    call('/api/push/vapid-public-key', { method: 'GET' }, (body) => {
      const key = (body as { key?: unknown })?.key;
      return typeof key === 'string' && key.length > 0 ? key : null;
    }),

  subscribe: (subscription, tz) => call('/api/push/subscribe', postJson({ subscription, tz }), okTrue),

  schedule: (payload) => call('/api/push/schedule', postJson(payload), okTrue),

  unsubscribe: (endpoint, auth) =>
    call('/api/push/unsubscribe', postJson({ endpoint, auth }), (body) => {
      const b = body as { ok?: unknown; deleted?: unknown };
      if (b?.ok !== true) return null;
      return { deleted: typeof b.deleted === 'number' ? b.deleted : 0 };
    }),
};

/**
 * The swap point. Tests install a fake; the app never calls this. Keeping the indirection here
 * rather than in `push.ts` means the lifecycle code has one shape in every environment.
 */
let current: PushApi = httpPushApi;

export function getPushApi(): PushApi {
  return current;
}

export function setPushApi(api: PushApi): void {
  current = api;
}

export function resetPushApi(): void {
  current = httpPushApi;
}
