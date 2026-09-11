/**
 * TESTER, cycle 3 (2026-09-10), the browser half. Attacks the new surfaces (R10.1 by age,
 * R10.4, R16, R17, R18, the disclosure, legacy round-up data) against the running app, and
 * re-checks V2-2 and V2-8 on controls this cycle added.
 *
 * Same convention as cycle 2: a test titled DEFECT fails today on purpose and names the
 * finding; everything else must pass.
 *
 * Cycle 5 (2026-09-11): every defect this file filed is fixed, so every test here must pass. A
 * test still titled DEFECT is a green regression guard. The stock-row import test was rewritten
 * to R16.8 (the owner's "tidy, say so" decision), and the R10.4 jar move test now expects
 * V2-22's "set aside" copy; both say so inline.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { START, assertNoHorizontalScroll, clickClear, collapseTray, demoClick, dismissCapturePrompt, nextDays, onboard } from './fixtures';
import { STORAGE_KEY } from '../../src/config';

const Q = '?demo=1&freeze=1&start=2026-06-15&seed=42';
const LEARN = JSON.parse(readFileSync(resolve('shared/content/learn.json'), 'utf8')) as { standingLine: string; items: Array<{ id: string; title: string }> };
const HOLDING = JSON.parse(readFileSync(resolve('shared/content/holdingTypes.json'), 'utf8')).holdingTypes as Array<{ key: string; label: string; learnId: string; requiresLabel: boolean }>;
const money = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const centsOf = (t: string) => Math.round(Number(t.replace(/[^0-9.]/g, '')) * 100);

async function persisted(page: Page): Promise<any> {
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
  return JSON.parse(raw as string).state;
}

async function go(page: Page, path: string, ready: string) {
  await page.goto(path === '/' ? START : `${path}${Q}`);
  await expect(page.getByTestId(ready)).toBeVisible();
  await collapseTray(page);
}

async function importFile(page: Page, info: TestInfo, state: unknown): Promise<string> {
  const path = info.outputPath(`import-${Date.now()}.json`);
  writeFileSync(path, JSON.stringify(state));
  await go(page, '/settings', 'screen-settings');
  // Settings.tsx sets the success message and then calls window.location.reload(), so a good
  // import is observed as a reload; a refused one leaves the message on screen with no reload.
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

async function captureBond(page: Page, amount: string, term: string, rate: string) {
  await go(page, '/invest/capture', 'screen-invest-capture');
  await page.getByTestId('invest-capture-chip-bondsCds').click();
  await page.getByTestId('invest-capture-amount-bondsCds').fill(amount);
  await page.getByTestId('invest-capture-term').fill(term);
  await page.getByTestId('invest-capture-rate').fill(rate);
}

function simDate(start: string, day: number): string {
  const d = new Date(`${start}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + day);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------------------------
test.describe('R16 through the real UI', () => {
  test('DEFECT R16: a note edit on Invest erases the bond row\'s term and rate', async ({ page }) => {
    await onboard(page);
    await dismissCapturePrompt(page);
    await captureBond(page, '1000', '12', '4.5');
    await expect(page.getByTestId('invest-capture-maturity')).toContainText('$1,045.00');
    await page.getByTestId('invest-capture-save').click();
    await expect(page.getByTestId('screen-invest')).toBeVisible();
    await collapseTray(page);
    const id = (await page.getByTestId('ledger-row').first().getAttribute('data-id'))!;
    await expect(page.getByTestId(`ledger-maturity-${id}`)).toContainText('$1,045.00');
    const before = (await persisted(page)).ledger.find((e: any) => e.id === id);

    await clickClear(page, `ledger-edit-${id}`);
    await expect(page.getByTestId('ledger-edit-form')).toBeVisible();
    const formFields = await page.getByTestId('ledger-edit-form').locator('input').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
    await page.getByTestId('ledger-edit-note').fill('from my bank statement');
    await clickClear(page, 'ledger-edit-save');
    await expect(page.getByTestId('ledger-edit-form')).toHaveCount(0);
    await page.waitForTimeout(400);
    const after = (await persisted(page)).ledger.find((e: any) => e.id === id);
    const lines = await page.getByTestId(`ledger-maturity-${id}`).count();
    // eslint-disable-next-line no-console
    console.log(`R16-EDIT: edit form fields=${formFields.join(',')}; before term=${before.termMonths} rate=${before.yieldBps}; after a note-only edit term=${after.termMonths} rate=${after.yieldBps}, note="${after.note}", maturity lines=${lines}`);
    expect(lines, 'a note edit must not erase the rate and term the user typed').toBe(1);
  });

  // Cycle 4 reconciliation. The last case used to expect 600 months at 50% stored as 5000 bps.
  // V2-18 (my own finding) moved the ceiling to 2500 bps, so 50% must now be REFUSED, and the
  // ceiling itself (25%) and one basis point past it are the cases that matter. Every refusal
  // must also show the user why (R16.7 "refuses"), which the old `s && !err` did not demand,
  // and every parse is pinned to its exact stored value rather than "not undefined".
  test('V2-11 / R16.7: the capture parses, rounds or refuses every term and rate, and never drops one', async ({ page }) => {
    test.setTimeout(240_000);
    await onboard(page);
    await dismissCapturePrompt(page);
    type Case = { term: string; rate: string; violates: (saved: boolean, err: boolean, e: any) => boolean };
    const refused = (s: boolean, err: boolean) => s || !err;
    const cases: Case[] = [
      { term: '12', rate: '4.5%', violates: (s, _err, e) => !s || e?.termMonths !== 12 || e?.yieldBps !== 450 },
      { term: '12', rate: '4,5', violates: (s, _err, e) => !s || e?.yieldBps !== 450 },
      { term: '12', rate: '60', violates: refused },
      { term: '700', rate: '4.5', violates: refused },
      { term: '12', rate: '', violates: (s, _err, e) => !s || e?.termMonths !== 12 || e?.yieldBps !== undefined },
      { term: '12.5', rate: '4.5', violates: refused },
      // 1.005 * 100 is 100.49999999999999 in floating point, so Math.round gives 100; R1.2
      // (half away from zero) gives 101. 4.555 happens to land on 455.5 exactly and is fine.
      { term: '12', rate: '1.005', violates: (s, _err, e) => !s || e?.yieldBps !== 101 },
      { term: '600', rate: '50', violates: refused },
      { term: '600', rate: '25', violates: (s, _err, e) => !s || e?.termMonths !== 600 || e?.yieldBps !== 2500 },
      { term: '12', rate: '25.01', violates: refused },
    ];
    const lines: string[] = [];
    const violations: string[] = [];
    for (const c of cases) {
      await captureBond(page, '100', c.term, c.rate);
      const preview = (await page.getByTestId('invest-capture-maturity').count()) > 0 ? ((await page.getByTestId('invest-capture-maturity').textContent()) ?? '').trim() : '(no preview)';
      const before = (await persisted(page)).ledger.length;
      const enabled = await page.getByTestId('invest-capture-save').isEnabled();
      if (enabled) await page.getByTestId('invest-capture-save').click();
      await page.waitForTimeout(500);
      // b143bdf shows a term or rate problem under its own test id, beside the row.
      const err = (await page.getByTestId('invest-capture-error').count()) + (await page.getByTestId('invest-capture-cd-error').count()) > 0;
      const led = (await persisted(page)).ledger as any[];
      const saved = led.length > before;
      const e = saved ? led.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0] : undefined;
      const line = `term="${c.term}" rate="${c.rate}" -> saveEnabled=${enabled} saved=${saved} error=${err} stored termMonths=${e?.termMonths} yieldBps=${e?.yieldBps} preview="${preview.slice(0, 70)}"`;
      lines.push(line);
      if (c.violates(saved, err, e)) violations.push(line);
    }
    // eslint-disable-next-line no-console
    console.log(`R16-CAPTURE:\n${lines.join('\n')}`);
    expect(violations, `R16.7 says parsed exactly, or refused with a reason, never dropped:\n${violations.join('\n')}`).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
test.describe('what an import can put on screen', () => {
  test('legacy round-up profile: imports, Activity renders the old lines, and Home, the habit card and Summer agree', async ({ page }, info) => {
    test.setTimeout(240_000);
    await onboard(page);
    await dismissCapturePrompt(page);
    await nextDays(page, 4);
    await demoClick(page, 'demo-make-habit');
    await skipOnce(page);
    const s = await persisted(page);
    const { push: _push, ...file } = s;
    const out: any[] = [];
    let ru = 0;
    let n = 0;
    for (const e of file.events) {
      out.push(e);
      if (e.kind === 'Purchase') {
        const c = (100 - (e.cents % 100)) % 100;
        if (c > 0) {
          out.push({ kind: 'RoundUp', id: `legacy-ru-${n++}`, dayIndex: e.dayIndex, date: e.date, purchaseId: e.purchaseId, merchant: e.merchant, purchaseCents: e.cents, cents: c });
          ru += c;
        }
      }
    }
    file.events = out;
    file.jarCents += ru;
    file.settings.roundUpsPaused = false;
    expect(ru, 'fixture must contain round-ups').toBeGreaterThan(0);
    const kept = out.filter((e) => ['RoundUp', 'Catch', 'Skip'].includes(e.kind)).reduce((a, e) => a + e.cents, 0);
    const week = out.filter((e) => ['RoundUp', 'Catch', 'Skip'].includes(e.kind) && e.dayIndex > file.clock.dayIndex - 7).reduce((a, e) => a + e.cents, 0);
    const skipKept = out.filter((e) => e.kind === 'Skip').reduce((a, e) => a + e.cents, 0);

    const msg = await importFile(page, info, file);
    const after = await persisted(page);
    expect(after.events.filter((e: any) => e.kind === 'RoundUp').length, `import message: ${msg}`).toBe(n);

    await go(page, '/activity', 'screen-activity');
    const ruRows = await page.getByTestId('activity-item-RoundUp').count();
    const ruText = ruRows > 0 ? ((await page.getByTestId('activity-item-RoundUp').first().textContent()) ?? '') : '';

    await go(page, '/', 'screen-home');
    await dismissCapturePrompt(page);
    const shown = {
      label: ((await page.getByTestId('kept-headline-label').textContent()) ?? '').trim(),
      kept: centsOf((await page.getByTestId('stat-kept').textContent()) ?? ''),
      week: centsOf((await page.getByTestId('stat-week-kept').textContent()) ?? ''),
      habitKept: centsOf((await page.getByTestId('stat-habit-kept').textContent()) ?? ''),
      jar: centsOf((await page.getByTestId('jar-amount').textContent()) ?? ''),
    };
    await go(page, '/summer', 'screen-summer');
    const putIn = ((await page.getByTestId('your-money-putin').textContent()) ?? '').trim();
    // eslint-disable-next-line no-console
    console.log(`LEGACY: roundUps=${n} (${money(ru)}) msg="${msg}" activityRoundUpRows=${ruRows} first="${ruText.trim()}" home=${JSON.stringify(shown)} expected kept=${kept} week=${week} skipKept=${skipKept} summer="${putIn}" roundUpsPaused persisted=${'roundUpsPaused' in after.settings}`);
    expect(ruRows).toBe(n);
    expect(shown.kept).toBe(kept);
    expect(shown.week).toBe(week);
    expect(shown.habitKept).toBe(skipKept);
    expect(shown.jar).toBe(file.jarCents);
  });

  // Cycle 4 reconciliation. This used to import the stock row and then wait for /invest to
  // render it. R16.5 now refuses the whole file, so the flow never reached that screen and timed
  // out. The coder is right that the refusal IS the fix, so this asserts the refusal, that it
  // changes nothing, and (the control half) that the same row labelled as a bond imports and
  // renders, which proves the refusal is caused by the stock label and by nothing else in the file.
  // Cycle 5 reconciliation (R16.8, owner decision 2026-09-11). Cycle 4 asserted the refusal of
  // this file. The owner chose "tidy, say so" instead: the file imports, the stock row keeps its
  // amount, name and date, loses the term and rate, and the user is told once. The V2-12
  // symptom (a projection on a stock row) is still what this guards: no line may render.
  test('V2-12 / R16.8: an import with a term and rate on an Individual stocks row imports with both removed, says so, and renders no line', async ({ page }, info) => {
    test.setTimeout(240_000);
    await onboard(page);
    await dismissCapturePrompt(page);
    const s = await persisted(page);
    const { push: _push, ...file } = s;
    const row = { id: 'led:77', date: simDate(file.clock.startDate, file.clock.dayIndex), amountCents: 100000, note: '', source: 'manual', createdAt: '2026-06-15T12:00:00.000Z', termMonths: 360, yieldBps: 1000 };
    const stock = JSON.parse(JSON.stringify(file));
    stock.ledger.push({ ...row, what: 'Individual stocks' });
    const msg = await importFile(page, info, stock);
    expect(msg, 'R16.8: the file imports').toBe('imported (page reloaded)');
    await expect(page.getByTestId('auto-advance-toast')).toContainText('One entry had a length or a rate');
    const after = await persisted(page);
    const e = after.ledger.find((x: any) => x.id === 'led:77');
    // eslint-disable-next-line no-console
    console.log(`STOCK-ROW: import="${msg}" ledger after=${after.ledger.length} (file had ${stock.ledger.length}); led:77=${JSON.stringify(e)}`);
    expect(after.ledger.length).toBe(stock.ledger.length);
    expect(e && { what: e.what, amount: e.amountCents, date: e.date, term: 'termMonths' in e, rate: 'yieldBps' in e }).toEqual({
      what: 'Individual stocks',
      amount: 100000,
      date: row.date,
      term: false,
      rate: false,
    });
    await go(page, '/invest', 'screen-invest');
    expect(await page.getByTestId('ledger-maturity-led:77').count()).toBe(0);

    const bond = JSON.parse(JSON.stringify(file));
    bond.ledger.push({ ...row, what: 'Bonds or CDs', holdingType: 'bondsCds' });
    const msg2 = await importFile(page, info, bond);
    expect(msg2, 'control: the same row as a bond must import').toBe('imported (page reloaded)');
    await go(page, '/invest', 'screen-invest');
    await expect(page.getByTestId('ledger-maturity-led:77')).toContainText('$17,449.40');
  });
});

// ---------------------------------------------------------------------------------------------
test.describe('R10.1 and R10.4 on Summer Money', () => {
  test('R10.1: every age 18 to 24 moves the title, both curves and the headline together; R10.4 empty state at zero', async ({ page }) => {
    await onboard(page);
    await go(page, '/summer', 'screen-summer');
    const rows: string[] = [];
    for (let age = 18; age <= 24; age++) {
      await page.getByTestId('summer-age').selectOption(String(age));
      const title = ((await page.getByTestId('screen-summer').locator('h2', { hasText: 'Keeping 10%' }).textContent()) ?? '').trim();
      const counts = await page.locator('[data-testid="summer-curves"] polyline').evaluateAll((els) => els.map((e) => (e.getAttribute('points') ?? '').trim().split(/\s+/).length));
      const head = ((await page.getByTestId('summer-diff').textContent()) ?? '').trim();
      rows.push(`${age}: "${title}" | points=${counts.join('/')} | "${head.slice(0, 70)}"`);
      expect(title).toContain(`from ${age},`);
      expect(counts).toEqual([65 - age + 1, 65 - age + 1]);
      expect(head.startsWith(`Starting at ${age} means putting in $${((30 - age) * 300).toLocaleString('en-US')} more`), head).toBe(true);
    }
    // eslint-disable-next-line no-console
    console.log(`R10.1:\n${rows.join('\n')}`);
    await expect(page.getByTestId('your-money-empty')).toBeVisible();
    await expect(page.getByTestId('your-money-chart')).toHaveCount(0);
    expect(await page.locator('body').innerText()).not.toMatch(/NaN|Infinity|undefined/);
  });

  // Cycle 5 reconciliation: the figure this guards (V2-9, each dollar counted once) is unchanged;
  // the sentence around it is V2-22's new copy, which I asked for, so the expected text follows it.
  test('V2-9 regression: moving the jar into an investment counts the same dollars once in "Your money"', async ({ page }) => {
    await onboard(page);
    await dismissCapturePrompt(page);
    await demoClick(page, 'demo-make-habit');
    await skipOnce(page);
    const jar = centsOf((await page.getByTestId('jar-amount').textContent()) ?? '');
    await go(page, '/summer', 'screen-summer');
    const putIn1 = ((await page.getByTestId('your-money-putin').textContent()) ?? '').trim();
    await go(page, '/', 'screen-home');
    await dismissCapturePrompt(page);
    await clickClear(page, 'jar-move');
    await page.getByTestId('jar-ledger-what').fill('Index fund');
    await clickClear(page, 'jar-ledger-save');
    await page.waitForTimeout(1500);
    await go(page, '/', 'screen-home');
    const home = {
      kept: ((await page.getByTestId('stat-kept').textContent()) ?? '').trim(),
      moved: ((await page.getByTestId('stat-moved').textContent()) ?? '').trim(),
      jar: ((await page.getByTestId('jar-amount').textContent()) ?? '').trim(),
    };
    await go(page, '/summer', 'screen-summer');
    const putIn2 = ((await page.getByTestId('your-money-putin').textContent()) ?? '').trim();
    const end2 = await page.getByTestId('your-money-headline').getAttribute('data-end');
    // eslint-disable-next-line no-console
    console.log(`R10.4: skipped ${money(jar)}; before move Summer says "${putIn1}"; after move Home kept=${home.kept} moved=${home.moved} jar=${home.jar}; Summer says "${putIn2}" growing to $${end2}`);
    expect(putIn2, 'the same dollars must not be counted as kept AND as moved').toBe(`You have ${money(jar)} set aside right now.`);
  });
});

// ---------------------------------------------------------------------------------------------
test.describe('R18 and R15', () => {
  test('R18: the types card is byte-identical for an empty and a full, varied ledger, and all six links resolve', async ({ page }) => {
    test.setTimeout(240_000);
    await onboard(page);
    await dismissCapturePrompt(page);
    await go(page, '/invest', 'screen-invest');
    const empty = await page.getByTestId('invest-types-card').innerHTML();
    await go(page, '/invest/capture', 'screen-invest-capture');
    for (const h of HOLDING) {
      await page.getByTestId(`invest-capture-chip-${h.key}`).click();
      await page.getByTestId(`invest-capture-amount-${h.key}`).fill(String(10 + HOLDING.indexOf(h) * 7));
      if (h.requiresLabel) await page.getByTestId(`invest-capture-label-${h.key}`).fill('Gold coins from grandma');
    }
    await page.getByTestId('invest-capture-term').fill('24');
    await page.getByTestId('invest-capture-rate').fill('4.1');
    await page.getByTestId('invest-capture-save').click();
    await expect(page.getByTestId('screen-invest')).toBeVisible();
    await collapseTray(page);
    expect(await page.getByTestId('ledger-row').count()).toBe(HOLDING.length);
    const full = await page.getByTestId('invest-types-card').innerHTML();
    expect(full === empty, 'R18.2: the card must not vary with what the user holds').toBe(true);
    const order = await page.locator('[data-testid^="invest-type-"]:not([data-testid^="invest-type-link-"])').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
    expect(order).toEqual(HOLDING.map((h) => `invest-type-${h.key}`));

    const resolved: string[] = [];
    for (const h of HOLDING) {
      await go(page, '/invest', 'screen-invest');
      await clickClear(page, `invest-type-link-${h.key}`);
      await expect(page).toHaveURL(new RegExp(`/learn/${h.learnId}(\\?|$)`));
      await expect(page.getByTestId('learn-item-title')).toBeVisible();
      const t = ((await page.getByTestId('learn-item-title').textContent()) ?? '').trim();
      resolved.push(`${h.key}->${h.learnId} "${t}"`);
      expect(t).toBe(LEARN.items.find((i) => i.id === h.learnId)!.title);
    }
    // eslint-disable-next-line no-console
    console.log(`R18: identical=${full === empty} links:\n${resolved.join('\n')}`);
  });

  test('R15.6: the standing disclosure is visible, unexpanded, on all 32 surfaces', async ({ page }) => {
    test.setTimeout(240_000);
    await onboard(page);
    const paths = ['/learn', ...LEARN.items.map((i) => `/learn/${i.id}`), '/lessons', ...['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8'].map((l) => `/lessons/${l}`), '/invest', '/settings'];
    const missing: string[] = [];
    for (const p of paths) {
      await page.goto(`${p}${Q}`);
      await page.waitForLoadState('domcontentloaded');
      await collapseTray(page);
      const loc = page.getByText(LEARN.standingLine, { exact: true });
      await loc.first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => undefined);
      const visible = (await loc.count()) > 0 && (await loc.first().isVisible());
      const inClosedDetails = visible ? await loc.first().evaluate((el) => !!el.closest('details:not([open])')) : false;
      if (!visible || inClosedDetails) missing.push(p);
    }
    // eslint-disable-next-line no-console
    console.log(`DISCLOSURE: ${paths.length - missing.length} of ${paths.length} surfaces; missing: ${missing.join(', ') || 'none'}`);
    expect(missing).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
test.describe('R17 on screen', () => {
  test('best week is a record a quiet fortnight never lowers, and no screen shows a streak, a miss or a shortfall', async ({ page }) => {
    test.setTimeout(240_000);
    await onboard(page);
    await dismissCapturePrompt(page);
    await demoClick(page, 'demo-make-habit');
    for (let d = 0; d < 3; d++) {
      await skipOnce(page);
      await nextDays(page, 1);
    }
    await go(page, '/', 'screen-home');
    const read = async () => ({
      skips: ((await page.getByTestId('stat-habit-skips').textContent()) ?? '').trim(),
      best: ((await page.getByTestId('stat-habit-best-week').textContent()) ?? '').trim(),
      kept: ((await page.getByTestId('stat-habit-kept').textContent()) ?? '').trim(),
      line: ((await page.getByTestId('habit-line').textContent()) ?? '').trim(),
    });
    const busy = await read();
    await nextDays(page, 14);
    await go(page, '/', 'screen-home');
    const quiet = await read();
    // eslint-disable-next-line no-console
    console.log(`R17: after 3 skip days ${JSON.stringify(busy)}; after 14 quiet days ${JSON.stringify(quiet)}`);
    expect(quiet).toEqual(busy);

    const FORBIDDEN = /\b(streaks?|in a row|missed|miss a day|broke your|broken|behind|short of|shortfall|don['’]t break|last chance|hurry|expires?|only \$|just \$)/i;
    const hits: string[] = [];
    for (const [p, ready] of [['/', 'screen-home'], ['/activity', 'screen-activity'], ['/places', 'screen-places'], ['/invest', 'screen-invest'], ['/settings', 'screen-settings'], ['/lessons', 'screen-lessons'], ['/learn', 'screen-learn'], ['/summer', 'screen-summer']] as const) {
      await go(page, p, ready);
      const text = await page.locator('main, body').first().innerText();
      const m = FORBIDDEN.exec(text);
      if (m) hits.push(`${p}: "${text.slice(Math.max(0, m.index - 50), m.index + 50).replace(/\s+/g, ' ')}"`);
    }
    expect(hits, hits.join('\n')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
test.describe('V2-2 and V2-8 on what this cycle added', () => {
  test('44 px tap targets on the new controls: the six Read more links, ledger row actions, capture remove, jar actions', async ({ page }) => {
    await onboard(page);
    await dismissCapturePrompt(page);
    await demoClick(page, 'demo-make-habit');
    await skipOnce(page);
    const measure = async (sel: string) =>
      page.locator(sel).evaluateAll((els) => els.filter((e) => (e as HTMLElement).offsetParent !== null).map((e) => {
        const r = e.getBoundingClientRect();
        return { id: e.getAttribute('data-testid'), w: Math.round(r.width), h: Math.round(r.height) };
      }));
    const all: Array<{ id: string | null; w: number; h: number }> = [];
    all.push(...(await measure('[data-testid="jar-move"], [data-testid="jar-spent"]')));
    await captureBond(page, '1000', '12', '4.5');
    all.push(...(await measure('[data-testid^="invest-capture-remove-"], [data-testid="invest-capture-term"], [data-testid="invest-capture-rate"]')));
    await page.getByTestId('invest-capture-save').click();
    await expect(page.getByTestId('screen-invest')).toBeVisible();
    await collapseTray(page);
    all.push(...(await measure('[data-testid^="invest-type-link-"], [data-testid^="ledger-edit-"], [data-testid^="ledger-delete-"]')));
    const id = (await page.getByTestId('ledger-row').first().getAttribute('data-id'))!;
    await clickClear(page, `ledger-delete-${id}`);
    all.push(...(await measure('[data-testid="ledger-delete-yes"], [data-testid="ledger-delete-cancel"]')));
    const small = all.filter((b) => b.h < 44 || b.w < 44).map((b) => `${b.id} ${b.w}x${b.h}`);
    // eslint-disable-next-line no-console
    console.log(`TAP (${page.viewportSize()!.width}px): ${all.map((b) => `${b.id} ${b.w}x${b.h}`).join(', ')}`);
    expect(small, `plan 6.13 / V2-2: under 44 px:\n${small.join('\n')}`).toEqual([]);
  });

  test('V2-8: Settings exposes exactly one Import control to keyboard and assistive tech', async ({ page }) => {
    await onboard(page);
    await go(page, '/settings', 'screen-settings');
    const input = page.getByTestId('settings-import');
    const attrs = await input.evaluate((el) => ({ tabindex: el.getAttribute('tabindex'), hidden: el.getAttribute('aria-hidden'), label: el.getAttribute('aria-label') }));
    const named = await page.getByRole('button', { name: /import/i }).count();
    // eslint-disable-next-line no-console
    console.log(`V2-8: file input ${JSON.stringify(attrs)}; buttons named Import: ${named}`);
    expect(attrs).toEqual({ tabindex: '-1', hidden: 'true', label: null });
    expect(named).toBe(1);
  });

  test('320 px: no horizontal scroll on Home with the habit card, Invest with a maturity line, the capture with a bond row, Summer with money, E17 to E20', async ({ page }) => {
    await onboard(page);
    await dismissCapturePrompt(page);
    await demoClick(page, 'demo-make-habit');
    await skipOnce(page);
    await page.setViewportSize({ width: 320, height: 640 });
    const bad: string[] = [];
    const check = async (label: string) => {
      const w = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
      if (w.sw > w.iw + 1) bad.push(`${label} scrollWidth=${w.sw} > ${w.iw}`);
    };
    await go(page, '/', 'screen-home');
    await check('/');
    // Cycle 4: 25% is the largest rate the app allows since V2-18 (was 50%, now refused).
    await captureBond(page, '1000000', '600', '25');
    await check('/invest/capture (bond row, largest maturity)');
    await page.getByTestId('invest-capture-save').click();
    await expect(page.getByTestId('screen-invest')).toBeVisible();
    await collapseTray(page);
    await check('/invest (largest maturity line)');
    const maturity = ((await page.locator('[data-testid^="ledger-maturity-"]').first().textContent()) ?? '').trim();
    await go(page, '/summer', 'screen-summer');
    await check('/summer');
    for (const id of ['E17', 'E18', 'E19', 'E20']) {
      await go(page, `/learn/${id}`, 'screen-learn-item');
      await check(`/learn/${id}`);
    }
    // eslint-disable-next-line no-console
    console.log(`320: ${bad.join('; ') || 'no overflow'}; largest maturity line reads "${maturity}"`);
    await assertNoHorizontalScroll(page);
    expect(bad).toEqual([]);
  });

  test('D11 on the new Your money card: a 7% term tapped low in the viewport keeps its bubble', async ({ page }) => {
    await onboard(page);
    await dismissCapturePrompt(page);
    await demoClick(page, 'demo-make-habit');
    await skipOnce(page);
    await go(page, '/summer', 'screen-summer');
    const term = page.getByTestId('your-money-card').locator('[data-testid^="term-"]').first();
    await expect(term).toBeVisible();
    const vh = page.viewportSize()!.height;
    const results: string[] = [];
    for (const fromBottom of [30, 60, 110]) {
      await term.evaluate((el, fb) => {
        const r = el.getBoundingClientRect();
        window.scrollBy(0, r.top - (window.innerHeight - (fb as number)));
      }, fromBottom);
      await page.waitForTimeout(250);
      const box = (await term.boundingBox())!;
      if (box.y + box.height > vh - 5 || box.y < 60) continue;
      const onTop = await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('[data-testid^="term-"]'), [box.x + box.width / 2, box.y + box.height / 2]);
      if (!onTop) continue;
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(600);
      const n = await page.getByTestId('tooltip-bubble').count();
      results.push(`y=${Math.round(box.y)}/${vh}: bubbles=${n}`);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(100);
    }
    // eslint-disable-next-line no-console
    console.log(`D11-SUMMER: ${results.join(', ')}`);
    expect(results.length, 'the sweep must tap something').toBeGreaterThan(0);
    expect(results.filter((r) => !r.endsWith('bubbles=1'))).toEqual([]);
  });
});
