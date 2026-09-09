// CODER spec, cycle 4 (C4-4), amended cycle 5 for both themes, rewritten for v2.
//
// Plan v2 criterion 17: 0 serious and 0 critical violations on Home, Places, Invest, Activity,
// Settings, Welcome, Summer, Learn, a Learn reader page, the nudge card, and each of the four
// Nudges card panels (off, install required, denied, on), in both themes, at both viewports.
//
// The quiz, allocation and portfolio scans are deleted with their screens.
// Run: npx playwright test tests/e2e/axe.spec.ts
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { START, clickClear, collapseTray, closeMilestoneIfOpen, declineAllCatches, demoClick, dismissCapturePrompt, onboard } from './fixtures';
import { STORAGE_KEY } from '../../src/config';

interface Finding {
  screen: string;
  id: string;
  impact: string;
  nodes: number;
  help: string;
  target: string;
}

/** Opens the first term on the screen, so the tooltip bubble is part of the scanned tree. */
async function openATerm(page: Page, within?: string): Promise<string | null> {
  const scope = within ? page.getByTestId(within) : page.locator('body');
  const term = scope.locator('[data-testid^="term-"]').first();
  if ((await term.count()) === 0) return null;
  await term.click();
  await expect(page.getByTestId('tooltip-bubble')).toBeVisible();
  return term.getAttribute('data-testid');
}

async function scan(page: Page, screen: string, found: Finding[], within?: string): Promise<void> {
  // Let framer-motion settle: mid-transition opacities blend foreground into background and
  // axe reads the blended pair, which is a measurement artefact rather than a real defect.
  await page.waitForTimeout(500);
  const term = await openATerm(page, within);
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  for (const v of results.violations) {
    found.push({
      screen,
      id: v.id,
      impact: v.impact ?? 'unknown',
      nodes: v.nodes.length,
      help: v.help,
      target: String(v.nodes[0]?.target?.[0] ?? ''),
    });
  }
  console.log(
    `axe ${screen}: term=${term ?? 'none'} violations=${results.violations.length} serious/critical=${serious.length}` +
      (results.violations.length ? ` [${results.violations.map((v) => `${v.id}:${v.impact}`).join(', ')}]` : ''),
  );
  if (term) await page.keyboard.press('Escape');
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`C4-4: accessibility scan (axe-core) of every screen, ${theme} theme`, () => {
  // Scanned with animations off: an element caught mid-transition (framer-motion) or
  // mid-`animate-pulse` reports the blended foreground/background pair, which measures the
  // animation rather than the design. The settled rendering is what a reader actually sees.
  test.use({ reducedMotion: 'reduce' });

  // The theme mirror is read synchronously at boot (src/lib/theme.ts), before hydration, so
  // setting it here paints the whole walk in one theme without touching Settings mid-run.
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((t) => window.localStorage.setItem('spare-change-theme', t), theme);
  });

  test(`${theme}: no serious or critical violations on any screen, with a tooltip open`, async ({ page }) => {
    const found: Finding[] = [];

    // Onboarding, screen by screen (plan 9.2 steps 1 to 5).
    await page.goto(START);
    await expect(page.getByTestId('screen-welcome')).toBeVisible();
    await scan(page, 'welcome', found);
    await page.getByTestId('welcome-name').fill('Sam');
    await page.getByTestId('welcome-continue').click();
    await expect(page.getByTestId('screen-summer')).toBeVisible();
    await page.getByTestId('summer-earned').fill('3000');
    await page.getByTestId('summer-left').fill('500');
    await scan(page, 'summer', found);
    await page.getByTestId('summer-continue').click();
    await expect(page.getByTestId('screen-fear')).toBeVisible();
    await page.getByTestId('fear-option-pointless').click();
    await scan(page, 'fear', found);
    await page.getByTestId('fear-continue').click();

    // The app shell.
    await expect(page.getByTestId('screen-home')).toBeVisible();
    await scan(page, 'home (with the invest capture prompt)', found);
    await dismissCapturePrompt(page);
    await scan(page, 'home (empty)', found);
    for (let i = 0; i < 6; i++) {
      await demoClick(page, 'demo-next-day');
      await declineAllCatches(page);
    }
    await closeMilestoneIfOpen(page);
    await scan(page, 'home (funded)', found);

    // The nudge card, which is a distinct rendering on Home.
    await demoClick(page, 'demo-make-habit');
    await demoClick(page, 'demo-force-nudge');
    await expect(page.getByTestId('nudge-card')).toBeVisible();
    await scan(page, 'home (nudge card)', found, 'nudge-card');

    await clickClear(page, 'activity-link');
    await expect(page.getByTestId('screen-activity')).toBeVisible();
    await scan(page, 'activity', found);
    await page.getByTestId('header-back').click();

    await page.getByTestId('nav-places').click();
    await expect(page.getByTestId('screen-places')).toBeVisible();
    await scan(page, 'places', found);

    await page.getByTestId('nav-invest').click();
    await expect(page.getByTestId('screen-invest')).toBeVisible();
    await scan(page, 'invest (empty)', found);
    await clickClear(page, 'invest-add');
    await scan(page, 'invest (ledger form)', found);
    await page.getByTestId('ledger-amount').fill('250');
    await page.getByTestId('ledger-what').fill('Index fund');
    await clickClear(page, 'ledger-save');
    await scan(page, 'invest (one entry)', found);

    await clickClear(page, 'invest-capture-entry');
    await expect(page.getByTestId('screen-invest-capture')).toBeVisible();
    await clickClear(page, 'invest-capture-chip-indexFund');
    await scan(page, 'invest capture', found);
    await page.getByTestId('header-back').click();

    await page.getByTestId('nav-lessons').click();
    await expect(page.getByTestId('screen-lessons')).toBeVisible();
    await scan(page, 'lessons', found);

    await page.getByTestId('lesson-card-L7').click();
    await expect(page.getByTestId('lesson-body')).toBeVisible();
    await scan(page, 'lesson (unlocked)', found);
    await page.getByTestId('header-back').click();

    await page.goto(`/lessons/L5${new URL(page.url()).search}`);
    await expect(page.getByTestId('screen-lesson')).toBeVisible();
    await scan(page, 'lesson (locked)', found);

    // Criterion 17: Learn and a Learn reader page.
    await page.getByTestId('nav-lessons').click();
    await clickClear(page, 'learn-link');
    await expect(page.getByTestId('screen-learn')).toBeVisible();
    await scan(page, 'learn', found);
    await clickClear(page, 'learn-item-E03');
    await expect(page.getByTestId('screen-learn-item')).toBeVisible();
    await scan(page, 'learn reader', found);
    await page.getByTestId('header-back').click();

    // Summer Money, revisited after onboarding (6.13).
    await page.getByTestId('nav-home').click();
    await clickClear(page, 'summer-link');
    await expect(page.getByTestId('screen-summer')).toBeVisible();
    await scan(page, 'summer (revisited)', found);
    await page.getByTestId('header-back').click();

    await page.getByTestId('nav-settings').click();
    await expect(page.getByTestId('screen-settings')).toBeVisible();
    await scan(page, 'settings', found);

    // The catch sheet.
    await page.getByTestId('nav-home').click();
    await demoClick(page, 'demo-land-paycheck');
    await expect(page.getByTestId('catch-sheet')).toBeVisible();
    await page.getByTestId('catch-change-pct').click();
    await scan(page, 'catch sheet', found, 'catch-sheet');
    await page.getByTestId('catch-decline').click();
    await closeMilestoneIfOpen(page);

    // The milestone modal, with all three cards planted (see cycle4.spec.ts C4-5).
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
    await page.goto(START);
    await expect(page.getByTestId('screen-home')).toBeVisible();
    await closeMilestoneIfOpen(page);
    await clickClear(page, 'milestones-link');
    await expect(page.getByTestId('milestone-modal')).toBeVisible();
    await scan(page, 'milestone modal', found, 'milestone-modal');
    await page.getByTestId('milestone-close').click();

    // Criterion 17: each of the four Nudges card panels. The `?push=` override is the only way
    // to make one Chromium profile look like an iPhone Safari tab and a denied browser in the
    // same run (plan 5.4's demo parameters, extended for exactly this).
    for (const [pushState, panel, label] of [
      ['ready', 'nudges-explainer', 'nudges (off, supported)'],
      ['needs-ios-install', 'install-panel', 'nudges (install required)'],
      ['denied', 'denied-panel', 'nudges (denied)'],
    ] as const) {
      await page.goto(`${START}&push=${pushState}`);
      await expect(page.getByTestId('screen-home')).toBeVisible();
      // Every `?demo=1` navigation reopens the tray, which covers the toggle at 375 px.
      await collapseTray(page);
      await dismissCapturePrompt(page);
      await page.getByTestId('nav-settings').click();
      // The walk above turned nudges on (demo-force-nudge does, by design), and the toggle is
      // then a way OFF rather than a way into the panel. Reset it first.
      if ((await page.getByTestId('nudges-turn-off').count()) > 0) {
        await page.getByTestId('nudges-turn-off').click();
        await expect(page.getByTestId('nudges-state')).toHaveAttribute('data-on', 'false');
      }
      // A click, not `check()`: in the supported state the switch opens the 9.4a panel and
      // deliberately does not flip until that panel is confirmed.
      await page.getByTestId('nudges-toggle').click();
      await expect(page.getByTestId(panel)).toBeVisible();
      await scan(page, label, found, 'nudges-card');
    }
    // `?nudge=1` only fires once onboarding is complete, which it is by now.
    await page.goto(`${START}&nudge=1`);
    await expect(page.getByTestId('screen-home')).toBeVisible();
    await collapseTray(page);
    await dismissCapturePrompt(page);
    await page.getByTestId('nav-settings').click();
    await expect(page.getByTestId('nudges-state')).toHaveAttribute('data-on', 'true');
    await scan(page, 'nudges (on)', found, 'nudges-card');

    // The error boundary's own screen (C4-6) is a screen a user can end up on.
    await page.goto(`/${new URL(page.url()).search}&boom=1`);
    await expect(page.getByTestId('app-error')).toBeVisible();
    await scan(page, 'error boundary', found);

    const serious = found.filter((f) => f.impact === 'serious' || f.impact === 'critical');
    console.log(`all violations (${theme}):`, JSON.stringify(found, null, 2));
    expect(serious, `${theme}: serious or critical violations:\n${JSON.stringify(serious, null, 2)}`).toEqual([]);
  });
  });
}

test.describe('C4-4 and C4-9: tooltip Escape behaviour', () => {
  test.use({ reducedMotion: 'reduce' });

  test('Escape closes a tooltip and returns focus to its term', async ({ page }) => {
    // Was run on Welcome, whose only term left with the v1 privacy line. Home has several.
    await onboard(page);
    await dismissCapturePrompt(page);
    const term = page.locator('[data-testid^="term-"]').first();
    const id = await term.getAttribute('data-testid');
    await term.click();
    await expect(page.getByTestId('tooltip-bubble')).toBeVisible();
    // The bubble is a tooltip and the term points at it while it is open.
    const describedBy = await term.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(await page.getByTestId('tooltip-bubble').getAttribute('id')).toBe(describedBy);
    expect(await page.getByTestId('tooltip-bubble').getAttribute('role')).toBe('tooltip');

    // Move focus away, so the return is unambiguous, then reopen by keyboard.
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('tooltip-bubble')).toHaveCount(0);
    expect(await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))).toBe(id);

    // Same again from a keyboard-opened tooltip.
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('tooltip-bubble')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('tooltip-bubble')).toHaveCount(0);
    expect(await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))).toBe(id);
  });

  /**
   * C4-9 (D13). The cycle 4 version of the test above only ever opened the bubble by click or
   * by Enter, both of which leave the anchor already focused, so the Escape handler's
   * `focus()` was a no-op and the reopen it causes never showed up.
   */
  test('Escape closes a HOVER-opened tooltip and it stays closed', async ({ page }) => {
    await onboard(page);
    await dismissCapturePrompt(page);
    // Park focus somewhere that is not the term, so the focus return is a real focus change.
    await page.getByTestId('nav-home').focus();
    const term = page.locator('[data-testid^="term-"]').first();
    const id = await term.getAttribute('data-testid');
    await term.hover();
    await expect(page.getByTestId('tooltip-bubble')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('tooltip-bubble')).toHaveCount(0);
    // Focus still comes back to the anchor: the fix suppresses the reopen, not the return.
    expect(await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))).toBe(id);
    // And it stays closed while the pointer is still resting on the term.
    await page.waitForTimeout(150);
    await expect(page.getByTestId('tooltip-bubble')).toHaveCount(0);

    // The suppression is one-shot: a real focus-in still opens the tooltip afterwards.
    await page.getByTestId('nav-home').focus();
    await term.focus();
    await expect(page.getByTestId('tooltip-bubble')).toBeVisible();
  });
});
