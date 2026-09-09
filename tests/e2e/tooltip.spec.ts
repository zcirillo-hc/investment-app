/**
 * Coder regression suite for the plan 6 "Global components" Tooltip spec, written after D11.
 * The rule that broke in cycle 2 was "close on any scroll event": opening a bubble low in the
 * viewport makes the browser emit a scroll event, so the tooltip closed itself in the same
 * interaction. These tests sweep every term on every screen at several scroll offsets, on
 * both viewports, and check the positioning rules the spec adds.
 *
 * The demo tray (plan 6.13, a developer tool that only exists under `?demo=1`) is hidden
 * before each sweep: it is a fixed overlay across the lower half of the viewport, so a tap
 * aimed at a term underneath it lands on the tray and never reaches the term.
 */
import { expect, test, type Page } from '@playwright/test';
import { closeMilestoneIfOpen, declineAllCatches, demoClick, dismissCapturePrompt, onboard } from './fixtures';

// Plan v2 1.1: the tabs are Home, Places, Invest, Lessons, Settings. Activity moved to a link
// from Home and Portfolio is deleted, so the sweep reaches Activity through Home instead.
const SCREENS = [
  ['nav-home', 'screen-home'],
  ['nav-places', 'screen-places'],
  ['nav-invest', 'screen-invest'],
  ['nav-lessons', 'screen-lessons'],
  ['nav-settings', 'screen-settings'],
] as const;

async function hideDevChrome(page: Page) {
  await page.evaluate(() => {
    const tray = document.querySelector('[data-testid="demo-tray"]') as HTMLElement | null;
    if (tray) tray.style.display = 'none';
  });
}

/**
 * A lived in state: places, a habit, a nudge, a ledger entry and unlocked lessons all exist, so
 * every term renders somewhere. The v1 version drove this to the first sweep, which no longer
 * happens (R6.2).
 */
async function funded(page: Page) {
  await onboard(page);
  await dismissCapturePrompt(page);
  await demoClick(page, 'demo-make-habit');
  await declineAllCatches(page);
  await closeMilestoneIfOpen(page);
  for (let i = 0; i < 3; i++) {
    await demoClick(page, 'demo-skip-week');
    await declineAllCatches(page);
    await closeMilestoneIfOpen(page);
  }
}

interface Probe {
  where: string;
  bubbles: number;
  inside: boolean;
  gap: number;
  placement: string | null;
  hit: string | null;
}

const BUBBLE = '[data-testid="tooltip-bubble"]';

/**
 * Waits for the scroll position to stop moving instead of sleeping for a fixed 350 ms. Scroll
 * events are dispatched before the frame's `requestAnimationFrame` callbacks, so three frames
 * with an unchanged `scrollY` means every scroll handler (including the tooltip's own
 * reposition) has already run. Bounded at 60 frames so a page that never settles fails on the
 * assertions rather than hanging.
 *
 * This and the two `waitForCount` calls below replace 630 ms of unconditional sleeping per tap.
 * The sweep taps 116 terms per viewport, so that was over 70 s of the 120 s budget spent
 * waiting on nothing, which is what made this spec flaky under load rather than any assertion.
 */
async function settleScroll(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        let last = window.scrollY;
        let stable = 0;
        let frames = 0;
        const step = () => {
          if (window.scrollY === last) stable += 1;
          else {
            stable = 0;
            last = window.scrollY;
          }
          if (stable >= 3 || ++frames > 60) resolve();
          else requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }),
  );
}

/**
 * Waits for the bubble count to reach `n`, and returns whether it got there. A miss is not an
 * error: the caller reports the count it actually finds, so "no bubble opened" and "two bubbles
 * opened" stay real failures of the sweep rather than becoming timeouts.
 */
async function waitForCount(page: Page, n: number): Promise<boolean> {
  return page
    .waitForFunction(([sel, want]) => document.querySelectorAll(sel as string).length === want, [BUBBLE, n] as const, { timeout: 2000 })
    .then(
      () => true,
      () => false,
    );
}

/** Puts the term at `fromTop` px down the viewport, taps it, and reports what happened. */
async function tapTermAt(page: Page, id: string, fromTop: number): Promise<Probe | null> {
  await page.evaluate(
    ({ sel, y }) => {
      const el = document.querySelector(`[data-testid="${sel}"]`);
      if (el) window.scrollBy(0, el.getBoundingClientRect().top - y);
    },
    { sel: id, y: fromTop },
  );
  // Let every scroll event drain, so nothing here depends on scroll timing.
  await settleScroll(page);
  const box = await page.getByTestId(id).first().boundingBox();
  if (!box) return null;
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const hit = await page.evaluate((p) => {
    const el = document.elementFromPoint(p.x, p.y) as HTMLElement | null;
    return el?.getAttribute('data-testid') ?? el?.closest('[data-testid]')?.getAttribute('data-testid') ?? el?.nodeName ?? null;
  }, point);
  // Only the term itself is a meaningful tap: the sticky header and the bottom tab bar cover
  // the extremes of the viewport and would swallow the tap.
  if (hit !== id) return { where: `${id}@${fromTop}`, bubbles: -1, inside: true, gap: 0, placement: null, hit };
  await page.touchscreen.tap(point.x, point.y).catch(async () => {
    await page.mouse.click(point.x, point.y);
  });
  // The bubble is placed in a `useLayoutEffect` in the commit that mounts it, so the first
  // painted frame already has its final position: seeing it in the DOM is enough.
  await waitForCount(page, 1);
  const out = await page.evaluate((sel) => {
    const bubbles = document.querySelectorAll('[data-testid="tooltip-bubble"]');
    const t = document.querySelector(`[data-testid="${sel}"]`)!.getBoundingClientRect();
    if (bubbles.length !== 1) return { n: bubbles.length, inside: false, gap: 0, placement: null as string | null };
    const el = bubbles[0] as HTMLElement;
    const b = el.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const placement = el.getAttribute('data-placement');
    const gap = placement === 'above' ? Math.round(t.top - b.bottom) : Math.round(b.top - t.bottom);
    return { n: 1, inside: b.top >= 0 && b.left >= 0 && b.bottom <= vh && b.right <= vw, gap, placement };
  }, id);
  await page.keyboard.press('Escape');
  // The next probe must start from a closed state; if Escape did not close it, the next tap's
  // count assertion is what reports that, so a miss here is not fatal.
  await waitForCount(page, 0);
  return { where: `${id}@${fromTop}`, bubbles: out.n, inside: out.inside, gap: out.gap, placement: out.placement, hit };
}

test.describe('Tooltip (plan 6 global components)', () => {
  test('every term on every screen holds its bubble at every scroll position', async ({ page }) => {
    // The widest test in the suite: 116 taps per viewport, each one a scroll, a hit test, a tap,
    // a measurement and an Escape. Even with the fixed sleeps gone it is minutes of real work,
    // so it gets its own budget instead of borrowing the suite default and timing out under
    // load. Coverage is unchanged: every term, every screen, all four scroll offsets.
    test.setTimeout(360_000);
    await funded(page);
    const vh = page.viewportSize()!.height;
    const offsets = [Math.round(vh * 0.25), Math.round(vh * 0.5), Math.round(vh * 0.72), vh - 130];
    const failures: string[] = [];
    let checked = 0;
    let skipped = 0;
    for (const [tab, screen] of SCREENS) {
      await page.getByTestId(tab).click();
      await expect(page.getByTestId(screen)).toBeVisible();
      await hideDevChrome(page);
      await page.waitForTimeout(200);
      const ids = [
        ...new Set(await page.locator('[data-testid^="term-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')!))),
      ];
      expect(ids.length, `${screen} must render terms`).toBeGreaterThan(0);
      for (const id of ids) {
        for (const off of offsets) {
          const r = await tapTermAt(page, id, off);
          if (!r) continue;
          if (r.bubbles === -1) {
            skipped += 1;
            continue;
          }
          checked += 1;
          if (r.bubbles !== 1) failures.push(`${screen}/${r.where}: ${r.bubbles} bubbles`);
          else if (!r.inside) failures.push(`${screen}/${r.where}: bubble outside the viewport`);
          else if (r.gap < 0 || r.gap > 24) failures.push(`${screen}/${r.where}: gap ${r.gap} px from its term`);
        }
      }
    }
    console.log(`tooltip sweep: ${checked} taps checked, ${skipped} obstructed and skipped, ${failures.length} failures`, failures);
    expect(checked).toBeGreaterThan(40);
    expect(failures).toEqual([]);
  });

  test('a scroll repositions the bubble and never closes it', async ({ page }) => {
    await funded(page);
    await page.getByTestId('nav-settings').click();
    await expect(page.getByTestId('screen-settings')).toBeVisible();
    await hideDevChrome(page);
    const vh = page.viewportSize()!.height;
    const first = await tapTermAt(page, 'term-quietHours', Math.round(vh * 0.4));
    expect(first?.bubbles, 'the term must open a bubble to start with').toBe(1);
    // Re-open (tapTermAt closes with Escape) and then scroll under it.
    await page.getByTestId('term-quietHours').first().click();
    await page.waitForTimeout(150);
    expect(await page.getByTestId('tooltip-bubble').count()).toBe(1);
    for (const delta of [-90, 140, -50]) {
      const moved = await page.evaluate((d) => {
        const before = window.scrollY;
        window.scrollBy(0, d);
        return { before, after: window.scrollY };
      }, delta);
      await page.waitForTimeout(250);
      const state = await page.evaluate(() => {
        const b = document.querySelector('[data-testid="tooltip-bubble"]');
        const t = document.querySelector('[data-testid="term-quietHours"]')!.getBoundingClientRect();
        if (!b) return { n: 0, gap: null as number | null };
        const r = b.getBoundingClientRect();
        return { n: 1, gap: Math.round(b.getAttribute('data-placement') === 'above' ? t.top - r.bottom : r.top - t.bottom) };
      });
      console.log('scroll', moved, '->', state);
      if (moved.before !== moved.after) {
        expect(state.n, 'a scroll must never close the bubble').toBe(1);
        expect(state.gap!, 'the bubble must follow its anchor').toBeLessThanOrEqual(24);
        expect(state.gap!).toBeGreaterThanOrEqual(0);
      }
    }
  });

  test('the bubble flips above its anchor when there is no room below', async ({ page }) => {
    await funded(page);
    await page.getByTestId('nav-settings').click();
    await expect(page.getByTestId('screen-settings')).toBeVisible();
    await hideDevChrome(page);
    // A short viewport with the tab bar out of the way, so a term can genuinely sit with no
    // room under it. The tab bar is a fixed overlay, not part of the fit calculation.
    await page.evaluate(() => {
      const nav = document.querySelector('[data-testid="nav"]') as HTMLElement | null;
      if (nav) nav.style.display = 'none';
    });
    const size = page.viewportSize()!;
    await page.setViewportSize({ width: size.width, height: 420 });
    await page.waitForTimeout(300);
    const r = await tapTermAt(page, 'term-quietHours', 350);
    console.log('flip probe:', r);
    expect(r?.bubbles).toBe(1);
    expect(r?.placement).toBe('above');
    expect(r?.inside).toBe(true);
    await page.setViewportSize(size);
  });

  test('only one bubble at a time, and Escape, an outside tap and blur all close it', async ({ page }) => {
    await funded(page);
    // Was the portfolio screen and its `usStocks` / `bonds` terms. Both left with the
    // simulated engine; Places carries two terms in the same shape.
    await page.getByTestId('nav-places').click();
    await expect(page.getByTestId('screen-places')).toBeVisible();
    await hideDevChrome(page);
    const bubbles = () => page.getByTestId('tooltip-bubble').count();
    await page.getByTestId('term-place').first().click();
    expect(await bubbles()).toBe(1);
    await page.getByTestId('term-habit').first().click();
    expect(await bubbles()).toBe(1);
    const text = await page.getByTestId('tooltip-bubble').textContent();
    expect(text).toContain('3 times');
    await page.keyboard.press('Escape');
    expect(await bubbles()).toBe(0);
    await page.getByTestId('term-place').first().click();
    expect(await bubbles()).toBe(1);
    await page.getByTestId('nav-settings').focus();
    await page.waitForTimeout(200);
    expect(await bubbles()).toBe(0);
    await page.getByTestId('term-place').first().click();
    expect(await bubbles()).toBe(1);
    await page.mouse.click(4, 4);
    await page.waitForTimeout(200);
    expect(await bubbles()).toBe(0);
  });
});
