/**
 * Plan v2 sections 6.2 and 6.5. Client side support detection and the Web Push lifecycle.
 *
 * No library: the browser's own `PushManager` is the API. Every call here is wrapped so that a
 * failure is logged, surfaced once in the Nudges card, and never blocks, retries in a loop or
 * throws into React (6.12, R14.11). Nothing in this file decides whether a nudge is warranted:
 * that is R4, it happens in the domain, on the device, and the server only ever gets a date and
 * a minute (R14.1).
 *
 * The network lives behind `src/lib/pushApi.ts`, which is the seam the backend pass fills in.
 */
import { set as idbSet } from 'idb-keyval';
import { getPushApi, type ApiResult, type PushSubscriptionPayload, type SchedulePayload } from './pushApi';
import type { PushSupportState } from '../domain/types';

export type { PushSupportState };

/** 6.5 step 1. Pure and cheap, so the Nudges card may call it on every render. */
export function supportState(): PushSupportState {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return 'unsupported';
  // The value, not the key. `navigator.serviceWorker` is undefined in an insecure context
  // even though the property is present, and a key check would send us into a dereference.
  const hasSw = Boolean(navigator.serviceWorker);
  const hasNotification = typeof Notification !== 'undefined';
  if (!hasSw || !hasNotification) return 'unsupported';

  // 6.2 state 1. On iOS, Web Push exists from 16.4 and only for a site added to the Home
  // Screen. This check runs BEFORE the permission and PushManager checks on purpose: in a
  // plain Safari tab, subscribing either throws or, worse, consumes the user's one willing tap
  // on a prompt that cannot lead anywhere.
  if (isAppleTouchDevice() && !isStandalone()) return 'needs-ios-install';

  // The fourth state (6.2). Once denied, `requestPermission()` is never called again.
  if (Notification.permission === 'denied') return 'denied';

  // 6.2 state 2, older than iOS 16.4: standalone but no PushManager at all.
  if (!('PushManager' in window)) return 'unsupported';
  return 'ready';
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const mm = typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches;
  const legacy = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return mm || legacy;
}

export function isAppleTouchDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  // iPadOS 13 and later report a Mac user agent, so touch points are the only tell.
  return /Macintosh/.test(ua) && typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1;
}

/**
 * 6.5 step 5. The worker cannot reach the app's code, so it re-subscribes on a
 * `pushsubscriptionchange` using the application server key cached here at subscribe time.
 * `public/sw.js` reads this exact key; the constant is duplicated there and asserted by
 * `tests/unit/sw-constants.test.ts`.
 */
export const APP_SERVER_KEY_KEY = 'spare-change-app-server-key';

/** R14.3: the IANA name, never an offset, because an offset is wrong twice a year. */
export function resolvedTimeZone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof tz === 'string' && tz.length > 0 ? tz : 'UTC';
  } catch {
    return 'UTC';
  }
}

export function timeZoneIsFallback(): boolean {
  return resolvedTimeZone() === 'UTC' && (() => {
    try {
      return !Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return true;
    }
  })();
}

/** 6.5 step 2: the VAPID key arrives base64url and `subscribe` wants bytes. */
export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized);
  // Backed by a plain ArrayBuffer rather than the ArrayBufferLike the no-argument constructor
  // infers, because `applicationServerKey` wants a BufferSource and a SharedArrayBuffer is not
  // one.
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Plan 6.10: the identity is the endpoint, and this hash is only ever for display and for the
 * delete flow. The server computes its own copy as the primary key; a mismatch here would show
 * a wrong eight characters on a settings card and nothing more.
 */
export async function hashEndpoint(endpoint: string): Promise<string | null> {
  try {
    const bytes = new TextEncoder().encode(endpoint);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}

function toPayload(sub: PushSubscription): PushSubscriptionPayload | null {
  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  const endpoint = json.endpoint ?? sub.endpoint;
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!endpoint || !p256dh || !auth) return null;
  return { endpoint, keys: { p256dh, auth } };
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  try {
    if (!navigator.serviceWorker) return null;
    return (await navigator.serviceWorker.getRegistration('/')) ?? (await navigator.serviceWorker.ready);
  } catch {
    return null;
  }
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  try {
    const reg = await registration();
    if (!reg || !reg.pushManager) return null;
    return await reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}

export type SubscribeOutcome =
  | { ok: true; endpoint: string; auth: string; endpointHash: string | null; tz: string }
  | { ok: false; kind: 'permission' | 'network' | 'server' | 'unsupported' };

/**
 * 6.5 step 2, in order: fetch the key, subscribe with the browser, then tell the server.
 *
 * The permission prompt is requested from the tap itself, which iOS requires, and only ever
 * after the 9.4a panel has been shown and accepted (6.2). If any step fails, the browser
 * subscription is rolled back, because a local subscription the server does not know about is
 * exactly the "the UI says nudges are on and nothing will arrive" failure risk 9 names.
 */
export async function subscribe(): Promise<SubscribeOutcome> {
  const state = supportState();
  if (state !== 'ready') return { ok: false, kind: state === 'denied' ? 'permission' : 'unsupported' };

  let permission: NotificationPermission;
  try {
    permission = await Notification.requestPermission();
  } catch {
    return { ok: false, kind: 'permission' };
  }
  if (permission !== 'granted') return { ok: false, kind: 'permission' };

  const keyResult = await getPushApi().vapidPublicKey();
  if (!keyResult.ok) return { ok: false, kind: keyResult.kind };

  const reg = await registration();
  if (!reg || !reg.pushManager) return { ok: false, kind: 'unsupported' };

  const appServerKey = urlBase64ToUint8Array(keyResult.value);
  try {
    await idbSet(APP_SERVER_KEY_KEY, appServerKey);
  } catch {
    // The worker will not be able to re-subscribe on a rotation, and the next app open will.
  }

  let sub: PushSubscription;
  try {
    const existing = await reg.pushManager.getSubscription();
    sub =
      existing ??
      (await reg.pushManager.subscribe({
        // Mandatory in Chromium, and it matches what the worker actually does: every push
        // branch ends in exactly one showNotification (R14.7).
        userVisibleOnly: true,
        applicationServerKey: appServerKey,
      }));
  } catch {
    return { ok: false, kind: 'permission' };
  }

  const payload = toPayload(sub);
  if (!payload) return { ok: false, kind: 'unsupported' };
  const tz = resolvedTimeZone();
  const posted = await getPushApi().subscribe(payload, tz);
  if (!posted.ok) {
    // Roll back rather than leave a browser subscribed to a server that never heard of it.
    try {
      await sub.unsubscribe();
    } catch {
      /* nothing further to do; the row was never created */
    }
    return { ok: false, kind: posted.kind };
  }
  return {
    ok: true,
    endpoint: payload.endpoint,
    auth: payload.keys.auth,
    endpointHash: await hashEndpoint(payload.endpoint),
    tz,
  };
}

/**
 * 6.5 step 4: tell the server first, then drop the local subscription, so a network failure
 * leaves the row to be cleaned up by its own 404 or 410 handling rather than orphaning it.
 * Turning nudges off always succeeds locally (criterion 25), and the caller says honestly
 * whether the row could be deleted yet (copy in 9.5).
 */
export type UnsubscribeOutcome = { localOk: boolean; serverOk: boolean };

export async function unsubscribeEverywhere(): Promise<UnsubscribeOutcome> {
  const sub = await currentSubscription();
  if (!sub) return { localOk: true, serverOk: true };
  const payload = toPayload(sub);
  let serverOk = false;
  if (payload) {
    const r = await getPushApi().unsubscribe(payload.endpoint, payload.keys.auth);
    serverOk = r.ok;
  }
  let localOk = false;
  try {
    localOk = await sub.unsubscribe();
  } catch {
    localOk = false;
  }
  return { localOk, serverOk };
}

/**
 * 6.5 step 3 and R14.2. Debounced to at most one call every ten seconds, and skipped entirely
 * when the values are unchanged since the last successful call. The caller passes the last
 * successful values (the store tracks them in `push.lastScheduleSent`), so this module holds
 * no state the store cannot see.
 */
export const SCHEDULE_DEBOUNCE_MS = 10_000;

let lastCallAt = 0;
let pendingTimer: ReturnType<typeof setTimeout> | null = null;

export function resetScheduleDebounce(): void {
  lastCallAt = 0;
  if (pendingTimer !== null) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }
}

export function scheduleUnchanged(
  last: { date: string; minute: number | null } | null,
  next: { date: string; minute: number | null },
): boolean {
  return last !== null && last.date === next.date && last.minute === next.minute;
}

export type SyncOutcome = { sent: false; reason: 'unchanged' | 'no-subscription' | 'debounced' } | { sent: true; result: ApiResult<true> };

export async function syncSchedule(
  next: { date: string; minute: number | null },
  last: { date: string; minute: number | null } | null,
  now: number = Date.now(),
): Promise<SyncOutcome> {
  if (scheduleUnchanged(last, next)) return { sent: false, reason: 'unchanged' };
  if (now - lastCallAt < SCHEDULE_DEBOUNCE_MS && lastCallAt !== 0) return { sent: false, reason: 'debounced' };
  const sub = await currentSubscription();
  const payload = sub ? toPayload(sub) : null;
  if (!payload) return { sent: false, reason: 'no-subscription' };
  lastCallAt = now;
  const body: SchedulePayload = {
    endpoint: payload.endpoint,
    auth: payload.keys.auth,
    tz: resolvedTimeZone(),
    nudgeLocalDate: next.date,
    // R14.2: a null minute clears the schedule. The body carries no place id, no display
    // name, no amount, no jar figure, no counter and no event (R11.6).
    nudgeLocalMinute: next.minute,
  };
  return { sent: true, result: await getPushApi().schedule(body) };
}
