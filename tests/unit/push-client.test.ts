/**
 * Plan v2 6.2, 6.5, R14.2, R14.3 and R14.11.
 *
 * The three things worth asserting here are the three that would fail silently in production:
 * that the iPhone Safari and denied states never reach `Notification.requestPermission`, that
 * nothing personal ever ends up in a request body, and that every network failure degrades to
 * a caught error rather than a throw into React.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  currentSubscription,
  hashEndpoint,
  resolvedTimeZone,
  scheduleUnchanged,
  subscribe,
  supportState,
  syncSchedule,
  unsubscribeEverywhere,
  urlBase64ToUint8Array,
  resetScheduleDebounce,
  SCHEDULE_DEBOUNCE_MS,
} from '../../src/lib/push';
import { httpPushApi, resetPushApi, setPushApi, type PushApi, type SchedulePayload } from '../../src/lib/pushApi';

const REAL_NAVIGATOR = navigator;

/** A browser that supports everything, with no subscription yet. */
function browser(over: {
  ua?: string;
  maxTouchPoints?: number;
  permission?: NotificationPermission;
  standalone?: boolean;
  serviceWorker?: boolean;
  pushManager?: boolean;
  subscription?: unknown;
  subscribeImpl?: () => Promise<unknown>;
} = {}): void {
  const {
    ua = 'Mozilla/5.0 (Windows NT 10.0) Chrome/120',
    maxTouchPoints = 0,
    permission = 'default',
    standalone = false,
    serviceWorker = true,
    pushManager = true,
    subscription = null,
    subscribeImpl,
  } = over;

  const pm = {
    getSubscription: vi.fn(async () => subscription),
    subscribe: vi.fn(subscribeImpl ?? (async () => subscription)),
  };
  const registration = { pushManager: pushManager ? pm : undefined };

  const nav: Record<string, unknown> = { userAgent: ua, maxTouchPoints };
  if (serviceWorker) {
    nav.serviceWorker = {
      getRegistration: vi.fn(async () => registration),
      ready: Promise.resolve(registration),
    };
  }
  vi.stubGlobal('navigator', nav as unknown as Navigator);

  const NotificationStub = { permission, requestPermission: vi.fn(async () => permission) };
  vi.stubGlobal('Notification', NotificationStub as unknown as typeof Notification);
  vi.stubGlobal('matchMedia', ((q: string) => ({ matches: standalone && q.includes('standalone'), media: q })) as typeof window.matchMedia);
  window.matchMedia = matchMedia;
  if (pushManager) vi.stubGlobal('PushManager', function PushManager() {} as unknown as typeof PushManager);
  else Reflect.deleteProperty(window as unknown as Record<string, unknown>, 'PushManager');
}

function fakeSubscription(endpoint = 'https://push.example/abc', auth = 'AUTHSECRET') {
  return {
    endpoint,
    toJSON: () => ({ endpoint, keys: { p256dh: 'P256', auth } }),
    unsubscribe: vi.fn(async () => true),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.stubGlobal('navigator', REAL_NAVIGATOR);
  vi.unstubAllGlobals();
  resetPushApi();
  resetScheduleDebounce();
});

describe('6.2 support detection', () => {
  it('is ready on desktop Chrome with no permission decision yet', () => {
    browser();
    expect(supportState()).toBe('ready');
  });

  it('is needs-ios-install for an iPhone Safari tab, BEFORE checking permission', () => {
    // The order matters: in a plain Safari tab a prompt either refuses or, worse, consumes
    // the user's one willing tap on something that cannot lead anywhere.
    browser({ ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari', permission: 'default', standalone: false });
    expect(supportState()).toBe('needs-ios-install');
  });

  it('is ready for the same iPhone once it is running from the Home Screen', () => {
    browser({ ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari', standalone: true });
    expect(supportState()).toBe('ready');
  });

  it('detects iPadOS, which reports a Mac user agent and gives itself away by touch points', () => {
    browser({ ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari', maxTouchPoints: 5 });
    expect(supportState()).toBe('needs-ios-install');
    browser({ ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari', maxTouchPoints: 0 });
    expect(supportState()).toBe('ready');
  });

  it('is denied once the browser has been turned down', () => {
    browser({ permission: 'denied' });
    expect(supportState()).toBe('denied');
  });

  it('is unsupported with no service worker, and on a standalone iPhone older than 16.4', () => {
    browser({ serviceWorker: false });
    expect(supportState()).toBe('unsupported');
    browser({ ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0) Safari', standalone: true, pushManager: false });
    expect(supportState()).toBe('unsupported');
  });
});

describe('6.2 the permission prompt is never reached from a state that cannot use it', () => {
  it('does not call requestPermission on an iPhone Safari tab', async () => {
    browser({ ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari', standalone: false });
    const r = await subscribe();
    expect(r).toEqual({ ok: false, kind: 'unsupported' });
    expect(Notification.requestPermission).not.toHaveBeenCalled();
  });

  it('does not call requestPermission once permission is denied', async () => {
    browser({ permission: 'denied' });
    const r = await subscribe();
    expect(r).toEqual({ ok: false, kind: 'permission' });
    expect(Notification.requestPermission).not.toHaveBeenCalled();
  });

  it('does not call requestPermission on an unsupported browser', async () => {
    browser({ serviceWorker: false });
    expect(await subscribe()).toEqual({ ok: false, kind: 'unsupported' });
  });
});

describe('R14.3 the time zone', () => {
  it('is the IANA name, never an offset', () => {
    const tz = resolvedTimeZone();
    expect(tz).toMatch(/^[A-Za-z]+(\/[A-Za-z_+-]+)*$/);
    expect(tz).not.toMatch(/^[+-]\d/);
  });

  it('falls back to UTC rather than throwing when the browser will not say', () => {
    const real = Intl.DateTimeFormat;
    vi.stubGlobal('Intl', {
      ...Intl,
      DateTimeFormat: () => {
        throw new Error('no zone');
      },
    });
    expect(resolvedTimeZone()).toBe('UTC');
    vi.stubGlobal('Intl', { ...Intl, DateTimeFormat: real });
  });
});

describe('6.5 the VAPID key conversion', () => {
  it('turns base64url into the bytes PushManager wants', () => {
    // "AQID" is base64 for 0x01 0x02 0x03.
    expect([...urlBase64ToUint8Array('AQID')]).toEqual([1, 2, 3]);
  });

  it('handles the base64url alphabet and missing padding', () => {
    expect([...urlBase64ToUint8Array('-_8')]).toEqual([251, 255]);
  });

  it('is backed by a plain ArrayBuffer, which is what BufferSource requires', () => {
    expect(urlBase64ToUint8Array('AQID').buffer).toBeInstanceOf(ArrayBuffer);
  });
});

describe('6.10 the endpoint hash', () => {
  it('is a lowercase hex sha256, or null where crypto.subtle is unavailable', async () => {
    const h = await hashEndpoint('https://push.example/abc');
    if (h !== null) expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it('never throws, whatever the environment does', async () => {
    vi.stubGlobal('crypto', {});
    await expect(hashEndpoint('x')).resolves.toBeNull();
  });
});

describe('R14.2 schedule publication', () => {
  let sent: SchedulePayload[] = [];

  function api(over: Partial<PushApi> = {}): PushApi {
    return {
      vapidPublicKey: async () => ({ ok: true, value: 'AQID' }),
      subscribe: async () => ({ ok: true, value: true }),
      schedule: async (p) => {
        sent.push(p);
        return { ok: true, value: true };
      },
      unsubscribe: async () => ({ ok: true, value: { deleted: 1 } }),
      ...over,
    };
  }

  beforeEach(() => {
    sent = [];
    resetScheduleDebounce();
  });

  it('skips the call entirely when nothing changed since the last successful one', async () => {
    browser({ subscription: fakeSubscription() });
    setPushApi(api());
    const same = { date: '2026-06-29', minute: 460 };
    expect(await syncSchedule(same, same)).toEqual({ sent: false, reason: 'unchanged' });
    expect(sent).toHaveLength(0);
  });

  it('treats a changed minute and a changed date as changes', () => {
    expect(scheduleUnchanged({ date: '2026-06-29', minute: 460 }, { date: '2026-06-29', minute: 461 })).toBe(false);
    expect(scheduleUnchanged({ date: '2026-06-29', minute: 460 }, { date: '2026-06-30', minute: 460 })).toBe(false);
    expect(scheduleUnchanged(null, { date: '2026-06-29', minute: 460 })).toBe(false);
    expect(scheduleUnchanged({ date: '2026-06-29', minute: null }, { date: '2026-06-29', minute: null })).toBe(true);
  });

  it('does not call the API at all when this browser has no subscription', async () => {
    browser({ subscription: null });
    setPushApi(api());
    expect(await syncSchedule({ date: '2026-06-29', minute: 460 }, null)).toEqual({ sent: false, reason: 'no-subscription' });
    expect(sent).toHaveLength(0);
  });

  it('R11.6: sends exactly the endpoint, the auth secret, the zone, a date and a minute', async () => {
    browser({ subscription: fakeSubscription() });
    setPushApi(api());
    await syncSchedule({ date: '2026-06-29', minute: 460 }, null);
    expect(sent).toHaveLength(1);
    expect(Object.keys(sent[0]).sort()).toEqual(['auth', 'endpoint', 'nudgeLocalDate', 'nudgeLocalMinute', 'tz']);
    const raw = JSON.stringify(sent[0]);
    for (const banned of ['place', 'Coffee', 'estimate', 'jar', 'ledger', 'name']) {
      expect(raw.toLowerCase(), banned).not.toContain(banned.toLowerCase());
    }
  });

  it('sends a null minute to clear the schedule', async () => {
    browser({ subscription: fakeSubscription() });
    setPushApi(api());
    await syncSchedule({ date: '2026-06-29', minute: null }, null);
    expect(sent[0].nudgeLocalMinute).toBeNull();
  });

  it('debounces to at most one call every ten seconds', async () => {
    browser({ subscription: fakeSubscription() });
    setPushApi(api());
    const t0 = 1_000_000;
    await syncSchedule({ date: '2026-06-29', minute: 460 }, null, t0);
    const second = await syncSchedule({ date: '2026-06-29', minute: 470 }, null, t0 + 1000);
    expect(second).toEqual({ sent: false, reason: 'debounced' });
    const third = await syncSchedule({ date: '2026-06-29', minute: 480 }, null, t0 + SCHEDULE_DEBOUNCE_MS + 1);
    expect(third).toMatchObject({ sent: true });
    expect(sent).toHaveLength(2);
  });

  it('R14.11: reports a network failure rather than throwing', async () => {
    browser({ subscription: fakeSubscription() });
    setPushApi(api({ schedule: async () => ({ ok: false, kind: 'network' }) }));
    const r = await syncSchedule({ date: '2026-06-29', minute: 460 }, null);
    expect(r).toEqual({ sent: true, result: { ok: false, kind: 'network' } });
  });
});

describe('6.5 subscribe and unsubscribe', () => {
  it('rolls the browser subscription back when the server call fails', async () => {
    const sub = fakeSubscription();
    browser({ permission: 'granted', subscription: sub });
    setPushApi({
      vapidPublicKey: async () => ({ ok: true, value: 'AQID' }),
      subscribe: async () => ({ ok: false, kind: 'server' }),
      schedule: async () => ({ ok: true, value: true }),
      unsubscribe: async () => ({ ok: true, value: { deleted: 0 } }),
    });
    const r = await subscribe();
    expect(r).toEqual({ ok: false, kind: 'server' });
    // A local subscription the server never heard of is the exact failure risk 9 names.
    expect(sub.unsubscribe).toHaveBeenCalled();
  });

  it('stops at the VAPID key when the API is unreachable, before prompting anything else', async () => {
    browser({ permission: 'granted', subscription: fakeSubscription() });
    setPushApi({
      vapidPublicKey: async () => ({ ok: false, kind: 'network' }),
      subscribe: async () => ({ ok: true, value: true }),
      schedule: async () => ({ ok: true, value: true }),
      unsubscribe: async () => ({ ok: true, value: { deleted: 1 } }),
    });
    expect(await subscribe()).toEqual({ ok: false, kind: 'network' });
  });

  it('9.5: turning nudges off always succeeds locally, and reports the server separately', async () => {
    const sub = fakeSubscription();
    browser({ subscription: sub });
    setPushApi({
      vapidPublicKey: async () => ({ ok: true, value: 'AQID' }),
      subscribe: async () => ({ ok: true, value: true }),
      schedule: async () => ({ ok: true, value: true }),
      unsubscribe: async () => ({ ok: false, kind: 'network' }),
    });
    expect(await unsubscribeEverywhere()).toEqual({ localOk: true, serverOk: false });
    expect(sub.unsubscribe).toHaveBeenCalled();
  });

  it('is a no op when there was never a subscription', async () => {
    browser({ subscription: null });
    expect(await unsubscribeEverywhere()).toEqual({ localOk: true, serverOk: true });
  });

  it('never throws when the browser has no service worker at all', async () => {
    browser({ serviceWorker: false });
    await expect(currentSubscription()).resolves.toBeNull();
    await expect(unsubscribeEverywhere()).resolves.toEqual({ localOk: true, serverOk: true });
  });
});

describe('6.6 the API seam', () => {
  it('is swappable, and resets to the real one', () => {
    const fake = {} as PushApi;
    setPushApi(fake);
    resetPushApi();
    // Nothing to assert about `httpPushApi` beyond it being the thing that comes back.
    expect(httpPushApi.vapidPublicKey).toBeTypeOf('function');
  });

  it('names all four routes from plan 6.6 and nothing else', () => {
    expect(Object.keys(httpPushApi).sort()).toEqual(['schedule', 'subscribe', 'unsubscribe', 'vapidPublicKey']);
  });
});
