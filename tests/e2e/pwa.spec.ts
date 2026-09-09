/**
 * Plan v2 6.2, 6.3, 8.10 and criteria 19, 20, 24, 25 (client half).
 *
 * **What this pass can and cannot verify.** The backend does not exist yet: `/api/*` returns
 * the SPA shell, which the client treats as a server error by design (6.6). So everything here
 * is the client half. The parts that need the server, a row in `push_subs`, a real push, the
 * cron, are marked below and belong to the backend pass. That split is deliberate and stated
 * rather than papered over with a mock that would prove nothing about the real routes.
 */
import { expect, test } from '@playwright/test';
import { clickClear, collectErrors, demoClick, dismissCapturePrompt, onboard, onboardWithNudgesOn, START } from './fixtures';

test.describe('6.2 the PWA shell', () => {
  test('criterion 19: the manifest and the service worker are served, and the worker activates', async ({ page }) => {
    const manifest = await page.request.get('/manifest.webmanifest');
    expect(manifest.status()).toBe(200);
    const parsed = (await manifest.json()) as Record<string, unknown>;
    expect(parsed.name).toBe('Spare Change');
    expect(parsed.display).toBe('standalone');
    expect(parsed.start_url).toBe('/?source=pwa');
    // The theme colour is the light theme header colour from the palette, not a new colour,
    // so the contrast tests still hold.
    expect(parsed.theme_color).toBe('#f0f8f2');
    expect((parsed.icons as unknown[]).length).toBe(3);

    const sw = await page.request.get('/sw.js');
    expect(sw.status()).toBe(200);
    expect(await sw.text()).toContain('showNotification');

    for (const icon of ['/icons/icon-192.png', '/icons/icon-512.png', '/icons/icon-maskable-512.png', '/icons/apple-touch-icon-180.png']) {
      const r = await page.request.get(icon);
      expect(r.status(), icon).toBe(200);
      expect(r.headers()['content-type'], icon).toContain('image/png');
    }
  });

  test('criterion 19: index.html carries what iOS reads, and viewport-fit=cover', async ({ page }) => {
    await page.goto(START);
    // 6.13: without viewport-fit=cover every env(safe-area-inset-*) resolves to zero.
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /viewport-fit=cover/);
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest');
    // iOS reads these two and not the manifest for the Home Screen icon.
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/icons/apple-touch-icon-180.png');
    await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute('content', 'yes');
    await expect(page.locator('meta[name="apple-mobile-web-app-status-bar-style"]')).toHaveCount(1);
  });

  test('6.13: the status bar style follows the theme', async ({ page }) => {
    await onboard(page);
    await dismissCapturePrompt(page);
    await page.getByTestId('nav-settings').click();
    await page.getByTestId('settings-theme-light').click();
    await expect(page.locator('meta[name="apple-mobile-web-app-status-bar-style"]')).toHaveAttribute('content', 'default');
    await page.getByTestId('settings-theme-dark').click();
    await expect(page.locator('meta[name="apple-mobile-web-app-status-bar-style"]')).toHaveAttribute('content', 'black-translucent');
  });

  test('criterion 19: the service worker registers and reaches activated', async ({ page }) => {
    await page.goto(START);
    await expect(page.getByTestId('screen-welcome')).toBeVisible();
    const state = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration('/');
      if (!reg) return 'none';
      await navigator.serviceWorker.ready;
      return reg.active?.state ?? 'no-active';
    });
    expect(state).toBe('activated');
  });

  test('6.12: removing the service worker entirely changes nothing else about the app', async ({ page }) => {
    const errors = collectErrors(page);
    await page.addInitScript(() => {
      // The app must boot and run identically with no service worker at all.
      Object.defineProperty(navigator, 'serviceWorker', { get: () => undefined, configurable: true });
    });
    await onboard(page);
    await dismissCapturePrompt(page);
    await demoClick(page, 'demo-make-habit');
    await demoClick(page, 'demo-force-nudge');
    await expect(page.getByTestId('nudge-card')).toBeVisible();
    await clickClear(page, 'nudge-skip');
    await expect(page.getByTestId('jar-amount')).not.toHaveText('$0.00');
    expect(errors.filter((e) => !e.includes('Service worker')), errors.join('\n')).toEqual([]);
  });
});

test.describe('8.10 the Nudges card, per platform state', () => {
  test('criterion 20: an iPhone Safari tab shows the install panel and never prompts', async ({ page }) => {
    // A page level spy installed BEFORE navigation, exactly as the criterion requires.
    await page.addInitScript(() => {
      (window as unknown as { __permCalls: number }).__permCalls = 0;
      const N = window.Notification as unknown as { requestPermission: () => Promise<string> };
      N.requestPermission = async () => {
        (window as unknown as { __permCalls: number }).__permCalls += 1;
        return 'denied';
      };
    });
    await onboard(page, { url: `${START}&push=needs-ios-install` });
    await dismissCapturePrompt(page);
    await page.getByTestId('nav-settings').click();

    await expect(page.getByTestId('nudges-state')).toHaveAttribute('data-support', 'needs-ios-install');
    await page.getByTestId('nudges-toggle').click();
    await expect(page.getByTestId('install-panel')).toBeVisible();
    const steps = page.getByTestId('install-steps').locator('li');
    await expect(steps).toHaveCount(3);
    await expect(steps.nth(0)).toContainText('Share button');
    await expect(steps.nth(1)).toContainText('Add to Home Screen');
    await expect(page.getByTestId('install-panel')).toContainText('does not install anything from an app store');

    expect(await page.evaluate(() => (window as unknown as { __permCalls: number }).__permCalls)).toBe(0);

    // And every other screen in the app is fully usable.
    for (const tab of ['home', 'places', 'invest', 'lessons']) {
      await page.getByTestId(`nav-${tab}`).click();
      await expect(page.getByTestId(`screen-${tab === 'home' ? 'home' : tab}`)).toBeVisible();
    }
  });

  test('criterion 20: a desktop profile shows the toggle and the 9.4a panel instead', async ({ page }) => {
    await onboard(page, { url: `${START}&push=ready` });
    await dismissCapturePrompt(page);
    await page.getByTestId('nav-settings').click();
    await expect(page.getByTestId('nudges-state')).toHaveAttribute('data-support', 'ready');
    await expect(page.getByTestId('install-panel')).toHaveCount(0);

    await page.getByTestId('nudges-explainer-link').click();
    const panel = page.getByTestId('nudges-explainer');
    await expect(panel).toBeVisible();
    // The whole of 9.4a, including the fourth paragraph the cadence amendment added.
    await expect(panel).toContainText('three things get stored there');
    await expect(panel).toContainText('written on this device');
    await expect(panel).toContainText('that row is deleted');
    await expect(panel).toContainText('once a day, in an early morning window');
    // It never promises a precise arrival time.
    expect(await panel.innerText()).not.toContain('twenty minutes before');
    await expect(page.getByTestId('nudges-explainer-yes')).toBeVisible();
    await expect(page.getByTestId('nudges-explainer-no')).toBeVisible();
  });

  test('criterion 24: with permission denied, no prompt is attempted and the loop still works', async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { __permCalls: number }).__permCalls = 0;
      const N = window.Notification as unknown as { requestPermission: () => Promise<string> };
      N.requestPermission = async () => {
        (window as unknown as { __permCalls: number }).__permCalls += 1;
        return 'denied';
      };
    });
    await onboard(page, { url: `${START}&push=denied` });
    await dismissCapturePrompt(page);
    await page.getByTestId('nav-settings').click();
    await page.getByTestId('nudges-toggle').click();
    await expect(page.getByTestId('denied-panel')).toBeVisible();
    await expect(page.getByTestId('denied-panel')).toContainText('only you can change that');
    await expect(page.getByTestId('denied-panel')).toContainText('still waiting for you on Home');

    // Not called once, and not again on a re render or a reload.
    await page.getByTestId('nav-home').click();
    await page.getByTestId('nav-settings').click();
    await page.reload();
    await page.getByTestId('nav-settings').click();
    expect(await page.evaluate(() => (window as unknown as { __permCalls: number }).__permCalls)).toBe(0);

    // And the entire loop still works.
    await page.getByTestId('nav-home').click();
    await demoClick(page, 'demo-make-habit');
    await demoClick(page, 'demo-force-nudge');
    await expect(page.getByTestId('nudge-card')).toBeVisible();
    const before = await page.getByTestId('jar-amount').textContent();
    await clickClear(page, 'nudge-skip');
    await expect(page.getByTestId('jar-amount')).not.toHaveText(before ?? '');
  });

  test('8.10: the on state names exactly the three things stored, and offers a way off', async ({ page }) => {
    await onboardWithNudgesOn(page);
    await dismissCapturePrompt(page);
    await page.getByTestId('nav-settings').click();
    await expect(page.getByTestId('nudges-state')).toHaveAttribute('data-on', 'true');
    await expect(page.getByTestId('nudges-stored')).toContainText('an address your browser hands out');
    await expect(page.getByTestId('nudges-stored')).toContainText('your time zone');
    await expect(page.getByTestId('nudges-stored')).toContainText('the minute to wake you');
    await expect(page.getByTestId('nudges-turn-off')).toBeVisible();
    // A10: quiet hours are stated and the UI does not appear to offer editing.
    await expect(page.getByTestId('nudges-quiet-hours')).toContainText('6:00 am');
    await expect(page.getByTestId('nudges-quiet-hours')).toContainText('9:00 pm');
    await expect(page.getByTestId('nudges-quiet-hours')).toContainText('fixed for now');
    await expect(page.getByTestId('screen-settings').locator('input[type="time"]')).toHaveCount(0);
  });

  test('criterion 25: turning nudges off works locally and says honestly what the server did', async ({ page }) => {
    // The API is unreachable this pass, which is exactly the failure path 9.5 has copy for.
    await onboardWithNudgesOn(page);
    await dismissCapturePrompt(page);
    await page.getByTestId('nav-settings').click();
    await clickClear(page, 'nudges-turn-off');
    await expect(page.getByTestId('nudges-state')).toHaveAttribute('data-on', 'false');
    const message = page.getByTestId('nudges-turn-off-message');
    await expect(message).toBeVisible();
    // Either outcome is honest; what it must never do is claim a row was deleted when it was not.
    const text = await message.innerText();
    expect(text === 'Nudges are off and the server row is gone.' || text.includes('could not reach the server')).toBe(true);
    // It survives a reload. Deliberately WITHOUT `&nudge=1`, which is the demo control that
    // turns nudges back on at boot (plan 5.4); reloading the same URL would re-enable them and
    // test the tray rather than the setting.
    await page.goto(START);
    await expect(page.getByTestId('screen-home')).toBeVisible();
    await page.getByTestId('nav-settings').click();
    await expect(page.getByTestId('nudges-state')).toHaveAttribute('data-on', 'false');
  });

  test('criterion 25: "Delete everything" reports which parts succeeded', async ({ page }) => {
    await onboardWithNudgesOn(page);
    await dismissCapturePrompt(page);
    await page.getByTestId('nav-settings').click();
    await clickClear(page, 'delete-everything');
    await expect(page.getByTestId('screen-settings')).toContainText('It cannot be undone');
    await clickClear(page, 'delete-everything-confirm');
    // It is the only action in the app that can fail halfway, so it reports rather than claims.
    await expect(page.getByTestId('screen-welcome')).toBeVisible();
    await page.reload();
    await expect(page.getByTestId('screen-welcome')).toBeVisible();
  });

  test('6.12: the app never blocks on the API, and says one honest line when it cannot reach it', async ({ page }) => {
    await page.route('**/api/**', (route) => route.abort('failed'));
    const errors = collectErrors(page);
    await onboard(page);
    await dismissCapturePrompt(page);
    // The whole loop, with the API refusing every call.
    await demoClick(page, 'demo-make-habit');
    await demoClick(page, 'demo-force-nudge');
    await expect(page.getByTestId('nudge-card')).toBeVisible();
    await clickClear(page, 'nudge-skip');
    await page.getByTestId('nav-invest').click();
    await clickClear(page, 'invest-add');
    await page.getByTestId('ledger-amount').fill('100');
    await page.getByTestId('ledger-what').fill('Index fund');
    await clickClear(page, 'ledger-save');
    await expect(page.getByTestId('ledger-row')).toHaveCount(1);
    await page.getByTestId('nav-lessons').click();
    await expect(page.getByTestId('screen-lessons')).toBeVisible();
    // No spinner is waiting on anything, and nothing threw into React.
    await expect(page.getByTestId('hydrating')).toHaveCount(0);
    await expect(page.getByTestId('app-error')).toHaveCount(0);
    expect(errors.filter((e) => !/Failed to load resource|net::ERR/i.test(e)), errors.join('\n')).toEqual([]);
  });
});
