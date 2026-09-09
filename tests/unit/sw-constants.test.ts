/**
 * Plan v2 6.3 and R14.7.
 *
 * `public/sw.js` is hand written plain JavaScript with no bundler, so it cannot import the
 * constants it shares with the app. It carries copies. A silent divergence there produces the
 * 9.2a fallback notification forever, with no error anywhere to explain it, which is exactly
 * the kind of failure nobody notices until the feature is quietly dead. This file is the
 * assertion that the copies still match.
 *
 * It also holds the structural check for R14.7: every push branch must end in exactly one
 * `showNotification`, because a browser that delivers a push and sees no notification may show
 * its own generic message and, after repeat offences, revoke the permission.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PENDING_NUDGE_DB, PENDING_NUDGE_KEY, PENDING_NUDGE_STORE } from '../../src/lib/pendingNudge';
import { APP_SERVER_KEY_KEY } from '../../src/lib/push';
import { NUDGE_LEAD_MINUTES } from '../../src/config';

const SW = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8');

describe('the service worker copies its constants correctly', () => {
  it('uses the same IndexedDB database, store and key as src/lib/pendingNudge.ts', () => {
    expect(SW).toContain(`const PENDING_NUDGE_DB = '${PENDING_NUDGE_DB}'`);
    expect(SW).toContain(`const PENDING_NUDGE_STORE = '${PENDING_NUDGE_STORE}'`);
    expect(SW).toContain(`const PENDING_NUDGE_KEY = '${PENDING_NUDGE_KEY}'`);
  });

  it('uses the same cached application server key as src/lib/push.ts', () => {
    expect(SW).toContain(`const APP_SERVER_KEY_KEY = '${APP_SERVER_KEY_KEY}'`);
  });

  it('uses the same R4.2 lead as src/config.ts, so the card and the notification agree', () => {
    expect(SW).toContain(`const NUDGE_LEAD_MINUTES = ${NUDGE_LEAD_MINUTES}`);
  });

  it('names its sources in comments, so the next person knows where to look', () => {
    expect(SW).toContain('src/lib/pendingNudge.ts PENDING_NUDGE_KEY');
    expect(SW).toContain('src/config.ts NUDGE_LEAD_MINUTES');
  });
});

describe('R14.7 exactly one notification, in every branch', () => {
  it('calls showNotification exactly once in the whole file', () => {
    const calls = SW.match(/showNotification\(/g) ?? [];
    expect(calls).toHaveLength(1);
  });

  it('reaches that call through a single exit at the end of the push handler', () => {
    // Every branch above it returns a notification spec rather than showing one itself, so
    // "no branch shows nothing" is structural rather than a thing to remember.
    const pushHandler = SW.slice(SW.indexOf("addEventListener('push'"));
    expect(pushHandler).toContain('self.registration.showNotification(spec.title');
    expect(pushHandler.match(/return fallbackNotification\(\)/g) ?? []).toHaveLength(0);
  });

  it('has a fallback for every way composition can fail', () => {
    const composer = SW.slice(SW.indexOf('async function notificationFor'), SW.indexOf("addEventListener('push'"));
    // Unparseable payload, wrong version or type, no record, and a date that does not match.
    expect(composer.match(/return fallbackNotification\(\)/g) ?? []).toHaveLength(4);
  });

  it('wraps composition in a try and catch, so an unexpected throw still shows one', () => {
    const pushHandler = SW.slice(SW.indexOf("addEventListener('push'"), SW.indexOf("addEventListener('notificationclick'"));
    expect(pushHandler).toContain('catch');
  });
});

describe('R9.2a the fallback carries nothing personal', () => {
  it('is exactly the two strings from the plan', () => {
    expect(SW).toContain("const FALLBACK_TITLE = 'Spare Change'");
    expect(SW).toContain("const FALLBACK_BODY = 'There is something waiting for you. Open the app to see it.'");
  });

  it('has no actions, no place, no amount and no figure of any kind', () => {
    const fn = SW.slice(SW.indexOf('function fallbackNotification'), SW.indexOf('async function notificationFor'));
    expect(fn).not.toContain('placeName');
    expect(fn).not.toContain('estimateCents');
    expect(fn).not.toContain('actions:');
  });
});

describe('R4.7 the secondary action is silent', () => {
  it('returns immediately, writing no event and posting no message', () => {
    const handler = SW.slice(SW.indexOf("addEventListener('notificationclick'"), SW.indexOf("addEventListener('pushsubscriptionchange'"));
    const notToday = handler.indexOf('ACTION_NOT_TODAY');
    const firstPost = handler.indexOf('postMessage');
    expect(notToday).toBeGreaterThan(-1);
    // The early return sits before anything that could have an effect.
    expect(handler.slice(notToday, firstPost)).toContain('return;');
  });
});

describe('6.3 the worker stays a worker', () => {
  it('has no import statement, because there is no build step in front of it', () => {
    expect(SW).not.toMatch(/^\s*import\s/m);
    expect(SW).not.toContain('require(');
  });

  it('does not precache anything this cycle', () => {
    expect(SW).not.toContain('caches.open');
    expect(SW).not.toContain('cache.addAll');
  });

  it('handles exactly the five events the plan names', () => {
    const events = [...SW.matchAll(/addEventListener\('([a-z]+)'/g)].map((m) => m[1]).sort();
    expect(events).toEqual(['activate', 'install', 'notificationclick', 'push', 'pushsubscriptionchange']);
  });

  it('R11.6: never posts a place name, an amount or a jar figure to the server', () => {
    const changeHandler = SW.slice(SW.indexOf("addEventListener('pushsubscriptionchange'"));
    for (const banned of ['placeName', 'estimateCents', 'jarCents', 'ledger']) {
      expect(changeHandler).not.toContain(banned);
    }
  });
});
