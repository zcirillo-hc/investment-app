import { expect, type Page } from '@playwright/test';
import { STORAGE_KEY } from '../../src/config';

export const START = '/?demo=1&freeze=1&start=2026-06-15&seed=42';

export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}

export async function assertNoHorizontalScroll(page: Page): Promise<void> {
  const ok = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  expect(ok, 'no horizontal page scroll').toBe(true);
}

/**
 * Plan v2 6.13 and criterion 20a. Apple's own minimum is 44 by 44 points, and it is checked at
 * every phone viewport rather than only the smallest, because a bar that grows by the home
 * indicator inset can squeeze its own items below the minimum on the phones with the largest
 * insets, which are the big ones.
 */
export async function assertTapTargets(page: Page, selector: string): Promise<void> {
  const boxes = await page.locator(selector).evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { w: r.width, h: r.height, text: (el.textContent ?? '').trim().slice(0, 30) };
    }),
  );
  for (const b of boxes) {
    expect(Math.round(b.h), `"${b.text}" is ${b.h} px tall`).toBeGreaterThanOrEqual(44);
    expect(Math.round(b.w), `"${b.text}" is ${b.w} px wide`).toBeGreaterThanOrEqual(44);
  }
}

/**
 * Plan v2 8.5. Onboarding is three steps now: name, summer money, fear check. The quiz and the
 * allocation builder steps are deleted with the screens, and so is `setAllocation`, which
 * stepped a slider that no longer exists.
 */
export async function onboard(page: Page, opts: { checkScroll?: boolean; url?: string } = {}): Promise<void> {
  const scroll = async () => {
    if (opts.checkScroll) await assertNoHorizontalScroll(page);
  };
  await page.goto(opts.url ?? START);
  await expect(page.getByTestId('screen-welcome')).toBeVisible();
  await scroll();
  await page.getByTestId('welcome-name').fill('Sam');
  await page.getByTestId('welcome-continue').click();
  await expect(page.getByTestId('screen-summer')).toBeVisible();
  await page.getByTestId('summer-earned').fill('3000');
  await page.getByTestId('summer-left').fill('500');
  await page.getByTestId('summer-age').selectOption('19');
  const diffText = (await page.getByTestId('summer-diff').textContent()) ?? '';
  const m = /\$([\d,]+) more at 65/.exec(diffText);
  expect(m, `summer-diff text: ${diffText}`).not.toBeNull();
  const diff = Number(m![1].replace(/,/g, ''));
  expect(diff).toBeGreaterThan(50000);
  expect(diff).toBeLessThan(60000);
  await scroll();
  await page.getByTestId('summer-continue').click();
  await expect(page.getByTestId('screen-fear')).toBeVisible();
  await page.getByTestId('fear-option-pointless').click();
  await scroll();
  await page.getByTestId('fear-continue').click();
  await expect(page.getByTestId('screen-home')).toBeVisible();
  // The demo tray is a fixed overlay across the lower half of a 375 px viewport (plan 5.4).
  // Left open it sandwiches page content between itself and the sticky header, and Playwright
  // re-centres an element on every click retry, so a control in the middle of a long screen
  // ends up unclickable. It is collapsed by default here and opened only by `demoClick`, which
  // is also closer to what a real user sees: without `?demo=1` there is no tray at all.
  await collapseTray(page);
}

export async function collapseTray(page: Page): Promise<void> {
  if ((await page.getByTestId('demo-tray').count()) > 0) await page.getByTestId('demo-collapse').click();
}

export async function openTray(page: Page): Promise<void> {
  if ((await page.getByTestId('demo-open').count()) > 0) await page.getByTestId('demo-open').click();
  await expect(page.getByTestId('demo-tray')).toBeVisible();
}

/** Clicks a demo tray control, opening the tray first and collapsing it again afterwards. */
export async function demoClick(page: Page, testId: string): Promise<void> {
  await openTray(page);
  await page.getByTestId(testId).click();
  await collapseTray(page);
}

/** Reads one of the tray's readouts (day index, place count, habit count, nudge status). */
export async function readTray(page: Page, testId: string): Promise<string> {
  await openTray(page);
  const text = ((await page.getByTestId(testId).textContent()) ?? '').trim();
  await collapseTray(page);
  return text;
}

/** Advances the demo clock N days, answering any catch sheet that interrupts. */
export async function nextDays(page: Page, n: number): Promise<void> {
  await openTray(page);
  for (let i = 0; i < n; i++) {
    if ((await page.getByTestId('catch-sheet').count()) > 0 || (await page.getByTestId('milestone-modal').count()) > 0) {
      await collapseTray(page);
      await declineAllCatches(page);
      await closeMilestoneIfOpen(page);
      await openTray(page);
    }
    await page.getByTestId('demo-next-day').click();
  }
  await collapseTray(page);
  await declineAllCatches(page);
  await closeMilestoneIfOpen(page);
}

export async function declineAllCatches(page: Page): Promise<number> {
  let n = 0;
  while ((await page.getByTestId('catch-sheet').count()) > 0 && n < 10) {
    await page.getByTestId('catch-decline').click();
    n += 1;
    await page.waitForTimeout(50);
  }
  return n;
}

/** Closes a fired milestone modal if one is showing (it appears once the catch queue is empty). */
export async function closeMilestoneIfOpen(page: Page): Promise<boolean> {
  if ((await page.getByTestId('milestone-modal').count()) === 0) return false;
  await page.getByTestId('milestone-close').click();
  await expect(page.getByTestId('milestone-modal')).toHaveCount(0);
  return true;
}

/**
 * Clicks page content with the demo tray out of the way.
 *
 * At 375 px the app has a sticky header at the top and, with `?demo=1`, a fixed demo tray near
 * the bottom, which leaves a narrow band a control has to land in. Playwright re-runs its own
 * `scrollIntoViewIfNeeded` on every click retry and re-centres the element, so scrolling by
 * hand does not settle it: the element ends up under the header or under the tray by turns
 * until the test times out.
 *
 * So this collapses the tray, clicks, and reopens it. That is what a real user would do, and
 * a real user without `?demo=1` never sees the tray at all, so nothing here is working around
 * a defect that ships. It keeps Playwright's actionability checks intact, which matters: the
 * alternative, dispatching a DOM click, would pass even if a control really were unreachable.
 */
export async function clickClear(page: Page, testId: string): Promise<void> {
  await collapseTray(page);
  await page.getByTestId(testId).click();
}

/**
 * Puts the app in the R4.5 "nudges are on" state with a pending nudge.
 *
 * `?nudge=1` only fires once onboarding is complete (App.tsx), so it takes a second
 * navigation: onboard, then reload with the flag. That ordering is the product's, not the
 * harness's, and it is what makes one navigation reach a nudge for a person who already has a
 * profile.
 */
export async function onboardWithNudgesOn(page: Page): Promise<void> {
  await onboard(page);
  await page.goto(`${START}&nudge=1`);
  await expect(page.getByTestId('screen-home')).toBeVisible();
  await collapseTray(page);
}

/** Dismisses the once only invest capture prompt on Home, if it is showing. */
export async function dismissCapturePrompt(page: Page): Promise<void> {
  if ((await page.getByTestId('invest-capture-prompt').count()) > 0) {
    await clickClear(page, 'invest-capture-skip');
    await expect(page.getByTestId('invest-capture-prompt')).toHaveCount(0);
  }
}

/** Waits until the persisted IndexedDB state contains the given substring (guards reload races). */
export async function waitForPersisted(page: Page, needle: string): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(
          ([n, key]) =>
            new Promise<boolean>((resolve) => {
              const req = indexedDB.open('keyval-store');
              req.onerror = () => resolve(false);
              req.onsuccess = () => {
                const db = req.result;
                try {
                  const tx = db.transaction('keyval', 'readonly');
                  const get = tx.objectStore('keyval').get(key);
                  get.onsuccess = () => resolve(typeof get.result === 'string' && get.result.includes(n));
                  get.onerror = () => resolve(false);
                } catch {
                  resolve(false);
                }
              };
            }),
          [needle, STORAGE_KEY] as const,
        ),
      { timeout: 10_000 },
    )
    .toBe(true);
}

/**
 * Plan 6.4. Reads the pending nudge record the service worker composes from, so a spec can
 * assert what the notification WOULD say without waiting for a push.
 */
export async function readPendingNudge(page: Page): Promise<Record<string, unknown> | null> {
  return page.evaluate(
    () =>
      new Promise<Record<string, unknown> | null>((resolve) => {
        const req = indexedDB.open('keyval-store');
        req.onerror = () => resolve(null);
        req.onsuccess = () => {
          try {
            const tx = req.result.transaction('keyval', 'readonly');
            const get = tx.objectStore('keyval').get('spare-change-pending-nudge');
            get.onsuccess = () => resolve((get.result as Record<string, unknown>) ?? null);
            get.onerror = () => resolve(null);
          } catch {
            resolve(null);
          }
        };
      }),
  );
}
