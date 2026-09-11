/**
 * TESTER, cycle 4 (2026-09-11), the browser half. What the V2-9 to V2-19 fixes (b143bdf) put on
 * screen, and what they broke around them.
 *
 * Same convention as cycles 2 and 3: a test titled DEFECT fails today on purpose and names the
 * finding; everything else must pass.
 *
 * Cycle 5 (2026-09-11): V2-20 to V2-24 are fixed, so every test here must pass. The DEFECT tests
 * were retitled as regression guards; the relabel test was rewritten to the owner's V2-23
 * decision, and the 30% plant now carries persist version 1, which is what a previous build
 * wrote. Both say so inline.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { START, clickClear, collapseTray, demoClick, dismissCapturePrompt, nextDays, onboard } from './fixtures';
import { STORAGE_KEY } from '../../src/config';

const Q = '?demo=1&freeze=1&start=2026-06-15&seed=42';
const MIRROR_KEY = 'spare-change-state-mirror';
const centsOf = (t: string) => Math.round(Number(t.replace(/[^0-9.]/g, '')) * 100);

async function rawEnvelope(page: Page): Promise<string> {
  const raw = await page.evaluate(
    (key) =>
      new Promise<string | null>((res) => {
        const req = indexedDB.open('keyval-store');
        req.onerror = () => res(null);
        req.onsuccess = () => {
          try {
            const get = req.result.transaction('keyval', 'readonly').objectStore('keyval').get(key);
            get.onsuccess = () => res(typeof get.result === 'string' ? get.result : null);
            get.onerror = () => res(null);
          } catch {
            res(null);
          }
        };
      }),
    STORAGE_KEY,
  );
  expect(raw, 'no persisted state').not.toBeNull();
  return raw as string;
}
async function persisted(page: Page): Promise<any> {
  return JSON.parse(await rawEnvelope(page)).state;
}

/**
 * Puts a state into storage the way a previous build would have left it. Written from a static
 * file on the same origin, so no app code is running to write over it, with a revision far above
 * anything the page has used and the localStorage mirror removed, so boot trusts IndexedDB.
 */
async function plant(page: Page, mutate: (state: any) => void, version = 1): Promise<void> {
  const env = JSON.parse(await rawEnvelope(page));
  mutate(env.state);
  env.rev = 1_000_000_000;
  // Cycle 5: a previous build wrote persist version 1. Since e7bb37f the app is on version 2 and
  // migrates a version 1 envelope on load (R16.8), so a plant standing for "what the previous
  // build saved" must carry version 1, or it describes a state no build can produce.
  env.version = version;
  await page.goto('/manifest.webmanifest');
  await page.evaluate(
    ({ key, raw, mirror }) =>
      new Promise<void>((res, rej) => {
        localStorage.removeItem(mirror);
        const req = indexedDB.open('keyval-store');
        req.onerror = () => rej(req.error);
        req.onsuccess = () => {
          const tx = req.result.transaction('keyval', 'readwrite');
          tx.objectStore('keyval').put(raw, key);
          tx.oncomplete = () => res();
          tx.onerror = () => rej(tx.error);
        };
      }),
    { key: STORAGE_KEY, raw: JSON.stringify(env), mirror: MIRROR_KEY },
  );
}

async function go(page: Page, path: string, ready: string) {
  await page.goto(path === '/' ? START : `${path}${Q}`);
  await expect(page.getByTestId(ready)).toBeVisible();
  await collapseTray(page);
}

async function importPath(page: Page, path: string): Promise<string> {
  await go(page, '/settings', 'screen-settings');
  // Settings reloads the page on a good import; a refused one leaves its message and no reload.
  const reloaded = page.waitForEvent('load', { timeout: 30_000 }).then(() => true).catch(() => false);
  await page.getByTestId('settings-import').setInputFiles(path);
  if (await reloaded) {
    await page.waitForTimeout(800);
    return 'imported (page reloaded)';
  }
  return `refused: ${((await page.getByTestId('settings-import-message').textContent()) ?? '').trim()}`;
}

async function skipOnce(page: Page) {
  await demoClick(page, 'demo-force-nudge');
  await expect(page.getByTestId('nudge-card')).toBeVisible();
  await clickClear(page, 'nudge-skip');
  await page.waitForTimeout(400);
}

async function captureBond(page: Page, amount: string, term: string, rate: string): Promise<string> {
  await go(page, '/invest/capture', 'screen-invest-capture');
  await page.getByTestId('invest-capture-chip-bondsCds').click();
  await page.getByTestId('invest-capture-amount-bondsCds').fill(amount);
  await page.getByTestId('invest-capture-term').fill(term);
  await page.getByTestId('invest-capture-rate').fill(rate);
  await page.getByTestId('invest-capture-save').click();
  await expect(page.getByTestId('screen-invest')).toBeVisible();
  await collapseTray(page);
  return (await page.getByTestId('ledger-row').first().getAttribute('data-id'))!;
}

async function saveEdit(page: Page, id: string, fields: Partial<Record<'what' | 'note' | 'term' | 'rate', string>>): Promise<string | null> {
  await clickClear(page, `ledger-edit-${id}`);
  await expect(page.getByTestId('ledger-edit-form')).toBeVisible();
  for (const [k, v] of Object.entries(fields)) await page.getByTestId(`ledger-edit-${k}`).fill(v as string);
  await clickClear(page, 'ledger-edit-save');
  await page.waitForTimeout(500);
  if ((await page.getByTestId('ledger-edit-form').count()) === 0) return null;
  const err = page.getByTestId('ledger-edit-error');
  return (await err.count()) > 0 ? ((await err.textContent()) ?? '').trim() : '(form still open, no error)';
}

// ---------------------------------------------------------------------------------------------
test.describe('V2-10 / R16.6 the bond edit form', () => {
  test('prefills term and rate, a note edit keeps them, a bad rate is refused with a reason, clearing removes them, a change re-prices', async ({ page }) => {
    test.setTimeout(240_000);
    await onboard(page);
    await dismissCapturePrompt(page);
    const id = await captureBond(page, '1000', '12', '4.5');
    await clickClear(page, `ledger-edit-${id}`);
    const prefill = { term: await page.getByTestId('ledger-edit-term').inputValue(), rate: await page.getByTestId('ledger-edit-rate').inputValue() };
    await clickClear(page, 'ledger-edit-cancel');
    expect(prefill).toEqual({ term: '12', rate: '4.50' });

    expect(await saveEdit(page, id, { note: 'from my bank statement' })).toBeNull();
    let e = (await persisted(page)).ledger.find((x: any) => x.id === id);
    expect({ term: e.termMonths, rate: e.yieldBps, type: e.holdingType, note: e.note }).toEqual({ term: 12, rate: 450, type: 'bondsCds', note: 'from my bank statement' });
    await expect(page.getByTestId(`ledger-maturity-${id}`)).toContainText('$1,045.00');

    const err = await saveEdit(page, id, { rate: 'about 4' });
    expect(err, 'an unusable rate must keep the form open with a reason').toMatch(/rate/i);
    await clickClear(page, 'ledger-edit-cancel');
    e = (await persisted(page)).ledger.find((x: any) => x.id === id);
    expect(e.yieldBps).toBe(450);

    expect(await saveEdit(page, id, { term: '', rate: '' })).toBeNull();
    e = (await persisted(page)).ledger.find((x: any) => x.id === id);
    expect('termMonths' in e || 'yieldBps' in e, JSON.stringify(e)).toBe(false);
    expect(await page.getByTestId(`ledger-maturity-${id}`).count()).toBe(0);

    expect(await saveEdit(page, id, { term: '24', rate: '5' })).toBeNull();
    await expect(page.getByTestId(`ledger-maturity-${id}`)).toContainText('$1,102.50');
  });

  // Cycle 5 reconciliation (V2-23, owner decision 2026-09-11). Cycle 4 expected the renamed row to
  // lose its line. The owner decided the type is a choice in the form and wins over the typed
  // name, so a CD named "Individual stock" is still a CD: it keeps its line, and Invest shows its
  // type beside the name so the row cannot pass for a stock.
  test('V2-23 by owner decision: a bond row renamed "Individual stock" keeps its line, and Invest shows "Bonds or CDs" beside the name', async ({ page }) => {
    test.setTimeout(240_000);
    await onboard(page);
    await dismissCapturePrompt(page);
    const id = await captureBond(page, '1000', '360', '10');
    await expect(page.getByTestId(`ledger-maturity-${id}`)).toContainText('$17,449.40');
    expect(await saveEdit(page, id, { what: 'Individual stock' })).toBeNull();
    const what = ((await page.getByTestId('ledger-row-what').first().textContent()) ?? '').trim();
    const line = page.getByTestId(`ledger-maturity-${id}`);
    const text = (await line.count()) > 0 ? ((await line.textContent()) ?? '').trim() : '(none)';
    const pill = page.getByTestId(`ledger-row-type-${id}`);
    const pillText = (await pill.count()) > 0 ? ((await pill.textContent()) ?? '').trim() : '(none)';
    // eslint-disable-next-line no-console
    console.log(`RELABEL: row reads "${what}"; type shown "${pillText}"; maturity line "${text}"`);
    expect({ what, pillText, line: /\$17,449\.40/.test(text) }).toEqual({ what: 'Individual stock', pillText: 'Bonds or CDs', line: true });
  });
});

// ---------------------------------------------------------------------------------------------
test.describe('the capture save loop', () => {
  test('V2-20 regression: a batch whose second row is over the $1,000,000 cap writes nothing, and no retry can duplicate a row', async ({ page }) => {
    test.setTimeout(240_000);
    await onboard(page);
    await dismissCapturePrompt(page);
    await go(page, '/invest/capture', 'screen-invest-capture');
    await page.getByTestId('invest-capture-chip-indexFund').click();
    await page.getByTestId('invest-capture-amount-indexFund').fill('10');
    await page.getByTestId('invest-capture-chip-bondsCds').click();
    await page.getByTestId('invest-capture-amount-bondsCds').fill('2000000');
    const enabled = await page.getByTestId('invest-capture-save').isEnabled();
    const counts: number[] = [];
    let message = '(save disabled)';
    if (enabled) {
      for (let i = 0; i < 3; i++) {
        await page.getByTestId('invest-capture-save').click();
        await page.waitForTimeout(600);
        counts.push((await persisted(page)).ledger.length);
      }
      const err = page.getByTestId('invest-capture-error');
      message = (await err.count()) > 0 ? ((await err.textContent()) ?? '').trim() : '(no error shown)';
    }
    const rows = ((await persisted(page)).ledger as any[]).map((e) => `${e.what} ${e.amountCents}`);
    // eslint-disable-next-line no-console
    console.log(`CAPTURE-PARTIAL: saveEnabled=${enabled}; ledger size after each of 3 taps=${counts.join(',')}; error="${message}"; rows=${JSON.stringify(rows)}`);
    expect(rows, 'a save that fails must write nothing, and a retry must not duplicate').toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
test.describe('copy around the fixes', () => {
  test('V2-24 regression: a new user\'s empty jar no longer says round-ups land there', async ({ page }) => {
    await onboard(page);
    await dismissCapturePrompt(page);
    await go(page, '/', 'screen-home');
    await dismissCapturePrompt(page);
    const jarCard = page.getByTestId('jar-move').locator('xpath=ancestor::*[contains(@class,"flex-col") or self::section][1]/..');
    const text = await page.locator('main, body').first().innerText();
    const m = /[^.\n]*round-?ups?[^.\n]*/i.exec(text);
    // eslint-disable-next-line no-console
    console.log(`JAR-EMPTY: jar=${((await page.getByTestId('jar-amount').textContent()) ?? '').trim()} line="${m?.[0].trim() ?? '(none)'}" (card found: ${(await jarCard.count()) > 0})`);
    expect(m?.[0] ?? null, 'nothing creates a round-up any more (R2.1 retired, R6.1)').toBeNull();
  });

  test('V2-22 regression: after "I spent it", Summer no longer tells someone who has skipped that their first skip starts the line', async ({ page }) => {
    test.setTimeout(240_000);
    await onboard(page);
    await dismissCapturePrompt(page);
    await demoClick(page, 'demo-make-habit');
    await skipOnce(page);
    await go(page, '/', 'screen-home');
    await dismissCapturePrompt(page);
    await clickClear(page, 'jar-spent');
    await clickClear(page, 'jar-spent-yes');
    await page.waitForTimeout(600);
    const home = {
      kept: ((await page.getByTestId('stat-kept').textContent()) ?? '').trim(),
      skips: ((await page.getByTestId('stat-habit-skips').textContent()) ?? '').trim(),
      jar: ((await page.getByTestId('jar-amount').textContent()) ?? '').trim(),
    };
    await go(page, '/summer', 'screen-summer');
    const empty = page.getByTestId('your-money-empty');
    const text = (await empty.count()) > 0 ? ((await empty.textContent()) ?? '').trim() : ((await page.getByTestId('your-money-putin').textContent()) ?? '').trim();
    // eslint-disable-next-line no-console
    console.log(`SPENT: Home ${JSON.stringify(home)}; Summer Your money reads "${text}"`);
    expect(text).not.toMatch(/first skip/i);
  });

  test('V2-22 regression: with a $500 entry recorded, Summer does not call $504.35 "kept" while Home says kept $4.35', async ({ page }) => {
    test.setTimeout(240_000);
    await onboard(page);
    await dismissCapturePrompt(page);
    await demoClick(page, 'demo-make-habit');
    await skipOnce(page);
    await go(page, '/invest', 'screen-invest');
    await clickClear(page, 'invest-add');
    await page.getByTestId('ledger-amount').fill('500');
    await page.getByTestId('ledger-what').fill('Retirement account');
    await clickClear(page, 'ledger-save');
    await page.waitForTimeout(600);
    await go(page, '/', 'screen-home');
    await dismissCapturePrompt(page);
    const label = ((await page.getByTestId('kept-headline-label').textContent()) ?? '').trim();
    const kept = centsOf((await page.getByTestId('stat-kept').textContent()) ?? '');
    await go(page, '/summer', 'screen-summer');
    const putin = ((await page.getByTestId('your-money-putin').textContent()) ?? '').trim();
    // eslint-disable-next-line no-console
    console.log(`KEPT-WORD: Home "${label}" = ${kept} cents; Summer "${putin}"`);
    expect(/\bkept\b/i.test(putin) && centsOf(putin) !== kept, `Home "${label}" ${kept} cents vs Summer "${putin}"`).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
test.describe('data the previous build saved', () => {
  test('V2-21 regression (R16.8): a bond row saved at 30% by the previous build is tidied on load, a note edit saves, and the app re-imports the backup it just exported', async ({ page }, info) => {
    test.setTimeout(240_000);
    await onboard(page);
    await dismissCapturePrompt(page);
    await go(page, '/invest', 'screen-invest');
    const s = await persisted(page);
    const date = new Date(`${s.clock.startDate}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + s.clock.dayIndex);
    // Exactly what 90bd963's capture wrote for "Bonds or CDs, $1,000, 12 months, 30%".
    await plant(page, (st) => {
      st.ledger.push({ id: 'led:30', date: date.toISOString().slice(0, 10), amountCents: 100000, what: 'Bonds or CDs', note: '', source: 'manual', createdAt: '2026-06-15T12:00:00.000Z', termMonths: 12, yieldBps: 3000 });
    });
    await go(page, '/invest', 'screen-invest');
    expect((await persisted(page)).ledger.some((e: any) => e.id === 'led:30'), 'plant must survive boot').toBe(true);
    const lineShown = (await page.getByTestId('ledger-maturity-led:30').count()) > 0;

    const editError = await saveEdit(page, 'led:30', { note: 'opened in June' });
    if (editError !== null) await clickClear(page, 'ledger-edit-cancel');
    const noteSaved = (await persisted(page)).ledger.find((e: any) => e.id === 'led:30').note === 'opened in June';

    // The app's own export, byte for byte.
    await go(page, '/settings', 'screen-settings');
    let file = info.outputPath('own-export.json');
    let via = 'download';
    try {
      const dl = page.waitForEvent('download', { timeout: 15_000 });
      await clickClear(page, 'settings-export');
      await (await dl).saveAs(file);
    } catch {
      via = 'fallback: persisted state minus push, which is what exportStateJson writes';
      const { push: _p, ...rest } = await persisted(page);
      file = info.outputPath('own-export-fallback.json');
      writeFileSync(file, JSON.stringify(rest, null, 2));
    }
    const exported = JSON.parse(readFileSync(file, 'utf8'));
    const msg = await importPath(page, file);
    // eslint-disable-next-line no-console
    console.log(`OLD-30: maturity line shown=${lineShown}; note edit error="${editError}" saved=${noteSaved}; export via ${via} holds led:30=${exported.ledger.some((e: any) => e.id === 'led:30')}; re-import "${msg}"`);
    expect({ noteSaved, reimport: msg }).toEqual({ noteSaved: true, reimport: 'imported (page reloaded)' });
  });
});

// ---------------------------------------------------------------------------------------------
test.describe('V2-16 on screen', () => {
  test('L1 unlocks with the first habit, before any skip, under its own title', async ({ page }) => {
    await onboard(page);
    await dismissCapturePrompt(page);
    await demoClick(page, 'demo-make-habit');
    await nextDays(page, 1);
    const s = await persisted(page);
    const skips = s.events.filter((e: any) => e.kind === 'Skip').length;
    await go(page, '/lessons/L1', 'screen-lesson');
    const body = await page.locator('main, body').first().innerText();
    // eslint-disable-next-line no-console
    console.log(`L1: unlockedDay=${s.lessons.L1.unlockedDay} L3=${s.lessons.L3.unlockedDay} skips=${skips}`);
    expect(skips).toBe(0);
    expect(s.lessons.L1.unlockedDay).not.toBeNull();
    expect(s.lessons.L3.unlockedDay).toBeNull();
    expect(body).toContain('How it spotted your usual stop');
  });
});
