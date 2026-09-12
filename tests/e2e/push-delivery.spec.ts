/**
 * Plan v2 11.4 and criterion 23. Push delivery, the automated half.
 *
 * A push is delivered to the REGISTERED SERVICE WORKER over the Chrome DevTools Protocol,
 * exactly as 11.4 specifies. That covers the whole client half of delivery: the payload, the
 * worker's parsing, the IndexedDB read, the on device composition, the date guard, and the
 * click path.
 *
 * **What this file does NOT prove, stated here rather than in a footnote.** No real push
 * travels from Vercel through Apple's or Google's push service. `ServiceWorker.
 * deliverPushMessage` hands the payload straight to the worker, so everything between
 * `web-push` and the browser, VAPID signing, encryption, the push service itself, is
 * untested by anything here. 11.4 item 1, a real notification on a real iPhone with the app
 * on the Home Screen, remains required to close the cycle and nothing in this file
 * substitutes for it.
 *
 * The click is also synthesized rather than clicked: no protocol in Chromium lets a test
 * activate a platform notification. The spec dispatches a real `notificationclick` at the
 * worker, carrying the real `Notification` object the worker just created, so the handler
 * under test is the shipped one; what is not exercised is the browser's own delivery of that
 * event. That distinction is named again in the build notes.
 */
import { expect, test, type BrowserContext, type CDPSession, type Page, type Worker } from '@playwright/test';
import { clickClear, demoClick, dismissCapturePrompt, onboard, readPendingNudge } from './fixtures';

/**
 * Chromium's OLD headless mode, which is Playwright's default here, has no notification
 * support at all: `Notification.permission` stays `denied` however the permission is granted,
 * `showNotification` throws, and every assertion below would fail for a reason that has
 * nothing to do with this app. `channel: 'chromium'` runs the new headless mode, where
 * `context.grantPermissions(['notifications'])` actually takes effect. Measured, not assumed:
 * without this line the permission reads `denied` and the worker shows nothing.
 *
 * It forces its own worker, which is why it is at the top of the file rather than inside the
 * describe block.
 */
test.use({ channel: 'chromium' });

// Two viewports, the ones the criteria name. The two extra iPhone profiles exist for the 6.13
// layout work and would add nothing but runtime here.
test.beforeEach(async ({}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'mobile' && testInfo.project.name !== 'desktop',
    'CDP push delivery is verified at the two viewports the criteria name',
  );
});

interface ShownNotification {
  title: string;
  body: string;
  tag: string;
  actions: Array<{ action: string; title: string }>;
  data: unknown;
}

/**
 * Why a push's notification is read at the instant the worker's `showNotification` settles,
 * and at no other moment.
 *
 * `getNotifications()` is not a passive read in Chromium. It takes a start time, asks the
 * platform which notifications are on screen, then DELETES every stored notification that is
 * not on screen and was created before that start time
 * (`PlatformNotificationContextImpl::DoReadAllNotificationDataForServiceWorkerRegistration`).
 * Two things follow. Both were measured on 2026-09-11, on this machine, under load.
 *
 * 1. Reading too early: the race that made this spec flaky. A notification's creation time is
 *    stamped when the browser receives `showNotification`, but it reaches the screen only after
 *    its database write. A read that starts inside that window deletes the notification the
 *    worker is in the middle of showing, for good: `showNotification` still resolves, and
 *    `getNotifications()` never returns it again. `deliverPushMessage` returns before the worker
 *    has even parsed the payload, and these helpers used to start polling straight after it, so
 *    the first poll could land in the window. The five-payload case failed 6 times in 30 that
 *    way, every time `Expected: 1, Received: 0` with the worker's one `showNotification`
 *    resolved. The other cases carried the same race once per run instead of five times.
 *
 * 2. Reading too late. Headless Chromium on macOS hands notifications to Notification Center,
 *    and while a run is sending hundreds of them macOS drops some within tens of milliseconds;
 *    the next read then deletes them the same way. A read 50 ms after the settle lost 2 of 16,
 *    one 3 s after lost 10 of 16, one at the instant of settling lost none. Chromium's own
 *    message center lost nothing at any delay (128 of 128), but switching to it needs
 *    `--disable-features=NativeNotifications`. Playwright passes its own `--disable-features`
 *    without merging a user one, and Chromium's command line keeps only the last of repeated
 *    switches by default, so that flag risks silently dropping Playwright's list.
 *
 * So the wrapper in `watchShows` starts the read inside the worker the moment
 * `showNotification` resolves, `deliver` keeps what that read saw, and `shownBy` asserts on it.
 * The worker is not at fault and does not change: the app never calls `getNotifications()`,
 * only this spec does.
 */
interface PushSession {
  context: BrowserContext;
  client: CDPSession;
  registrationId: string;
  origin: string;
  /** What `getNotifications()` returned the instant the last push's notification settled. */
  lastShown: ShownNotification[] | null;
}

interface ShowCounts {
  calls: number;
  settled: number;
  rejections: string[];
}

function workerFor(context: BrowserContext): Worker | undefined {
  return context.serviceWorkers().find((w) => w.url().endsWith('/sw.js'));
}

/**
 * Counts the worker's `showNotification` calls and settlements, and reads the notification
 * list at the instant each one resolves (see the note above `PushSession`). The wrapper calls
 * straight through to the real method with the same arguments and returns its result, so the
 * push handler under test is the shipped one, unchanged. Idempotent per worker instance.
 */
async function watchShows(context: BrowserContext): Promise<Worker> {
  await expect.poll(() => workerFor(context) !== undefined, { timeout: 15_000 }).toBe(true);
  const worker = workerFor(context)!;
  await worker.evaluate(() => {
    const sw = self as unknown as {
      registration: ServiceWorkerRegistration;
      __shows?: { calls: number; settled: number; rejections: string[]; lastRead: Promise<Notification[]> | null };
    };
    if (sw.__shows) return;
    const shows = { calls: 0, settled: 0, rejections: [] as string[], lastRead: null as Promise<Notification[]> | null };
    sw.__shows = shows;
    const original = sw.registration.showNotification.bind(sw.registration);
    sw.registration.showNotification = (title: string, options?: NotificationOptions) => {
      shows.calls += 1;
      return original(title, options).then(
        (value) => {
          // Started synchronously here, before anything else can run in this worker.
          shows.lastRead = sw.registration.getNotifications();
          shows.settled += 1;
          return value;
        },
        (err: unknown) => {
          shows.rejections.push(String(err));
          shows.settled += 1;
          throw err;
        },
      );
    };
  });
  return worker;
}

async function showCounts(worker: Worker): Promise<ShowCounts> {
  return worker.evaluate(() => {
    const shows = (self as unknown as { __shows?: ShowCounts }).__shows;
    return shows
      ? { calls: shows.calls, settled: shows.settled, rejections: [...shows.rejections] }
      : { calls: -1, settled: -1, rejections: [] };
  });
}

/** Enables the ServiceWorker domain and finds the registration id for this origin. */
async function pushSession(context: BrowserContext, page: Page): Promise<PushSession> {
  const origin = new URL(page.url()).origin;
  const client = await context.newCDPSession(page);
  const ids: string[] = [];
  client.on('ServiceWorker.workerRegistrationUpdated', (event) => {
    for (const reg of (event as { registrations: Array<{ registrationId: string; scopeURL: string }> }).registrations) {
      if (reg.scopeURL.startsWith(origin) && !ids.includes(reg.registrationId)) {
        ids.push(reg.registrationId);
      }
    }
  });
  await client.send('ServiceWorker.enable');
  await expect.poll(() => ids.length, { timeout: 15_000 }).toBeGreaterThan(0);
  return { context, client, registrationId: ids[ids.length - 1], origin, lastShown: null };
}

/**
 * Delivers one push, waits for the worker's `showNotification` for it to settle, and keeps
 * the notification list read at that instant in `push.lastShown`. Also asserts R14.7 at the
 * source: exactly one `showNotification` call for the push, and it did not reject.
 */
async function deliver(push: PushSession, data: string): Promise<void> {
  push.lastShown = null;
  const worker = await watchShows(push.context);
  const before = await showCounts(worker);
  await push.client.send('ServiceWorker.deliverPushMessage', {
    origin: push.origin,
    registrationId: push.registrationId,
    data,
  });
  // Waited for inside the worker rather than with `expect.poll`, whose backoff would only
  // delay this side; the read it depends on was already started by the wrapper.
  const settled = await worker.evaluate(
    ({ target, timeoutMs }) =>
      new Promise<boolean>((resolve) => {
        const shows = (self as unknown as { __shows: { settled: number } }).__shows;
        const deadline = Date.now() + timeoutMs;
        const check = (): void => {
          if (shows.settled >= target) resolve(true);
          else if (Date.now() > deadline) resolve(false);
          else setTimeout(check, 1);
        };
        check();
      }),
    { target: before.settled + 1, timeoutMs: 15_000 },
  );
  expect(settled, `the worker must finish showing a notification for push ${JSON.stringify(data)} (R14.7)`).toBe(true);
  const after = await showCounts(worker);
  expect(after.calls - before.calls, 'R14.7: exactly one showNotification call per push').toBe(1);
  expect(after.rejections, 'showNotification must not reject').toEqual(before.rejections);
  push.lastShown = await worker.evaluate(async () => {
    const shows = (self as unknown as { __shows: { lastRead: Promise<Notification[]> } }).__shows;
    return (await shows.lastRead).map((n) => ({
      title: n.title,
      body: n.body,
      tag: n.tag,
      actions: (n as Notification & { actions?: Array<{ action: string; title: string }> }).actions ?? [],
      data: n.data as unknown,
    }));
  });
}

async function clearNotifications(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    for (const n of await reg.getNotifications()) n.close();
  });
  await expect.poll(async () => (await notificationCount(page)) as number, { timeout: 5_000 }).toBe(0);
}

async function notificationCount(page: Page): Promise<number> {
  return page.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications()).length);
}

/** Asserts the last push left exactly one notification, as read the instant it settled. */
function shownBy(push: PushSession): ShownNotification {
  expect(push.lastShown, 'deliver must have run and read the notification list').not.toBeNull();
  expect(push.lastShown!.length, 'R14.7: exactly one notification per push, in every branch').toBe(1);
  return push.lastShown![0];
}

/**
 * The state criterion 23 needs: nudges on, one habit place, one pending nudge, and therefore
 * one pending nudge record in IndexedDB for the worker to compose from. `forceNudge` turns
 * nudges on itself (R4.1 would otherwise refuse every candidate), and `makeHabit` is what
 * gives it a candidate to pick.
 */
async function arrangeNudge(page: Page): Promise<void> {
  await onboard(page);
  await dismissCapturePrompt(page);
  await demoClick(page, 'demo-make-habit');
  await demoClick(page, 'demo-force-nudge');
  await expect(page.getByTestId('nudge-card')).toBeVisible();
}

test.describe('criterion 23: push delivery over CDP', () => {
  test('a matching payload composes the real sentence on the device, from IndexedDB', async ({ page, context }) => {
    await context.grantPermissions(['notifications']);
    await arrangeNudge(page);

    const record = await readPendingNudge(page);
    expect(record, 'the tick must have written a pending nudge record (6.4)').not.toBeNull();
    const placeName = String(record!.placeName);
    const estimateCents = Number(record!.estimateCents);
    const date = String(record!.date);

    const push = await pushSession(context, page);
    await clearNotifications(page);
    await deliver(push, JSON.stringify({ v: 2, t: 'nudge', d: date }));

    const shown = shownBy(push);

    // Composed on the device: the place name and the estimate are in the text, and neither
    // ever left the browser (6.9).
    expect(shown.title).toContain(placeName);
    const dollars = `$${(estimateCents / 100).toFixed(2)}`;
    expect(shown.body).toContain(dollars);
    expect(shown.data).toMatchObject({ kind: 'nudge', date });

    // R4.9 and 9.2: no coordinate, no address, no jar balance, no shame.
    const text = `${shown.title} ${shown.body}`.toLowerCase();
    for (const banned of [
      'lat',
      'lon',
      'coordinate',
      'street',
      'avenue',
      'jar balance',
      'you should',
      'wasted',
      'failed',
      'again',
      'streak',
      'behind',
    ]) {
      expect(text, `notification text must not contain "${banned}"`).not.toContain(banned);
    }
    expect(/-?\d+\.\d{4,}/.test(text), 'no raw coordinate-shaped number').toBe(false);

    // The two actions from 6.3.
    expect(shown.actions.map((a) => a.action)).toEqual(['skip', 'not-today']);
  });

  test('a mismatched date shows the 9.2a fallback, and still exactly one notification', async ({ page, context }) => {
    await context.grantPermissions(['notifications']);
    await arrangeNudge(page);
    const record = await readPendingNudge(page);
    expect(record).not.toBeNull();

    const push = await pushSession(context, page);
    await clearNotifications(page);
    // The replay guard: a push describing a different day must never describe yesterday's place.
    await deliver(push, JSON.stringify({ v: 2, t: 'nudge', d: '1999-01-01' }));

    const shown = shownBy(push);
    expect(shown.title).toBe('Spare Change');
    expect(shown.body).toBe('There is something waiting for you. Open the app to see it.');
    expect(shown.body).not.toContain(String(record!.placeName));
    expect(shown.actions).toEqual([]);
    expect(shown.data).toMatchObject({ kind: 'fallback' });
  });

  test('an unparseable payload, a wrong version and a wrong type each show one fallback', async ({ page, context }) => {
    await context.grantPermissions(['notifications']);
    await arrangeNudge(page);
    const record = await readPendingNudge(page);
    const push = await pushSession(context, page);

    for (const payload of [
      'not json at all',
      '',
      '{"v":1,"t":"nudge","d":"2026-06-15"}',
      `{"v":2,"t":"marketing","d":"${String(record!.date)}"}`,
      '{"v":2,"t":"nudge"}',
    ]) {
      await clearNotifications(page);
      await deliver(push, payload);
      const shown = shownBy(push);
      expect(shown.title, `payload ${JSON.stringify(payload)}`).toBe('Spare Change');
      expect(shown.body).toBe('There is something waiting for you. Open the app to see it.');
    }
  });

  test('no pending record means the fallback, not a silent push', async ({ page, context }) => {
    await context.grantPermissions(['notifications']);
    await arrangeNudge(page);
    const push = await pushSession(context, page);

    // 6.9's named tradeoff: an evicted IndexedDB produces a vague notification, never none.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          const req = indexedDB.open('keyval-store');
          req.onsuccess = () => {
            const tx = req.result.transaction('keyval', 'readwrite');
            tx.objectStore('keyval').delete('spare-change-pending-nudge');
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
          };
          req.onerror = () => resolve();
        }),
    );

    await clearNotifications(page);
    await deliver(push, JSON.stringify({ v: 2, t: 'nudge', d: '2026-06-15' }));
    const shown = shownBy(push);
    expect(shown.title).toBe('Spare Change');
  });

  test('the click path focuses the nudge card, and the skip credits the jar exactly once', async ({ page, context }) => {
    await context.grantPermissions(['notifications']);
    await arrangeNudge(page);
    const record = await readPendingNudge(page);
    const push = await pushSession(context, page);
    await clearNotifications(page);
    await deliver(push, JSON.stringify({ v: 2, t: 'nudge', d: String(record!.date) }));
    shownBy(push);

    // Synthesized, not clicked: see the file header. The handler under test is the shipped
    // one, carrying the real Notification object the worker just created.
    const worker = context.serviceWorkers().find((w) => w.url().endsWith('/sw.js'));
    expect(worker, 'the service worker must be registered').toBeTruthy();
    const reasons = await worker!.evaluate(async () => {
      const sw = self as unknown as {
        __shows: { lastRead: Promise<Notification[]> };
        dispatchEvent: (e: Event) => boolean;
      };
      // The object `getNotifications()` returned the instant the worker's `showNotification`
      // settled, not a fresh read now, which could find it already dropped by macOS (see the
      // note above `PushSession`).
      const [notification] = await sw.__shows.lastRead;
      const event = new Event('notificationclick') as Event & {
        notification?: Notification;
        action?: string;
        waitUntil?: (p: Promise<unknown>) => void;
      };
      event.notification = notification;
      event.action = 'skip';
      const pending: Array<Promise<unknown>> = [];
      event.waitUntil = (p) => {
        pending.push(p);
      };
      sw.dispatchEvent(event);
      // `clients.focus()` is not permitted in headless Chromium, so the handler's LAST step
      // rejects here and only here. Everything the assertion below depends on, the
      // `postMessage({ type: 'focus-nudge' })`, has already run by then. Settled rather than
      // all, and the reasons are returned so a different rejection cannot hide in this line.
      const settled = await Promise.allSettled(pending);
      return settled
        .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
        .map((r) => String(r.reason));
    });
    for (const reason of reasons) {
      expect(reason, 'the only permitted rejection is the headless focus restriction').toContain('focus');
    }

    // The worker posts `focus-nudge` and the app focuses the skip button (Home.tsx). The skip
    // itself is NEVER applied by the worker: 6.3 keeps all money math in the app.
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? ''), { timeout: 10_000 })
      .toBe('nudge-skip');

    const jarBefore = (await page.getByTestId('jar-amount').textContent()) ?? '';
    const estimate = Number(await page.getByTestId('nudge-card').getAttribute('data-estimate'));
    await clickClear(page, 'nudge-skip');
    await expect(page.getByTestId('jar-amount')).not.toHaveText(jarBefore);

    const centsOf = (s: string): number => Math.round(Number(s.replace(/[^0-9.]/g, '')) * 100);
    const jarAfter = (await page.getByTestId('jar-amount').textContent()) ?? '';
    expect(centsOf(jarAfter) - centsOf(jarBefore)).toBe(estimate);

    // Exactly one Skip line, and the card is gone, so a second credit is not reachable.
    await expect(page.getByTestId('nudge-card')).toHaveCount(0);
    await clickClear(page, 'activity-link');
    await expect(page.getByTestId('screen-activity')).toBeVisible();
    await expect(page.getByTestId('activity-item-Skip')).toHaveCount(1);
  });
});
