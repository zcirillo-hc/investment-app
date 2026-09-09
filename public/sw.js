/*
 * Plan v2 section 6.3. Hand written plain JavaScript, no imports, no build step.
 *
 * It handles exactly four events plus `pushsubscriptionchange` (6.5 step 5).
 *
 * The rule that governs this whole file is R14.7: EVERY push event results in exactly one
 * `showNotification` call, in every branch, including every error branch. A browser that
 * receives a push and shows no notification may substitute its own generic message and, after
 * repeat offences, revoke the permission. A silent path here is not a quiet failure, it is a
 * slow way to lose the feature.
 *
 * The second rule is 6.9: the push payload carries no content at all. The place name and the
 * estimate are read from IndexedDB on the device and the sentence is composed here, so the
 * server never learns where anyone goes.
 */

/* --------------------------------------------------------------------------------------
 * COPIES. Source of truth is src/lib/pendingNudge.ts (6.4) and src/config.ts.
 * A service worker cannot import from the bundle, so these are duplicated by hand.
 * tests/unit/sw-constants.test.ts asserts every value below still matches its source: a
 * silent divergence produces the 9.2a fallback forever, with no error anywhere to explain it.
 * -------------------------------------------------------------------------------------- */
const PENDING_NUDGE_DB = 'keyval-store'; // src/lib/pendingNudge.ts PENDING_NUDGE_DB
const PENDING_NUDGE_STORE = 'keyval'; // src/lib/pendingNudge.ts PENDING_NUDGE_STORE
const PENDING_NUDGE_KEY = 'spare-change-pending-nudge'; // src/lib/pendingNudge.ts PENDING_NUDGE_KEY
const NUDGE_LEAD_MINUTES = 20; // src/config.ts NUDGE_LEAD_MINUTES (R4.2)
const SUBSCRIBE_PATH = '/api/push/subscribe'; // src/lib/pushApi.ts
const UNSUBSCRIBE_PATH = '/api/push/unsubscribe'; // src/lib/pushApi.ts
const APP_SERVER_KEY_KEY = 'spare-change-app-server-key'; // cached at subscribe time (6.5 step 5)

/* Copies of plan 9.2 and 9.2a. Kept as literals so the worker needs nothing from the bundle. */
const FALLBACK_TITLE = 'Spare Change';
const FALLBACK_BODY = 'There is something waiting for you. Open the app to see it.';
const ACTION_SKIP = 'skip';
const ACTION_NOT_TODAY = 'not-today';
const ACTION_SKIP_TITLE = "I'm skipping today";
const ACTION_NOT_TODAY_TITLE = 'Not today';

/* -------------------------------------------------------------------------------------- */

self.addEventListener('install', () => {
  // 6.3: no precaching this cycle. The app is not offline capable and does not claim to be;
  // a cache with no eviction and versioning story is how a stale bundle gets pinned to a
  // phone forever.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

/**
 * About twenty five lines of raw indexedDB against the same database and store idb-keyval
 * uses in the app. Resolves null on any failure, because every failure here is a fallback
 * notification and never a thrown error.
 */
function readIdb(key) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v) => {
      if (!settled) {
        settled = true;
        resolve(v);
      }
    };
    try {
      const open = indexedDB.open(PENDING_NUDGE_DB);
      open.onerror = () => done(null);
      open.onsuccess = () => {
        const db = open.result;
        try {
          if (!db.objectStoreNames.contains(PENDING_NUDGE_STORE)) return done(null);
          const tx = db.transaction(PENDING_NUDGE_STORE, 'readonly');
          const req = tx.objectStore(PENDING_NUDGE_STORE).get(key);
          req.onsuccess = () => done(req.result === undefined ? null : req.result);
          req.onerror = () => done(null);
          tx.onerror = () => done(null);
        } catch (e) {
          done(null);
        }
      };
      // An `upgradeneeded` here means the store did not exist, so there is nothing to read.
      open.onupgradeneeded = () => done(null);
      open.onblocked = () => done(null);
    } catch (e) {
      done(null);
    }
  });
}

/** Mirrors formatCents in src/domain/money.ts for the two cases a notification can produce. */
function formatCents(cents) {
  const rounded = Math.round(cents);
  const abs = Math.abs(rounded);
  const dollars = Math.floor(abs / 100);
  const rem = abs % 100;
  const withCommas = String(dollars).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (rounded < 0 ? '-' : '') + '$' + withCommas + '.' + String(rem).padStart(2, '0');
}

/** Mirrors formatMinuteOfDay in src/domain/dates.ts. */
function formatMinuteOfDay(minute) {
  const m = Math.min(1439, Math.max(0, Math.round(minute)));
  const h24 = Math.floor(m / 60);
  const mm = m % 60;
  const suffix = h24 < 12 ? 'am' : 'pm';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return h12 + ':' + String(mm).padStart(2, '0') + ' ' + suffix;
}

function isRecord(r) {
  return (
    r !== null &&
    typeof r === 'object' &&
    r.v === 2 &&
    typeof r.date === 'string' &&
    typeof r.minute === 'number' &&
    typeof r.placeName === 'string' &&
    typeof r.estimateCents === 'number'
  );
}

/**
 * Plan 9.2. The same one sentence as the in app card, composed here from the device's own
 * record. The card shows the USUAL time, which is the nudge minute plus the R4.2 lead, so
 * this does the same arithmetic rather than storing a second field.
 *
 * R4.9: never a coordinate, an address, a merchant category, or the jar balance.
 */
function composeFromRecord(record) {
  const usual = Math.min(1439, Math.max(0, record.minute + NUDGE_LEAD_MINUTES));
  return {
    title: 'Skip ' + record.placeName + ' today?',
    body:
      'You usually spend about ' +
      formatCents(record.estimateCents) +
      ' here around ' +
      formatMinuteOfDay(usual) +
      '. Skip today and it goes in your jar.',
    actions: [
      { action: ACTION_SKIP, title: ACTION_SKIP_TITLE },
      { action: ACTION_NOT_TODAY, title: ACTION_NOT_TODAY_TITLE },
    ],
    tag: 'spare-change-nudge',
    data: { kind: 'nudge', date: record.date },
  };
}

/** Plan 9.2a. Nothing personal, because the reason it is showing is that we know nothing. */
function fallbackNotification() {
  return {
    title: FALLBACK_TITLE,
    body: FALLBACK_BODY,
    // No actions, no place, no amount, no figure of any kind.
    tag: 'spare-change-nudge',
    data: { kind: 'fallback' },
  };
}

/**
 * R14.6 and R14.7. Parses the payload, reads the pending record, and returns exactly one
 * notification to show. Every failure path returns the fallback rather than nothing.
 */
async function notificationFor(rawData) {
  let payload = null;
  try {
    payload = rawData ? JSON.parse(rawData) : null;
  } catch (e) {
    return fallbackNotification();
  }
  if (!payload || payload.v !== 2 || payload.t !== 'nudge' || typeof payload.d !== 'string') {
    return fallbackNotification();
  }
  const record = await readIdb(PENDING_NUDGE_KEY);
  if (!isRecord(record)) return fallbackNotification();
  // The date guard is what stops a delayed or replayed push from describing yesterday.
  if (record.date !== payload.d) return fallbackNotification();
  return composeFromRecord(record);
}

self.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      let spec;
      try {
        spec = await notificationFor(event.data ? event.data.text() : null);
      } catch (e) {
        spec = fallbackNotification();
      }
      // The single exit. Every branch above reaches exactly this call, exactly once (R14.7).
      await self.registration.showNotification(spec.title, {
        body: spec.body,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag: spec.tag,
        data: spec.data,
        actions: spec.actions || [],
      });
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // R4.7: "Not today" resolves the notification and does nothing else. No event is written,
  // no message is posted, and nothing follows it.
  if (event.action === ACTION_NOT_TODAY) return;

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      // The skip itself is applied by the app, on device, through the existing takeSkip
      // action. The worker has no access to the store and must never become a second place
      // where money math happens (6.3).
      const message = { type: 'focus-nudge', from: 'notification' };
      for (const client of clientList) {
        if (new URL(client.url).origin === self.location.origin) {
          try {
            client.postMessage(message);
          } catch (e) {
            /* a client that will not take a message is still worth focusing */
          }
          if ('focus' in client) return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow('/?from=nudge');
      return undefined;
    })(),
  );
});

/**
 * 6.5 step 5. Browsers rotate endpoints; a design that ignores this event stops delivering
 * after a few weeks with no error the user can see. The worker cannot reach the app's code,
 * so it re-subscribes with the application server key cached at subscribe time, posts the new
 * subscription, then posts the old endpoint to be deleted.
 */
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      const oldSub = event.oldSubscription || null;
      try {
        const key = await readIdb(APP_SERVER_KEY_KEY);
        if (!key) return;
        const newSub =
          event.newSubscription ||
          (await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }));
        const json = newSub.toJSON();
        await fetch(SUBSCRIBE_PATH, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            subscription: { endpoint: json.endpoint, keys: json.keys },
            tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
          }),
        });
        if (oldSub) {
          const oldJson = oldSub.toJSON();
          await fetch(UNSUBSCRIBE_PATH, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ endpoint: oldJson.endpoint, auth: oldJson.keys ? oldJson.keys.auth : '' }),
          });
        }
      } catch (e) {
        // Nothing to show and nothing to retry on a timer. The next app open re-subscribes.
      }
    })(),
  );
});
