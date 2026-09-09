/**
 * TESTER v2, job 1 (browser half): fresh regression cover for the v1 defects that still apply
 * to v2, written from scratch because every `tester-*` file was deleted in the pivot.
 *
 * D9 is moot (the fee and the simulated portfolio are gone with the engine).
 * D1 and its neighbourhood live in tests/unit/tester-v2-import.test.ts.
 */
import { expect, test, type Page } from '@playwright/test';
import {
  START,
  collectErrors,
  collapseTray,
  demoClick,
  onboard,
  openTray,
  assertNoHorizontalScroll,
} from './fixtures';
import { STORAGE_KEY } from '../../src/config';

/** Every distinct term on the given screen, as testids. */
async function termIds(page: Page): Promise<string[]> {
  return page.locator('[data-testid^="term-"]').evaluateAll((els) =>
    Array.from(new Set(els.map((e) => e.getAttribute('data-testid') ?? ''))).filter(Boolean),
  );
}

test.describe('D11: a tooltip tapped low in the viewport must stay open', () => {
  const SCREENS: Array<{ path: string; ready: string }> = [
    { path: '/', ready: 'screen-home' },
    { path: '/places', ready: 'screen-places' },
    { path: '/invest', ready: 'screen-invest' },
    { path: '/activity', ready: 'screen-activity' },
    { path: '/settings', ready: 'screen-settings' },
    { path: '/learn', ready: 'screen-learn' },
  ];

  test('every term on every screen holds its bubble at four scroll offsets', async ({ page }) => {
    test.setTimeout(240_000);
    await onboard(page);
    const failures: string[] = [];
    let taps = 0;

    for (const s of SCREENS) {
      await page.goto(`${START}#`.replace('#', '') + (s.path === '/' ? '' : ''));
      await page.goto(s.path === '/' ? START : `${s.path}?demo=1&freeze=1&start=2026-06-15&seed=42`);
      await expect(page.getByTestId(s.ready)).toBeVisible();
      await collapseTray(page);
      const ids = await termIds(page);
      if (ids.length === 0) continue;

      const vh = page.viewportSize()!.height;
      const docH = await page.evaluate(() => document.documentElement.scrollHeight);
      const offsets = [0, Math.round((docH - vh) * 0.5), Math.max(0, docH - vh - 10), Math.max(0, docH - vh)];

      for (const off of offsets) {
        await page.evaluate((y) => window.scrollTo(0, y), off);
        await page.waitForTimeout(250);
        for (const id of ids) {
          const el = page.getByTestId(id).first();
          if ((await el.count()) === 0) continue;
          const box = await el.boundingBox();
          if (!box) continue;
          // Only tap terms actually inside the viewport; a term off screen is not this test.
          if (box.y < 60 || box.y + box.height > vh - 10) continue;
          // Confirm nothing overlays it before we claim a failure.
          const onTop = await page.evaluate(
            ([x, y, testid]) => {
              const hit = document.elementFromPoint(x as number, y as number);
              return !!hit?.closest(`[data-testid="${testid}"]`);
            },
            [box.x + box.width / 2, box.y + box.height / 2, id] as const,
          );
          if (!onTop) continue;
          await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
          taps += 1;
          await page.waitForTimeout(120);
          const bubbles = await page.getByTestId('tooltip-bubble').count();
          if (bubbles !== 1) failures.push(`${s.path} ${id} @scroll ${off} y=${Math.round(box.y)} -> ${bubbles} bubbles`);
          await page.keyboard.press('Escape');
          await page.waitForTimeout(60);
        }
      }
    }
    // eslint-disable-next-line no-console
    console.log(`D11: ${taps} taps checked`);
    expect(taps, 'the sweep must actually tap something').toBeGreaterThan(10);
    expect(failures, `terms that closed their own bubble:\n${failures.join('\n')}`).toEqual([]);
  });

  test('a bubble flips above its anchor when there is no room below', async ({ page }) => {
    await onboard(page);
    await page.goto(`/settings?demo=1&freeze=1&start=2026-06-15&seed=42`);
    await expect(page.getByTestId('screen-settings')).toBeVisible();
    await collapseTray(page);
    const vh = page.viewportSize()!.height;
    const ids = await termIds(page);
    let sawAbove = false;
    for (const id of ids) {
      const el = page.getByTestId(id).first();
      const box = await el.boundingBox();
      if (!box) continue;
      await page.evaluate((y) => window.scrollTo(0, y), Math.max(0, box.y - (vh - 90)));
      await page.waitForTimeout(200);
      const b2 = await el.boundingBox();
      if (!b2 || b2.y < vh - 140) continue;
      await page.mouse.click(b2.x + b2.width / 2, b2.y + b2.height / 2);
      await page.waitForTimeout(150);
      const placement = await page.getByTestId('tooltip-bubble').first().getAttribute('data-placement');
      const bubbleBox = await page.getByTestId('tooltip-bubble').first().boundingBox();
      if (placement === 'above') sawAbove = true;
      expect(bubbleBox!.y + bubbleBox!.height, `bubble for ${id} must stay inside the viewport`).toBeLessThanOrEqual(vh + 1);
      await page.keyboard.press('Escape');
    }
    expect(sawAbove, 'at least one low anchor should have flipped its bubble above').toBe(true);
  });
});

test.describe('D12 / D7: 44 px tap targets', () => {
  test('every user-facing control on every screen is at least 44 px, tray and inline terms excepted', async ({ page }) => {
    test.setTimeout(180_000);
    // Welcome first, on an empty profile: the D12 control lives there and is outside the shell.
    await page.goto(START);
    await expect(page.getByTestId('screen-welcome')).toBeVisible();
    const small: string[] = [];
    const audit = async (label: string) => {
      const found = await page.evaluate(() => {
        const out: string[] = [];
        const sel = 'button, a[href], input:not([type=hidden]), select, [role="button"], [role="switch"], summary';
        for (const el of Array.from(document.querySelectorAll(sel))) {
          const testid = el.getAttribute('data-testid') ?? '';
          if (el.closest('[data-testid="demo-tray"]') || testid.startsWith('demo-')) continue;
          if (testid.startsWith('term-')) continue; // inline Term spans are the declared exemption
          // The file inputs behind the two import buttons are out of the tab order and
          // aria-hidden by the D12 fix; the visible button in front of them is the control.
          if (el.getAttribute('aria-hidden') === 'true' || el.getAttribute('tabindex') === '-1') continue;
          const r = el.getBoundingClientRect();
          if (r.width === 0 && r.height === 0) continue;
          // sr-only file inputs are 1x1 by construction and are never tapped; the visible
          // button in front of them is the control. (They are still a duplicate accessible
          // name on Settings, which is reported separately.)
          if (r.width <= 2 && r.height <= 2) continue;
          const style = getComputedStyle(el as HTMLElement);
          if (style.visibility === 'hidden' || style.display === 'none') continue;
          if (r.height < 44 || r.width < 44) {
            out.push(`${testid || el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().slice(0, 24)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
          }
        }
        return out;
      });
      for (const f of found) small.push(`${label}: ${f}`);
    };
    await audit('welcome');
    await onboard(page);
    for (const [path, ready] of [
      ['/', 'screen-home'],
      ['/places', 'screen-places'],
      ['/invest', 'screen-invest'],
      ['/activity', 'screen-activity'],
      ['/settings', 'screen-settings'],
      ['/lessons', 'screen-lessons'],
      ['/learn', 'screen-learn'],
      ['/summer', 'screen-summer'],
    ] as const) {
      await page.goto(path === '/' ? START : `${path}?demo=1&freeze=1&start=2026-06-15&seed=42`);
      await expect(page.getByTestId(ready)).toBeVisible();
      await collapseTray(page);
      await audit(path);
    }
    // eslint-disable-next-line no-console
    console.log(`SMALL TARGETS (${small.length}):\n${small.join('\n')}`);
    expect(small, `controls under 44 px:\n${small.join('\n')}`).toEqual([]);
  });
});

test.describe('D5: scroll position must not carry across route changes', () => {
  test('every tab change and every drill-in lands at the top', async ({ page }) => {
    await onboard(page);
    const scrollToBottom = async () => {
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(150);
    };
    const bad: string[] = [];
    for (const [tab, ready] of [
      ['nav-places', 'screen-places'],
      ['nav-invest', 'screen-invest'],
      ['nav-lessons', 'screen-lessons'],
      ['nav-settings', 'screen-settings'],
      ['nav-home', 'screen-home'],
    ] as const) {
      await scrollToBottom();
      const before = await page.evaluate(() => window.scrollY);
      await page.getByTestId(tab).click();
      await expect(page.getByTestId(ready)).toBeVisible();
      await page.waitForTimeout(200);
      const after = await page.evaluate(() => window.scrollY);
      if (after > 8) bad.push(`${tab}: scrollY ${before} -> ${after}`);
    }
    expect(bad, `routes that opened scrolled:\n${bad.join('\n')}`).toEqual([]);
  });
});

test.describe('D4: an onboarding step cannot be reached ahead of the persisted progress', () => {
  test('typing a later onboarding URL with only a name resumes at the right step', async ({ page }) => {
    await page.goto(START);
    await expect(page.getByTestId('screen-welcome')).toBeVisible();
    await page.getByTestId('welcome-name').fill('Sam');
    await page.getByTestId('welcome-continue').click();
    await expect(page.getByTestId('screen-summer')).toBeVisible();
    // Jump past the fear check straight to the app.
    await page.goto(`/?demo=1&freeze=1&start=2026-06-15&seed=42`);
    const home = await page.getByTestId('screen-home').count();
    const summer = await page.getByTestId('screen-summer').count();
    const fear = await page.getByTestId('screen-fear').count();
    // eslint-disable-next-line no-console
    console.log(`D4: home=${home} summer=${summer} fear=${fear}`);
    expect(home, 'Home must not be reachable before onboarding completes').toBe(0);
    expect(summer + fear, 'must resume inside onboarding').toBeGreaterThan(0);
  });

  test('a step with no name behind it redirects to Welcome', async ({ page }) => {
    // Reaching /onboarding/fear with only a name is DELIBERATE (routes.tsx stepAllowed: the
    // summer inputs are all optional). What must not be reachable is a step with nothing
    // behind it at all.
    await page.goto(`/onboarding/fear?demo=1&freeze=1&start=2026-06-15&seed=42`);
    await expect(page.getByTestId('screen-welcome')).toBeVisible();
    await page.goto(`/onboarding/summer?demo=1&freeze=1&start=2026-06-15&seed=42`);
    await expect(page.getByTestId('screen-welcome')).toBeVisible();
  });
});

test.describe('D10: a hand-corrupted clock.startDate must still boot', () => {
  test('the app renders something rather than an empty document', async ({ page }) => {
    const errors = collectErrors(page);
    await onboard(page);
    await demoClick(page, 'demo-next-day');
    // Rewrite the persisted envelope with an unparseable start date.
    await page.evaluate(
      ([key]) =>
        new Promise<void>((resolve) => {
          const req = indexedDB.open('keyval-store');
          req.onsuccess = () => {
            const tx = req.result.transaction('keyval', 'readwrite');
            const store = tx.objectStore('keyval');
            const get = store.get(key);
            get.onsuccess = () => {
              const raw = JSON.parse(get.result as string);
              raw.state.clock.startDate = 'someday';
              store.put(JSON.stringify(raw), key);
              tx.oncomplete = () => resolve();
            };
          };
        }),
      [STORAGE_KEY] as const,
    );
    await page.goto(START);
    await page.waitForTimeout(1200);
    const bodyLen = await page.evaluate(() => document.body.innerText.trim().length);
    const screen = await page.evaluate(() => document.querySelector('[data-testid^="screen-"], [data-testid="app-error"]')?.getAttribute('data-testid') ?? null);
    // eslint-disable-next-line no-console
    console.log(`D10: screen=${screen} bodyLen=${bodyLen} errors=${errors.length}`);
    expect(bodyLen, 'the app rendered nothing at all').toBeGreaterThan(0);
    expect(screen, 'no screen and no error boundary rendered').not.toBeNull();
  });
});

test.describe('D8: form validation must not leave a stale or missing message', () => {
  test('Welcome shows its own message for an over-long name and clears it when fixed', async ({ page }) => {
    await page.goto(START);
    await expect(page.getByTestId('screen-welcome')).toBeVisible();
    await page.getByTestId('welcome-name').fill('x'.repeat(41));
    await page.getByTestId('welcome-continue').click();
    await expect(page.getByTestId('welcome-error')).toBeVisible();
    await page.getByTestId('welcome-name').fill('Sam');
    await page.getByTestId('welcome-continue').click();
    await expect(page.getByTestId('screen-summer')).toBeVisible();
  });

  test('a Settings name edit is saved and does not fail silently', async ({ page }) => {
    await onboard(page);
    await page.goto(`/settings?demo=1&freeze=1&start=2026-06-15&seed=42`);
    await collapseTray(page);
    await page.getByTestId('settings-name').fill('Samantha');
    await page.getByTestId('settings-name').blur();
    await page.waitForTimeout(300);
    await page.reload();
    await expect(page.getByTestId('screen-settings')).toBeVisible();
    await expect(page.getByTestId('settings-name')).toHaveValue('Samantha');
  });
});

test.describe('D2: the seed must not be re-derived by a profile edit', () => {
  test('changing the name after onboarding leaves the ?seed override in place', async ({ page }) => {
    await onboard(page);
    const before = await (async () => {
      await openTray(page);
      const t = await page.getByTestId('demo-seed').textContent();
      await collapseTray(page);
      return t;
    })();
    await page.goto(`/settings?demo=1&freeze=1&start=2026-06-15&seed=42`);
    await collapseTray(page);
    await page.getByTestId('settings-name').fill('Samantha');
    await page.getByTestId('settings-name').blur();
    await page.waitForTimeout(300);
    await page.goto(START);
    await openTray(page);
    const after = await page.getByTestId('demo-seed').textContent();
    // eslint-disable-next-line no-console
    console.log(`D2: seed before=${before} after=${after}`);
    expect(after).toBe(before);
    expect((after ?? '').includes('42')).toBe(true);
  });
});

test.describe('no horizontal scroll on any screen (6.13)', () => {
  test('every screen fits its viewport', async ({ page }) => {
    test.setTimeout(120_000);
    await onboard(page);
    for (const [path, ready] of [
      ['/', 'screen-home'],
      ['/places', 'screen-places'],
      ['/invest', 'screen-invest'],
      ['/activity', 'screen-activity'],
      ['/settings', 'screen-settings'],
      ['/lessons', 'screen-lessons'],
      ['/learn', 'screen-learn'],
      ['/summer', 'screen-summer'],
    ] as const) {
      await page.goto(path === '/' ? START : `${path}?demo=1&freeze=1&start=2026-06-15&seed=42`);
      await expect(page.getByTestId(ready)).toBeVisible();
      await collapseTray(page);
      await assertNoHorizontalScroll(page);
    }
  });
});
