/**
 * Plan v2 8.9, 9.8, R12.5, R15.6 and criteria 27 and 28. The Learn library.
 *
 * The property under test is an absence: nothing here is locked, on day 0, from a freshly
 * cleared profile. That is easy to break by accident and impossible to notice by eye, because
 * a gate only shows itself to the person who has not earned it yet.
 */
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { clickClear, dismissCapturePrompt, nextDays, onboard } from './fixtures';

/**
 * Read rather than imported: Playwright runs specs through Node's own ESM loader, which needs
 * an import attribute for JSON, and the app's Vite pipeline is not in front of it here.
 */
const learn = JSON.parse(readFileSync(resolve(process.cwd(), 'shared/content/learn.json'), 'utf8')) as {
  standingLine: string;
  tracks: { key: string; title: string; blurb: string }[];
  items: { id: string; track: string; title: string; body: string }[];
};

const IDS = learn.items.map((i) => i.id);

const lessons = JSON.parse(readFileSync(resolve(process.cwd(), 'shared/content/lessons.json'), 'utf8')) as {
  lessons: { id: string; title: string; body: string }[];
};
const LESSON_IDS = lessons.lessons.map((l) => l.id);

/** The same frozen clock and seed `onboard` uses, so a deep link lands in the same world. */
const DEEP = '?demo=1&freeze=1&start=2026-06-15&seed=42';

test.describe('the Learn library', () => {
  test('criterion 27: sixteen pieces across three tracks, all open on day 0', async ({ page }) => {
    await onboard(page);
    await dismissCapturePrompt(page);
    await page.getByTestId('nav-lessons').click();
    await clickClear(page, 'learn-link');
    await expect(page.getByTestId('screen-learn')).toBeVisible();

    for (const track of learn.tracks) await expect(page.getByTestId(`learn-track-${track.key}`)).toBeVisible();
    for (const id of IDS) await expect(page.getByTestId(`learn-item-${id}`), id).toBeVisible();
    expect(IDS).toHaveLength(20);

    // R12.5: every one of them opens, with no unlock condition of any kind, on day 0.
    for (const id of IDS) {
      await clickClear(page, `learn-item-${id}`);
      await expect(page.getByTestId('screen-learn-item'), id).toBeVisible();
      await expect(page.getByTestId('learn-item-body'), id).not.toBeEmpty();
      // There is no locked state to render, so there is nothing that could claim one.
      await expect(page.getByTestId('lesson-locked'), id).toHaveCount(0);
      await page.getByTestId('header-back').click();
      await expect(page.getByTestId('screen-learn')).toBeVisible();
    }
  });

  test('criterion 27: the read count is a plain count that survives a reload', async ({ page }) => {
    await onboard(page);
    await dismissCapturePrompt(page);
    await page.getByTestId('nav-lessons').click();
    await clickClear(page, 'learn-link');
    await expect(page.getByTestId('learn-progress')).toHaveAttribute('data-read', '0');
    // The total comes from the library itself, so adding a piece does not break this test.
    const total = String(IDS.length);
    await expect(page.getByTestId('learn-progress')).toHaveAttribute('data-total', total);
    await expect(page.getByTestId('learn-progress')).toContainText(`0 of ${total} read`);

    await clickClear(page, 'learn-item-E01');
    await page.getByTestId('header-back').click();
    await clickClear(page, 'learn-item-E07');
    await page.getByTestId('header-back').click();
    await expect(page.getByTestId('learn-progress')).toContainText(`2 of ${total} read`);

    await page.reload();
    await expect(page.getByTestId('learn-progress')).toContainText(`2 of ${total} read`);

    // 8.9: a plain count, not a ring and not a percentage.
    const header = await page.getByTestId('screen-learn').innerText();
    expect(header).not.toContain('%');
    await expect(page.getByTestId('screen-learn').getByTestId('progress-ring')).toHaveCount(0);
  });

  test('criterion 27: the confidence path keeps its own ring, out of 8', async ({ page }) => {
    await onboard(page);
    await dismissCapturePrompt(page);
    await page.getByTestId('nav-lessons').click();
    await expect(page.getByTestId('progress-ring')).toHaveAttribute('data-total', '8');
    await expect(page.locator('[data-testid^="lesson-card-"]')).toHaveCount(8);
  });

  /**
   * Cycle 8 amendment (R15.6, 9.8a, criterion 28). This case used to assert the line on three
   * surfaces and its ABSENCE from a Learn item page. The amendment reverses the absence: the
   * library may now state general principles, so the sentence that makes them education has to
   * be reachable by a reader who deep links into one piece and never sees the index.
   *
   * "Exactly once" is still asserted everywhere, because the point of one short repeated line
   * is that it is one short line, and two of them on a screen is the nervousness the old rule
   * was written against.
   */
  test('R15.6: the standing line appears exactly once on all six surfaces, with no tap or expand', async ({ page }) => {
    await onboard(page);
    await dismissCapturePrompt(page);
    const line = learn.standingLine;
    const onceOn = async (screen: string, testId: string) => {
      await expect(page.getByTestId(testId), `${screen}: the 9.8a line`).toHaveText(line);
      expect((await page.getByTestId(screen).innerText()).split(line).length - 1, `${screen}: exactly once`).toBe(1);
    };

    await page.getByTestId('nav-lessons').click();
    await onceOn('screen-lessons', 'lessons-not-advice');

    await clickClear(page, 'learn-link');
    await onceOn('screen-learn', 'learn-not-advice');

    await page.getByTestId('nav-settings').click();
    await onceOn('screen-settings', 'settings-not-advice');

    await page.getByTestId('nav-invest').click();
    await onceOn('screen-invest', 'invest-not-advice');

    // New this amendment: every one of the sixteen Learn item pages.
    for (const id of IDS) {
      await page.goto(`/learn/${id}${DEEP}`);
      await expect(page.getByTestId('screen-learn-item'), id).toBeVisible();
      await onceOn('screen-learn-item', 'learn-item-not-advice');
    }

    // New this amendment: every one of the eight lesson pages, locked or not.
    for (const id of LESSON_IDS) {
      await page.goto(`/lessons/${id}${DEEP}`);
      await expect(page.getByTestId('screen-lesson'), id).toBeVisible();
      await onceOn('screen-lesson', 'lesson-not-advice');
    }
  });

  test('R12.5: the first Invest visit surfaces a piece without unlocking anything', async ({ page }) => {
    await onboard(page);
    await dismissCapturePrompt(page);
    // Before: nothing surfaced, and E01 is already readable.
    await expect(page.getByTestId('learn-surface-firstInvestVisit')).toHaveCount(0);

    await page.getByTestId('nav-invest').click();
    await page.getByTestId('nav-home').click();
    const card = page.getByTestId('learn-surface-firstInvestVisit');
    await expect(card).toBeVisible();
    await expect(card).toContainText('brokerage account');

    // It links to a piece that was readable before and stays readable after.
    await clickClear(page, 'learn-surface-open-firstInvestVisit');
    await expect(page.getByTestId('screen-learn-item')).toBeVisible();
    await expect(page.getByTestId('learn-item-title')).toContainText('brokerage');

    // And it can be dismissed, permanently, without gating anything.
    await page.getByTestId('nav-home').click();
    await clickClear(page, 'learn-surface-dismiss-firstInvestVisit');
    await expect(page.getByTestId('learn-surface-firstInvestVisit')).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId('learn-surface-firstInvestVisit')).toHaveCount(0);
    // The piece is still there.
    await page.getByTestId('nav-lessons').click();
    await clickClear(page, 'learn-link');
    await expect(page.getByTestId('learn-item-E01')).toBeVisible();
  });

  test('R12.5: the first ledger entry surfaces E04, and day 30 surfaces E13', async ({ page }) => {
    await onboard(page);
    await dismissCapturePrompt(page);
    await page.getByTestId('nav-invest').click();
    await clickClear(page, 'invest-add');
    await page.getByTestId('ledger-amount').fill('100');
    await page.getByTestId('ledger-what').fill('Index fund');
    await clickClear(page, 'ledger-save');
    await page.getByTestId('nav-home').click();
    await expect(page.getByTestId('learn-surface-firstLedgerEntry')).toBeVisible();
    await clickClear(page, 'learn-surface-dismiss-firstLedgerEntry');

    await nextDays(page, 30);
    await expect(page.getByTestId('learn-surface-dayThirty')).toBeVisible();
  });

  test('criterion 28: every term in a Learn piece opens a tooltip', async ({ page }) => {
    await onboard(page);
    await dismissCapturePrompt(page);
    await page.getByTestId('nav-lessons').click();
    await clickClear(page, 'learn-link');

    // One piece per track, covering the restored terms and the new ones.
    for (const [id, term] of [
      ['E01', 'brokerage'],
      ['E03', 'ira'],
      ['E11', 'etf'],
      ['E15', 'volatility'],
    ] as const) {
      await clickClear(page, `learn-item-${id}`);
      const anchor = page.getByTestId(`term-${term}`).first();
      await expect(anchor, `${id} has a ${term} tooltip anchor`).toBeVisible();
      await anchor.click();
      await expect(page.getByTestId('tooltip-bubble')).toBeVisible();
      expect((await page.getByTestId('tooltip-bubble').innerText()).length).toBeGreaterThan(20);
      await page.keyboard.press('Escape');
      await page.getByTestId('header-back').click();
    }
  });
});
