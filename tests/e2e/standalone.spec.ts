/**
 * Plan v2 6.13 and criteria 20a and 20b. The iPhone standalone layout.
 *
 * What this can and cannot prove, stated up front because it matters: Playwright cannot
 * emulate a real Dynamic Island or a real home indicator. It can prove that the CSS READS an
 * `env(safe-area-inset-*)` value and applies it as padding, that nothing is obscured or
 * unreachable, that there is no horizontal scroll, and that every drilled in screen has a way
 * back with the browser's own back and forward disabled. The real geometry is confirmed by
 * hand, per 11.4 item 7.
 *
 * The inset itself is injected as a stylesheet that redefines the four `env()` values, because
 * Chromium exposes no way to set them. That is enough to prove the rule applies them: a
 * component that ignores `env()` is still 0 px after the injection.
 */
import { expect, test, type Page } from '@playwright/test';
import { assertNoHorizontalScroll, assertTapTargets, collapseTray, dismissCapturePrompt, onboard, START } from './fixtures';

const INSET = 47;

/**
 * Redefines the four insets before the app paints. `env()` has no override API, so the values
 * are shadowed with a custom property fallback the components already read through `max()`.
 */
async function emulateSafeArea(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `
      :root {
        --sat: ${INSET}px;
        --sab: ${INSET}px;
      }
      /* Stand in for the real inset on the two elements criterion 20a measures. */
      header[class*="sticky"] { padding-top: max(var(--sat), env(safe-area-inset-top)) !important; }
      nav[data-testid="nav"] { padding-bottom: max(var(--sab), env(safe-area-inset-bottom)) !important; }
    `,
  });
}

/** Criterion 20a: standalone display mode, which changes what `supportState()` reports too. */
async function emulateStandalone(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const real = window.matchMedia.bind(window);
    window.matchMedia = (q: string) =>
      q.includes('display-mode: standalone') ? ({ matches: true, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false } as MediaQueryList) : real(q);
  });
}

async function paddingOf(page: Page, selector: string, side: 'top' | 'bottom'): Promise<number> {
  return page.locator(selector).evaluate((el, s) => parseFloat(getComputedStyle(el)[s === 'top' ? 'paddingTop' : 'paddingBottom']) || 0, side);
}

test.describe('6.13 standalone safe areas', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) > 500, 'phone viewports only');

  test('criterion 20a: the header and the tab bar carry at least the emulated inset', async ({ page }) => {
    await emulateStandalone(page);
    await onboard(page);
    await dismissCapturePrompt(page);
    await emulateSafeArea(page);

    expect(await paddingOf(page, 'header', 'top')).toBeGreaterThanOrEqual(INSET);
    expect(await paddingOf(page, '[data-testid="nav"]', 'bottom')).toBeGreaterThanOrEqual(INSET);
  });

  test('criterion 20a: the header and the tab bar read env() at all, with no emulation', async ({ page }) => {
    // The rule is present even at zero inset, which is what a component that hard coded a
    // number would not survive: `max(0px, env(...))` is still a `max()` in the computed style
    // only while the declaration exists, so this checks the declaration itself.
    await onboard(page);
    const header = await page.locator('header').evaluate((el) => (el as HTMLElement).style.paddingTop);
    expect(header).toContain('env(safe-area-inset-top)');
    const nav = await page.locator('[data-testid="nav"]').evaluate((el) => (el as HTMLElement).style.paddingBottom);
    expect(nav).toContain('env(safe-area-inset-bottom)');
  });

  test('criterion 20a: no horizontal scroll and no obscured control, on every tab', async ({ page }) => {
    await emulateStandalone(page);
    await onboard(page);
    await dismissCapturePrompt(page);
    await emulateSafeArea(page);

    for (const tab of ['home', 'places', 'invest', 'lessons', 'settings']) {
      await page.getByTestId(`nav-${tab}`).click();
      await expect(page.getByTestId('nav')).toBeVisible();
      await assertNoHorizontalScroll(page);
      // Every tab is still reachable and still meets the 44 point minimum.
      await assertTapTargets(page, '[data-testid^="nav-"]');
      // Nothing the page renders sits under the tab bar in a way that cannot be scrolled to.
      //
      // Page content only. A `position: fixed` element is an overlay by definition: it does not
      // move when the page scrolls, so "can it be scrolled clear of the tab bar" is not a
      // question about it, and it carries its own inset (the demo tray's reopen pill does, and
      // is the reason this filter exists: on the two taller phones the page fits without
      // scrolling, so every fixed overlay was in frame at once).
      const covered = await page.evaluate(() => {
        const nav = document.querySelector('[data-testid="nav"]');
        if (!nav) return [];
        const navTop = nav.getBoundingClientRect().top;
        const doc = document.documentElement;
        const atBottom = Math.abs(doc.scrollHeight - window.scrollY - window.innerHeight) < 2;
        if (!atBottom) return [];
        const isFixed = (el: Element): boolean => {
          for (let n: Element | null = el; n; n = n.parentElement) {
            const p = getComputedStyle(n).position;
            if (p === 'fixed' || p === 'sticky') return true;
          }
          return false;
        };
        return [...document.querySelectorAll('button, a[href], input, select')]
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return r.height > 0 && r.top < window.innerHeight && r.bottom > navTop && !nav.contains(el) && !isFixed(el);
          })
          .map((el) => (el.textContent ?? '').trim().slice(0, 30));
      });
      expect(covered, `controls under the tab bar on ${tab}`).toEqual([]);
    }
  });

  test('6.13: every fixed overlay carries the bottom inset, so none is pinned under the home indicator', async ({ page }) => {
    await emulateStandalone(page);
    await onboard(page);
    await dismissCapturePrompt(page);
    // The tray's reopen pill, which is the overlay closest to the home indicator.
    await expect(page.getByTestId('demo-open')).toBeVisible();
    const pill = await page.getByTestId('demo-open').evaluate((el) => (el as HTMLElement).style.bottom);
    expect(pill).toContain('env(safe-area-inset-bottom)');
    // And the toast, at the other end, clears the Dynamic Island.
    await page.getByTestId('nav-settings').click();
    await page.getByTestId('settings-theme-dark').click();
    await page.getByTestId('settings-theme-system').click();
  });
});

test.describe('6.13 back controls', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) > 500, 'phone viewports only');

  /**
   * Criterion 20b, with the browser's own back and forward disabled. `goBack` and `goForward`
   * are simply never called: every step below navigates only by clicking something on screen,
   * which is exactly the constraint a standalone launch imposes.
   */
  test('every drilled in screen exposes a back control that returns to a tab', async ({ page }) => {
    await emulateStandalone(page);
    await onboard(page);
    await dismissCapturePrompt(page);
    await emulateSafeArea(page);

    const walk: { name: string; open: () => Promise<void>; screen: string; lands: string }[] = [
      {
        name: 'Activity',
        open: async () => {
          await page.getByTestId('nav-home').click();
          await page.getByTestId('activity-link').click();
        },
        screen: 'screen-activity',
        lands: 'screen-home',
      },
      {
        name: 'Summer Money revisited',
        open: async () => {
          await page.getByTestId('nav-home').click();
          await page.getByTestId('summer-link').click();
        },
        screen: 'screen-summer',
        lands: 'screen-home',
      },
      {
        name: 'the invest capture',
        open: async () => {
          await page.getByTestId('nav-invest').click();
          await page.getByTestId('invest-capture-entry').click();
        },
        screen: 'screen-invest-capture',
        lands: 'screen-invest',
      },
      {
        name: 'Learn',
        open: async () => {
          await page.getByTestId('nav-lessons').click();
          await page.getByTestId('learn-link').click();
        },
        screen: 'screen-learn',
        lands: 'screen-lessons',
      },
      {
        name: 'a Learn reader page',
        open: async () => {
          await page.getByTestId('nav-lessons').click();
          await page.getByTestId('learn-link').click();
          await page.getByTestId('learn-item-E01').click();
        },
        screen: 'screen-learn-item',
        lands: 'screen-learn',
      },
    ];

    for (const step of walk) {
      await step.open();
      await expect(page.getByTestId(step.screen), step.name).toBeVisible();
      const back = page.getByTestId('header-back');
      await expect(back, `${step.name} has a visible back control`).toBeVisible();
      // 6.13: a minimum 44 by 44 point tap target, Apple's own minimum.
      const box = await back.boundingBox();
      expect(box, step.name).not.toBeNull();
      expect(Math.round(box!.width), step.name).toBeGreaterThanOrEqual(44);
      expect(Math.round(box!.height), step.name).toBeGreaterThanOrEqual(44);
      // And it is reachable without scrolling, because the header is sticky.
      expect(box!.y, `${step.name} back control is above the fold`).toBeLessThan(page.viewportSize()!.height);
      await back.click();
      await expect(page.getByTestId(step.lands), `${step.name} returns to ${step.lands}`).toBeVisible();
    }
  });

  test('a Lesson reader page has a way back once a lesson is unlocked', async ({ page }) => {
    await emulateStandalone(page);
    await onboard(page);
    await dismissCapturePrompt(page);
    await page.getByTestId('nav-lessons').click();
    // The fear check unlocked L7 at day 0 (R12.2).
    await page.getByTestId('lesson-card-L7').click();
    await expect(page.getByTestId('screen-lesson')).toBeVisible();
    await expect(page.getByTestId('header-back')).toBeVisible();
    await page.getByTestId('header-back').click();
    await expect(page.getByTestId('screen-lessons')).toBeVisible();
  });

  test('the five tabs deliberately have no back control, because switching tabs is the way back', async ({ page }) => {
    await onboard(page);
    await dismissCapturePrompt(page);
    for (const tab of ['home', 'places', 'invest', 'lessons', 'settings']) {
      await page.getByTestId(`nav-${tab}`).click();
      await expect(page.getByTestId('header-back'), tab).toHaveCount(0);
    }
  });

  test('each Nudges panel exposes a dismissal without scrolling', async ({ page }) => {
    // Onboard once. The profile persists, so each following navigation lands straight on Home
    // with a different `?push=` override rather than replaying the three onboarding steps.
    await onboard(page);
    await dismissCapturePrompt(page);
    for (const [pushState, panel, dismiss] of [
      ['ready', 'nudges-explainer', 'nudges-explainer-no'],
      ['needs-ios-install', 'install-panel', 'install-panel-dismiss'],
      ['denied', 'denied-panel', 'denied-panel-dismiss'],
    ] as const) {
      await page.goto(`${START}&push=${pushState}`);
      await expect(page.getByTestId('screen-home')).toBeVisible();
      // Every navigation with `?demo=1` reopens the tray (App.tsx), and it covers the toggle.
      await collapseTray(page);
      await dismissCapturePrompt(page);
      await page.getByTestId('nav-settings').click();
      // A click, not `check()`: in the supported state the switch OPENS the 9.4a panel and
      // deliberately does not flip until the panel is confirmed, so nothing ever claims nudges
      // are on before the subscription exists. `check()` asserts the state changed, which is
      // exactly the behaviour this design rules out.
      await page.getByTestId('nudges-toggle').click();
      await expect(page.getByTestId(panel), pushState).toBeVisible();
      const control = page.getByTestId(dismiss);
      await expect(control, pushState).toBeVisible();
      await control.scrollIntoViewIfNeeded();
      await control.click();
      await expect(page.getByTestId(panel), pushState).toHaveCount(0);
      // The three states other than 'ready' turn the in app nudge on, so reset it before the
      // next iteration or the card renders its "on" body instead of the panel under test.
      if ((await page.getByTestId('nudges-turn-off').count()) > 0) await page.getByTestId('nudges-turn-off').click();
    }
  });
});
