/**
 * TESTER, cycle 6 (2026-09-11). Browser-level re-verification of V2-26 and V2-28 (64d619b),
 * working the build notes' re-check list items that need the real form: the jar move form with
 * Something else picked and a typed name, and with no type picked at all.
 */
import { expect, test } from '@playwright/test';
import { clickClear, demoClick, dismissCapturePrompt, onboard, START } from './fixtures';

test.describe('cycle 6 re-verification', () => {
  test('jar move: Something else picked with a typed name saves that holdingType and the name (V2-26 re-check)', async ({ page }) => {
    await onboard(page);
    await dismissCapturePrompt(page);
    await demoClick(page, 'demo-make-habit');
    await demoClick(page, 'demo-force-nudge');
    await clickClear(page, 'nudge-skip');
    await expect(page.getByTestId('jar-amount')).not.toHaveText('$0.00');
    await clickClear(page, 'jar-move');
    await clickClear(page, 'jar-ledger-type-other');
    await page.getByTestId('jar-ledger-what').fill('My side fund');
    await clickClear(page, 'jar-ledger-save');
    await page.getByTestId('nav-invest').click();
    const row = page.getByTestId('ledger-row').first();
    await expect(row).toHaveAttribute('data-source', 'jar');
    const id = await row.getAttribute('data-id');
    // "other" carries no term or rate, so no maturity line. By design (Invest.tsx's own
    // comment, R16.5/V2-23) an "other" row never shows the type pill either, since its name
    // is always the user's own text. So the type is verified through the edit form instead.
    await expect(page.getByTestId(`ledger-maturity-${id}`)).toHaveCount(0);
    await expect(page.getByTestId(`ledger-row-type-${id}`)).toHaveCount(0);
    await expect(row).toContainText('My side fund');
    await clickClear(page, `ledger-edit-${id}`);
    await expect(page.getByTestId('ledger-edit-type-other')).toHaveAttribute('aria-pressed', 'true');
    for (const key of ['indexFund', 'bondsCds', 'stocks', 'crypto', 'cash']) {
      await expect(page.getByTestId(`ledger-edit-type-${key}`)).toHaveAttribute('aria-pressed', 'false');
    }
  });

  test('jar move: no type picked at all still saves the row, with no type pill and no chip pressed on edit (V2-26 re-check)', async ({ page }) => {
    await onboard(page);
    await dismissCapturePrompt(page);
    await demoClick(page, 'demo-make-habit');
    await demoClick(page, 'demo-force-nudge');
    await clickClear(page, 'nudge-skip');
    await expect(page.getByTestId('jar-amount')).not.toHaveText('$0.00');
    await clickClear(page, 'jar-move');
    // Deliberately do not tap any type chip.
    await page.getByTestId('jar-ledger-what').fill('Cash under the mattress');
    await clickClear(page, 'jar-ledger-save');
    await page.getByTestId('nav-invest').click();
    const row = page.getByTestId('ledger-row').first();
    const id = await row.getAttribute('data-id');
    await expect(page.getByTestId(`ledger-row-type-${id}`)).toHaveCount(0);
    await expect(page.getByTestId(`ledger-maturity-${id}`)).toHaveCount(0);
    // Editing it afterwards should show no chip pressed, not some default.
    await clickClear(page, `ledger-edit-${id}`);
    for (const key of ['indexFund', 'bondsCds', 'stocks', 'crypto', 'cash', 'other']) {
      await expect(page.getByTestId(`ledger-edit-type-${key}`)).toHaveAttribute('aria-pressed', 'false');
    }
  });

  test('capture: the too-long label error and the over-cap amount error can both show on the same row at once, and Save stays off (V2-20/V2-28 neighbourhood)', async ({ page }) => {
    await onboard(page);
    await dismissCapturePrompt(page);
    await page.goto(START.replace('/?', '/invest/capture?'));
    await clickClear(page, 'invest-capture-chip-other');
    await page.getByTestId('invest-capture-label-other').fill('x'.repeat(61));
    await page.getByTestId('invest-capture-amount-other').fill('2000000');
    await expect(page.getByTestId('invest-capture-label-error-other')).toBeVisible();
    await expect(page.getByTestId('invest-capture-amount-error-other')).toBeVisible();
    await expect(page.getByTestId('invest-capture-save')).toBeDisabled();
  });

  test('capture: fixing the too-long label re-enables Save and clears the error (V2-28 neighbourhood)', async ({ page }) => {
    await onboard(page);
    await dismissCapturePrompt(page);
    await page.goto(START.replace('/?', '/invest/capture?'));
    await clickClear(page, 'invest-capture-chip-other');
    const label = page.getByTestId('invest-capture-label-other');
    await label.fill('x'.repeat(61));
    await page.getByTestId('invest-capture-amount-other').fill('10');
    await expect(page.getByTestId('invest-capture-label-error-other')).toBeVisible();
    await expect(page.getByTestId('invest-capture-save')).toBeDisabled();
    await label.fill('x'.repeat(60));
    await expect(page.getByTestId('invest-capture-label-error-other')).toHaveCount(0);
    await expect(page.getByTestId('invest-capture-save')).toBeEnabled();
  });

  test('settings import: a damaged export never shows validator text, a raw path, or file content (V2-29 re-check via the real screen)', async ({ page }) => {
    await onboard(page);
    await dismissCapturePrompt(page);
    // Add one real ledger entry first, so the export has a ledger row to damage.
    await page.goto(START.replace('/?', '/invest/capture?'));
    await clickClear(page, 'invest-capture-chip-indexFund');
    await page.getByTestId('invest-capture-amount-indexFund').fill('10');
    await clickClear(page, 'invest-capture-save');
    await page.getByTestId('nav-settings').click();

    // Get a real export via the actual download flow, then damage one field and re-import it
    // through the real hidden file input.
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('settings-export').click()]);
    const path = await download.path();
    expect(path).toBeTruthy();
    const fs = await import('node:fs/promises');
    const text = await fs.readFile(path as string, 'utf-8');
    const json = JSON.parse(text);
    json.ledger[0].termMonths = 'DROP TABLE users;--';
    const buffer = Buffer.from(JSON.stringify(json), 'utf-8');
    await page.getByTestId('settings-import').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer });
    const msg = page.getByTestId('settings-import-message');
    await expect(msg).toBeVisible();
    const shown = (await msg.textContent()) ?? '';
    expect(shown).not.toContain('DROP TABLE');
    expect(shown).not.toContain('termMonths');
    expect(shown).not.toContain('led:');
    expect(shown).not.toMatch(/\[\d+\]/); // no zero-based array index leaks either
    expect(shown).toContain('an investment entry');
  });
});
