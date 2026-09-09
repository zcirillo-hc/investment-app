// CODER spec, cycle 4 (v1 plan 13.2), trimmed for v2: C4-1 persistence race, C4-3 long-press,
// C4-5 milestone PNG, C4-6 error boundary, C4-7 code splitting.
//
// C4-2 (allocation touch drag) is deleted with the allocation builder. C4-7 no longer looks
// for a `charts` chunk, because Recharts left the project.
// Run: npx playwright test tests/e2e/cycle4.spec.ts
import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { START, closeMilestoneIfOpen, collectErrors, declineAllCatches, demoClick, dismissCapturePrompt, onboard, readTray } from './fixtures';
import { STORAGE_KEY } from '../../src/config';

const QUERY = '?demo=1&freeze=1&start=2026-06-15&seed=42';

/** Touch is driven through CDP: Playwright's touchscreen only taps, and these need drags. */
async function touchPoint(cdp: CDPSession, type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel', x?: number, y?: number) {
  await cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: type === 'touchEnd' || type === 'touchCancel' ? [] : [{ x: Math.round(x!), y: Math.round(y!) }],
  });
}

test.describe('C4-1: no state is lost on an immediate reload', () => {
  test('ten action-then-reload cycles keep every action', async ({ page }) => {
    const errors = collectErrors(page);
    await onboard(page);
    for (let i = 1; i <= 10; i++) {
      await closeMilestoneIfOpen(page);
      await declineAllCatches(page);
      const before = Number(await readTray(page, 'demo-day-index'));
      const jarBefore = (await page.getByTestId('jar-amount').textContent()) ?? '';
      // The action, then a reload with no delay and no wait for the IndexedDB write.
      await demoClick(page, 'demo-next-day');
      await page.reload();
      await expect(page.getByTestId('screen-home')).toBeVisible();
      expect(await readTray(page, 'demo-day-index'), `cycle ${i}: day index survived the reload`).toBe(String(before + 1));
      const jarAfter = (await page.getByTestId('jar-amount').textContent()) ?? '';
      console.log(`cycle ${i}: day ${before} -> ${before + 1}, jar ${jarBefore} -> ${jarAfter}`);
    }
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('the mirror is written synchronously and Reset demo clears it', async ({ page }) => {
    await onboard(page);
    const mirror = await page.evaluate(() => window.localStorage.getItem('spare-change-state-mirror'));
    expect(mirror, 'a mirror exists after onboarding').not.toBeNull();
    expect(JSON.parse(mirror!).rev).toBeGreaterThan(0);
    await page.getByTestId('nav-settings').click();
    await page.getByTestId('settings-reset').click();
    await page.getByTestId('settings-reset-confirm').click();
    await expect(page.getByTestId('screen-welcome')).toBeVisible();
    await page.reload();
    await expect(page.getByTestId('screen-welcome')).toBeVisible();
  });

  test('a corrupt mirror on boot does not break the app', async ({ page }) => {
    const errors = collectErrors(page);
    await onboard(page);
    await page.evaluate(() => window.localStorage.setItem('spare-change-state-mirror', '{"rev":999,"state":'));
    await page.reload();
    await expect(page.getByTestId('screen-home')).toBeVisible();
    await expect(page.getByTestId('app-error')).toHaveCount(0);
    expect(errors, errors.join('\n')).toEqual([]);
  });
});

/*
 * C4-2 (the three allocation boundary handle cases: touch drag, cancelled drag, and keyboard
 * stepping) is DELETED with `AllocationBar.tsx` and the allocation builder. There is no
 * proportional control anywhere in v2 and nothing replaced it, so the behaviour those cases
 * protected no longer exists to protect. Three cases removed.
 */

test.describe('C4-3: long-press on the logo under touch', () => {
  test('a long touch opens the tray and the next short tap does not toggle it', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'needs a touch-enabled project');
    const errors = collectErrors(page);
    await onboard(page);
    await page.goto('/?freeze=1&start=2026-06-15&seed=42');
    await expect(page.getByTestId('screen-home')).toBeVisible();
    await expect(page.getByTestId('demo-tray')).toHaveCount(0);
    const logo = (await page.getByTestId('logo').boundingBox())!;
    const x = logo.x + logo.width / 2;
    const y = logo.y + logo.height / 2;

    const cdp = await page.context().newCDPSession(page);
    await touchPoint(cdp, 'touchStart', x, y);
    await page.waitForTimeout(800);
    await touchPoint(cdp, 'touchEnd');
    await expect(page.getByTestId('demo-tray')).toBeVisible();

    // A normal tap right after must not close or re-toggle the tray.
    await page.touchscreen.tap(x, y);
    await page.waitForTimeout(200);
    await expect(page.getByTestId('demo-tray')).toBeVisible();
    // and the tray is still usable. A direct click, not `demoClick`: the long press above is
    // what opened the tray and this case is about the tray staying open through a tap.
    await page.getByTestId('demo-next-day').click();
    await expect(page.getByTestId('demo-day-index')).toHaveText('1');
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('a cancelled press does not open the tray, and a later long press still works', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'needs a touch-enabled project');
    await onboard(page);
    await page.goto('/?freeze=1&start=2026-06-15&seed=42');
    await expect(page.getByTestId('screen-home')).toBeVisible();
    const logo = (await page.getByTestId('logo').boundingBox())!;
    const x = logo.x + logo.width / 2;
    const y = logo.y + logo.height / 2;

    const cdp = await page.context().newCDPSession(page);
    await touchPoint(cdp, 'touchStart', x, y);
    await page.waitForTimeout(250);
    await touchPoint(cdp, 'touchCancel');
    await page.waitForTimeout(700);
    await expect(page.getByTestId('demo-tray'), 'a cancelled press never opens the tray').toHaveCount(0);

    await touchPoint(cdp, 'touchStart', x, y);
    await page.waitForTimeout(800);
    await touchPoint(cdp, 'touchEnd');
    await expect(page.getByTestId('demo-tray')).toBeVisible();
  });

  test('the logo keeps the callout and touch-action rules that protect the gesture', async ({ page }) => {
    await onboard(page);
    const css = await page.getByTestId('logo').evaluate((el) => {
      const s = getComputedStyle(el);
      return { touchAction: s.touchAction, userSelect: s.userSelect, classes: el.className };
    });
    console.log('logo css', css);
    expect(css.touchAction).toBe('manipulation');
    expect(css.userSelect).toBe('none');
    expect(css.classes).toContain('long-press-target');
    // Chromium does not implement -webkit-touch-callout, so it never appears in the CSSOM.
    // The rule is for iOS Safari; assert it is in the stylesheet the class comes from.
    const rule = readFileSync('src/index.css', 'utf8').split('.long-press-target')[1] ?? '';
    expect(rule.split('}')[0]).toContain('-webkit-touch-callout: none');
  });
});

/**
 * Lights all three milestones by writing them into the persisted envelope, the same way the
 * tester plants state. This bypasses ~18 simulated months for a rendering check.
 */
async function plantMilestones(page: Page): Promise<void> {
  await page.evaluate(
    (key) =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('keyval-store');
        req.onerror = () => reject(new Error('open failed'));
        req.onsuccess = () => {
          const tx = req.result.transaction('keyval', 'readwrite');
          const store = tx.objectStore('keyval');
          const g = store.get(key);
          g.onsuccess = () => {
            const env = JSON.parse(g.result);
            const day = env.state.clock.dayIndex;
            env.state.milestones.first100Kept = day;
            env.state.milestones.firstSummer = day;
            env.state.milestones.pathFinished = day;
            store.put(JSON.stringify(env), key);
          };
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(new Error('write failed'));
        };
      }),
    STORAGE_KEY,
  );
}

test.describe('C4-5: the milestone card really downloads a 1080 x 1080 PNG', () => {
  test('all three cards save a 1080 x 1080 image', async ({ page }) => {
    await onboard(page);
    for (let i = 0; i < 3; i++) await demoClick(page, 'demo-next-day');
    await declineAllCatches(page);
    await closeMilestoneIfOpen(page);
    await plantMilestones(page);
    // C4-10: this used to reload without ?demo=1, because the tray (fixed, z-50) covered the
    // modal's save buttons. The modal now ends above the tray, so the demo boot is kept.
    await page.goto('/?demo=1&freeze=1&start=2026-06-15&seed=42');
    await expect(page.getByTestId('screen-home')).toBeVisible();
    await closeMilestoneIfOpen(page);
    await page.getByTestId('milestones-link').click();
    await expect(page.getByTestId('milestone-modal')).toBeVisible();

    for (const key of ['first100Kept', 'firstSummer', 'pathFinished']) {
      const card = page.getByTestId(`milestone-${key}`);
      await expect(card, `${key} card is shown`).toBeVisible();
      const [download] = await Promise.all([page.waitForEvent('download'), card.getByTestId('milestone-save').click()]);
      const file = await download.path();
      expect(file, `${key} download path`).toBeTruthy();
      const buf = readFileSync(file!);
      // PNG signature then the IHDR chunk: width and height are big-endian at bytes 16 and 20.
      expect(buf.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      expect(buf.subarray(12, 16).toString('ascii')).toBe('IHDR');
      const width = buf.readUInt32BE(16);
      const height = buf.readUInt32BE(20);
      console.log(`${key}: ${download.suggestedFilename()} ${width}x${height}, ${buf.length} bytes`);
      expect({ key, width, height }).toEqual({ key, width: 1080, height: 1080 });
    }
  });
});

test.describe('C4-10: the milestone save control is reachable with the demo tray open', () => {
  test('nothing covers milestone-save on any of the three cards', async ({ page }) => {
    await onboard(page);
    await plantMilestones(page);
    await page.goto(QUERY);
    await expect(page.getByTestId('screen-home')).toBeVisible();
    await closeMilestoneIfOpen(page);
    // The tray must be the one plan 6.13 gives a ?demo=1 boot: open, not collapsed.
    await expect(page.getByTestId('demo-tray')).toBeVisible();
    await page.getByTestId('milestones-link').click();
    await expect(page.getByTestId('milestone-modal')).toBeVisible();

    for (const key of ['first100Kept', 'firstSummer', 'pathFinished']) {
      const save = page.getByTestId(`milestone-${key}`).getByTestId('milestone-save');
      await save.scrollIntoViewIfNeeded();
      const onTop = await save.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return { covered: !el.contains(hit) && hit !== el, by: (hit as HTMLElement)?.dataset?.testid ?? hit?.className ?? '' };
      });
      console.log(`${key}: save control top element = ${onTop.covered ? `COVERED by ${onTop.by}` : 'itself'}`);
      expect(onTop.covered, `${key}: milestone-save is covered by ${onTop.by}`).toBe(false);
      // And it really takes the click: this is the download the C4-5 test decodes.
      const [download] = await Promise.all([page.waitForEvent('download'), save.click({ timeout: 5000 })]);
      expect(download.suggestedFilename()).toContain(key);
    }
  });
});

test.describe('C4-6: the error boundary actually catches a render error', () => {
  test('the fallback renders and its reset control recovers the app', async ({ page }) => {
    await onboard(page);
    await page.goto(`/${QUERY}&boom=1`);
    await expect(page.getByTestId('app-error')).toBeVisible();
    await expect(page.getByTestId('app-error-reset')).toBeVisible();
    const box = (await page.getByTestId('app-error-reset').boundingBox())!;
    expect(Math.round(box.height)).toBeGreaterThanOrEqual(44);
    await expect(page.getByTestId('screen-home')).toHaveCount(0);
    await page.getByTestId('app-error-reset').click();
    // Reset demo behaviour: storage cleared, back to a working Welcome screen.
    await expect(page.getByTestId('screen-welcome')).toBeVisible();
    await expect(page.getByTestId('app-error')).toHaveCount(0);
    await page.getByTestId('welcome-name').fill('Sam');
    await page.getByTestId('welcome-continue').click();
    await expect(page.getByTestId('screen-summer')).toBeVisible();
  });

  test('the harness is inert without the query flag', async ({ page }) => {
    const errors = collectErrors(page);
    await onboard(page);
    await page.goto(`/${QUERY}&boom=0`);
    await expect(page.getByTestId('screen-home')).toBeVisible();
    await expect(page.getByTestId('app-error')).toHaveCount(0);
    expect(errors, errors.join('\n')).toEqual([]);
  });
});

test.describe('C4-7: every route still loads with the chunk split in place', () => {
  test('a walk and a hard reload on every route, with no console or page errors', async ({ page }) => {
    const errors = collectErrors(page);
    await onboard(page);
    await dismissCapturePrompt(page);
    // Plan v2 1.1: /portfolio is gone and Places, Invest, the capture and Learn arrived.
    const routes = ['/', '/activity', '/places', '/invest', '/invest/capture', '/lessons', '/lessons/L7', '/learn', '/learn/E01', '/summer', '/settings'];
    for (const r of routes) {
      await page.goto(r + QUERY);
      await expect(page.locator('[data-testid^="screen-"]').first(), `${r} rendered after a reload`).toBeVisible();
      const screen = await page.evaluate(() => document.querySelector('[data-testid^="screen-"]')?.getAttribute('data-testid'));
      console.log(`reload ${r} ->`, screen);
    }
    // and by in-app navigation
    for (const [nav, screen] of [
      ['nav-places', 'screen-places'],
      ['nav-invest', 'screen-invest'],
      ['nav-lessons', 'screen-lessons'],
      ['nav-settings', 'screen-settings'],
      ['nav-home', 'screen-home'],
    ]) {
      await page.getByTestId(nav).click();
      await expect(page.getByTestId(screen)).toBeVisible();
    }
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('the onboarding guard still redirects after the split', async ({ page }) => {
    await page.goto(START);
    await expect(page.getByTestId('screen-welcome')).toBeVisible();
    for (const r of ['/onboarding/quiz', '/onboarding/allocation', '/settings', '/portfolio', '/places', '/invest', '/learn']) {
      await page.goto(r + QUERY);
      await expect(page.getByTestId('screen-welcome'), `${r} redirects to Welcome`).toBeVisible();
    }
    await onboard(page);
    await page.goto(`/welcome${QUERY}`);
    await expect(page.getByTestId('screen-home'), 'a completed profile leaves Welcome').toBeVisible();
  });
});
