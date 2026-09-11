/**
 * TESTER, cycle 5 (2026-09-11), the browser half. Re-verifies V2-20 to V2-25 and the toast
 * against e7bb37f in the running app, following the build notes' "What the tester should
 * re-check" list, and attacks what the fixes added around them.
 *
 * Same convention as cycles 2 to 4: a test titled DEFECT fails today on purpose and names the
 * finding; everything else must pass.
 */
import { writeFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { START, clickClear, collapseTray, demoClick, dismissCapturePrompt, nextDays, onboard } from './fixtures';
import { STORAGE_KEY } from '../../src/config';

const Q = '?demo=1&freeze=1&start=2026-06-15&seed=42';
const MIRROR_KEY = 'spare-change-state-mirror';

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
const envelope = async (page: Page): Promise<any> => JSON.parse(await rawEnvelope(page));
const persisted = async (page: Page): Promise<any> => (await envelope(page)).state;

function today(s: any): string {
  const d = new Date(`${s.clock.startDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + s.clock.dayIndex);
  return d.toISOString().slice(0, 10);
}
const ledgerRow = (date: string, id: string, extra: Record<string, unknown>) => ({
  id,
  date,
  amountCents: 100000,
  what: 'Bonds or CDs',
  note: '',
  source: 'manual',
  createdAt: '2026-06-15T12:00:00.000Z',
  ...extra,
});

/**
 * Leaves storage the way an earlier build would have: an IndexedDB envelope at the given persist
 * version, and optionally a newer localStorage mirror. Written from a static page on the same
 * origin, so no app code is running to write over it.
 */
async function plant(
  page: Page,
  opts: { version: number; mutate?: (s: any) => void; mirror?: { version: number; mutate: (s: any) => void } },
): Promise<void> {
  const base = (await envelope(page)).state;
  const idbState = JSON.parse(JSON.stringify(base));
  opts.mutate?.(idbState);
  const idbRaw = JSON.stringify({ rev: 1_000_000_000, state: idbState, version: opts.version });
  let mirrorRaw: string | null = null;
  if (opts.mirror) {
    const m = JSON.parse(JSON.stringify(base));
    opts.mirror.mutate(m);
    mirrorRaw = JSON.stringify({ rev: 1_000_000_001, state: m, version: opts.mirror.version });
  }
  await page.goto('/manifest.webmanifest');
  await page.evaluate(
    ({ key, idbRaw, mirrorRaw, mirrorKey }) =>
      new Promise<void>((res, rej) => {
        localStorage.removeItem(mirrorKey);
        sessionStorage.clear();
        const req = indexedDB.open('keyval-store');
        req.onerror = () => rej(req.error);
        req.onsuccess = () => {
          const tx = req.result.transaction('keyval', 'readwrite');
          tx.objectStore('keyval').put(idbRaw, key);
          tx.oncomplete = () => {
            if (mirrorRaw) localStorage.setItem(mirrorKey, mirrorRaw);
            res();
          };
          tx.onerror = () => rej(tx.error);
        };
      }),
    { key: STORAGE_KEY, idbRaw, mirrorRaw, mirrorKey: MIRROR_KEY },
  );
}

async function go(page: Page, path: string, ready: string) {
  await page.goto(path === '/' ? START : `${path}${Q}`);
  await expect(page.getByTestId(ready)).toBeVisible();
  await collapseTray(page);
}

/** The text of the toast if one shows within `ms`, else null. */
async function toastText(page: Page, ms = 4000): Promise<string | null> {
  const t = page.getByTestId('auto-advance-toast');
  try {
    await t.waitFor({ state: 'visible', timeout: ms });
  } catch {
    return null;
  }
  return ((await t.textContent()) ?? '').trim();
}

async function importPath(page: Page, path: string): Promise<string> {
  await go(page, '/settings', 'screen-settings');
  const reloaded = page.waitForEvent('load', { timeout: 30_000 }).then(() => true).catch(() => false);
  await page.getByTestId('settings-import').setInputFiles(path);
  if (await reloaded) return 'imported (page reloaded)';
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

/** Six chips, each at least 44 x 44 and wholly inside the viewport, and no page scroll sideways. */
async function chipAudit(page: Page, prefix: string, width: number): Promise<string[]> {
  const boxes = await page.locator(`[data-testid^="${prefix}-type-"]`).evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { id: el.getAttribute('data-testid'), x: r.x, w: r.width, h: r.height };
    }),
  );
  const bad: string[] = [];
  if (boxes.length !== 6) bad.push(`${prefix}: ${boxes.length} chips, expected 6`);
  for (const b of boxes) {
    if (b.h < 43.5 || b.w < 43.5) bad.push(`${b.id} is ${b.w.toFixed(1)}x${b.h.toFixed(1)}`);
    if (b.x < -0.5 || b.x + b.w > width + 0.5) bad.push(`${b.id} spans ${b.x.toFixed(1)} to ${(b.x + b.w).toFixed(1)} of ${width}`);
  }
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (over > 1) bad.push(`${prefix}: page scrolls ${over}px sideways`);
  return bad;
}

// ---------------------------------------------------------------------------------------------
test.describe('V2-21 / R16.8 through the load path', () => {
  test('IndexedDB: a version 1 envelope is tidied on load, the notice fits a 320 px screen, a second load says nothing, and the old symptom is gone', async ({ page }) => {
    test.setTimeout(240_000);
    await onboard(page);
    await dismissCapturePrompt(page);
    await go(page, '/invest', 'screen-invest');
    const d = today(await persisted(page));
    await plant(page, {
      version: 1,
      mutate: (st) =>
        st.ledger.push(
          ledgerRow(d, 'led:30', { termMonths: 12, yieldBps: 3000 }),
          ledgerRow(d, 'led:31', { what: 'Individual stocks', termMonths: 360, yieldBps: 1000 }),
          ledgerRow(d, 'led:32', { termMonths: 12, yieldBps: 450 }),
        ),
    });
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto(`/invest${Q}`);
    const toast = await toastText(page);
    const box = await page.getByTestId('auto-advance-toast').boundingBox().catch(() => null);
    await expect(page.getByTestId('screen-invest')).toBeVisible();
    await collapseTray(page);
    const env = await envelope(page);
    const by = Object.fromEntries(env.state.ledger.map((e: any) => [e.id, e]));
    const line32 = ((await page.getByTestId('ledger-maturity-led:32').textContent()) ?? '').trim();
    const line30 = await page.getByTestId('ledger-maturity-led:30').count();

    await page.reload();
    await expect(page.getByTestId('screen-invest')).toBeVisible();
    const again = await toastText(page, 2500);
    await collapseTray(page);
    const editErr = await saveEdit(page, 'led:30', { note: 'opened in June' });

    // eslint-disable-next-line no-console
    console.log(`LOAD-IDB: toast="${toast}" box=${JSON.stringify(box)} version=${env.version} led:30=${JSON.stringify(by['led:30'])} led:31=${JSON.stringify(by['led:31'])} second load toast="${again}" note edit error="${editErr}"`);
    expect({
      toast: toast !== null && /^2 entries had a length or a rate/.test(toast),
      inside: box !== null && box.x >= -0.5 && box.x + box.width <= 320.5,
      version: env.version,
      led30: { term: by['led:30']?.termMonths, rate: 'yieldBps' in (by['led:30'] ?? {}) },
      led31: { term: 'termMonths' in (by['led:31'] ?? {}), rate: 'yieldBps' in (by['led:31'] ?? {}), amount: by['led:31']?.amountCents },
      led32: { term: by['led:32']?.termMonths, rate: by['led:32']?.yieldBps },
      line32: /\$1,045\.00/.test(line32),
      line30,
      again,
      editErr,
    }).toEqual({
      toast: true,
      inside: true,
      version: 2,
      led30: { term: 12, rate: false },
      led31: { term: false, rate: false, amount: 100000 },
      led32: { term: 12, rate: 450 },
      line32: true,
      line30: 0,
      again: null,
      editErr: null,
    });
  });

  test('localStorage mirror: a version 1 mirror that is newer than IndexedDB is the one loaded, and it is tidied and told too', async ({ page }) => {
    test.setTimeout(240_000);
    await onboard(page);
    await dismissCapturePrompt(page);
    await go(page, '/invest', 'screen-invest');
    const d = today(await persisted(page));
    await plant(page, { version: 1, mirror: { version: 1, mutate: (st) => st.ledger.push(ledgerRow(d, 'led:30', { termMonths: 12, yieldBps: 3000 })) } });
    await page.goto(`/invest${Q}`);
    const toast = await toastText(page);
    await expect(page.getByTestId('screen-invest')).toBeVisible();
    const env = await envelope(page);
    const e = env.state.ledger.find((x: any) => x.id === 'led:30');
    const mirror = JSON.parse((await page.evaluate((k) => localStorage.getItem(k), MIRROR_KEY)) ?? 'null');
    // eslint-disable-next-line no-console
    console.log(`LOAD-MIRROR: toast="${toast}" idb version=${env.version} led:30=${JSON.stringify(e)} mirror version=${mirror?.version}`);
    expect({ toast: toast !== null && /^One entry had a length or a rate/.test(toast), found: !!e, term: e?.termMonths, rate: e ? 'yieldBps' in e : null, version: env.version, mirror: mirror?.version }).toEqual({
      toast: true,
      found: true,
      term: 12,
      rate: false,
      version: 2,
      mirror: 2,
    });
  });

  test('DEFECT: a version 1 envelope with one row the migrate cannot read boots as a brand new user, and the first step of Welcome overwrites the stored profile and history', async ({ page }) => {
    test.setTimeout(240_000);
    await onboard(page);
    await dismissCapturePrompt(page);
    await nextDays(page, 3);
    const before = await persisted(page);
    const d = today(before);
    // A row with no `what`. No build writes one; it stands for any row the new migrate cannot
    // read. Before e7bb37f the migrate was the identity and this envelope loaded.
    await plant(page, { version: 1, mutate: (st) => st.ledger.push({ id: 'led:60', date: d, amountCents: 100, note: '', source: 'manual', createdAt: '2026-06-15T12:00:00.000Z' }) });
    await page.goto(START);
    await expect(page.locator('[data-testid="screen-home"], [data-testid="screen-welcome"]').first()).toBeVisible();
    const screen = (await page.getByTestId('screen-home').count()) > 0 ? 'home' : 'welcome';
    if (screen === 'welcome') {
      // What a person does when the app has forgotten them: start again.
      await page.getByTestId('welcome-name').fill('Sam');
      await page.getByTestId('welcome-continue').click();
      await page.waitForTimeout(800);
    }
    const after = await persisted(page);
    const summary = (s: any) => ({ onboarded: s.profile.onboardingComplete, events: s.events.length, ledger: s.ledger.length, dayIndex: s.clock.dayIndex, visits: s.visits.length });
    // eslint-disable-next-line no-console
    console.log(`MIGRATE-THROW: booted to ${screen}; stored before ${JSON.stringify(summary(before))}; stored after one Welcome step ${JSON.stringify(summary(after))}`);
    expect({ screen, events: after.events.length, dayIndex: after.clock.dayIndex }).toEqual({ screen: 'home', events: before.events.length, dayIndex: before.clock.dayIndex });
  });

  test('a legacy "Bonds or CDs" row with no stored type from an older build: no notice, opens on the Bonds or CDs chip, keeps its rate through a note edit, and is stamped on save', async ({ page }) => {
    test.setTimeout(240_000);
    await onboard(page);
    await dismissCapturePrompt(page);
    await go(page, '/invest', 'screen-invest');
    const d = today(await persisted(page));
    await plant(page, { version: 1, mutate: (st) => st.ledger.push(ledgerRow(d, 'led:40', { termMonths: 12, yieldBps: 450 })) });
    await page.goto(`/invest${Q}`);
    const toast = await toastText(page, 2500);
    await expect(page.getByTestId('screen-invest')).toBeVisible();
    await collapseTray(page);
    const lineBefore = ((await page.getByTestId('ledger-maturity-led:40').textContent()) ?? '').trim();
    await clickClear(page, 'ledger-edit-led:40');
    const pressed = await page.getByTestId('ledger-edit-type-bondsCds').getAttribute('aria-pressed');
    const prefill = { term: await page.getByTestId('ledger-edit-term').inputValue(), rate: await page.getByTestId('ledger-edit-rate').inputValue() };
    await page.getByTestId('ledger-edit-note').fill('from my statement');
    await clickClear(page, 'ledger-edit-save');
    await expect(page.getByTestId('ledger-edit-form')).toHaveCount(0);
    await page.waitForTimeout(400);
    const e = (await persisted(page)).ledger.find((x: any) => x.id === 'led:40');
    const lineAfter = ((await page.getByTestId('ledger-maturity-led:40').textContent()) ?? '').trim();
    const pill = await page.getByTestId('ledger-row-type-led:40').count();
    expect({ toast, lineBefore: /\$1,045\.00/.test(lineBefore), pressed, prefill, stored: { t: e.holdingType, term: e.termMonths, rate: e.yieldBps, note: e.note }, lineAfter: /\$1,045\.00/.test(lineAfter), pill }).toEqual({
      toast: null,
      lineBefore: true,
      pressed: 'true',
      prefill: { term: '12', rate: '4.50' },
      stored: { t: 'bondsCds', term: 12, rate: 450, note: 'from my statement' },
      lineAfter: true,
      pill: 0,
    });
  });
});

// ---------------------------------------------------------------------------------------------
test.describe('V2-21 / R16.8 through the import screen', () => {
  test('a stock row with a term and a rate imports with both removed and a notice said once; a string term is refused and says what failed (cycle 6: reconciled to V2-29)', async ({ page }, info) => {
    test.setTimeout(240_000);
    await onboard(page);
    await dismissCapturePrompt(page);
    const s = await persisted(page);
    const { push: _push, ...file } = s;
    const d = today(s);
    const stock = JSON.parse(JSON.stringify(file));
    stock.ledger.push(ledgerRow(d, 'led:77', { what: 'Individual stocks', termMonths: 360, yieldBps: 1000 }));
    const p1 = info.outputPath('stock-row.json');
    writeFileSync(p1, JSON.stringify(stock));
    const msg = await importPath(page, p1);
    const toast = await toastText(page, 4000);
    await go(page, '/invest', 'screen-invest');
    const e = (await persisted(page)).ledger.find((x: any) => x.id === 'led:77');
    const line = await page.getByTestId('ledger-maturity-led:77').count();
    await page.reload();
    await expect(page.getByTestId('screen-invest')).toBeVisible();
    const toast2 = await toastText(page, 2500);

    const bad = JSON.parse(JSON.stringify(file));
    bad.ledger.push(ledgerRow(d, 'led:78', { holdingType: 'bondsCds', termMonths: '12', yieldBps: 450 }));
    const p2 = info.outputPath('string-term.json');
    writeFileSync(p2, JSON.stringify(bad));
    const msg2 = await importPath(page, p2);
    // eslint-disable-next-line no-console
    console.log(`IMPORT-TIDY: "${msg}" toast="${toast}" led:77=${JSON.stringify(e)} line=${line} second load toast="${toast2}" | string term: "${msg2}"`);
    // Cycle 6 reconciliation (64d619b, V2-29, owner decision 2026-09-11). This case encoded the
    // pre-fix message shape: "part of it did not pass ... What it found: ledger[0]...". The
    // fixed copy names the failing part in plain words from a fixed list and never quotes the
    // validator's own path or anything read from the file, so the assertion below is inverted:
    // the old shape must be GONE, not present.
    expect({
      msg,
      toast: toast !== null && /^One entry had a length or a rate/.test(toast),
      kept: e ? { amount: e.amountCents, what: e.what, term: 'termMonths' in e, rate: 'yieldBps' in e } : null,
      line,
      toast2,
      msg2: /^refused: That looks like a Spare Change export, but an investment entry did not pass the app's checks, so nothing changed\.$/.test(msg2),
      msg2LeaksNothing: !msg2.includes('ledger[') && !msg2.includes('termMonths') && !msg2.includes('part of it'),
    }).toEqual({
      msg: 'imported (page reloaded)',
      toast: true,
      kept: { amount: 100000, what: 'Individual stocks', term: false, rate: false },
      line: 0,
      toast2: null,
      msg2: true,
      msg2LeaksNothing: true,
    });
  });
});

// ---------------------------------------------------------------------------------------------
test.describe('V2-23 the type chips in all three ledger forms', () => {
  test('DEFECT: the jar move form on Home offers the type chips and a length and rate, and saves none of them', async ({ page }) => {
    test.setTimeout(240_000);
    await onboard(page);
    await dismissCapturePrompt(page);
    await demoClick(page, 'demo-make-habit');
    await skipOnce(page);
    await go(page, '/', 'screen-home');
    await dismissCapturePrompt(page);
    await clickClear(page, 'jar-move');
    await expect(page.getByTestId('jar-ledger-form')).toBeVisible();
    await clickClear(page, 'jar-ledger-type-bondsCds');
    const nameAfterChip = await page.getByTestId('jar-ledger-what').inputValue();
    await page.getByTestId('jar-ledger-term').fill('12');
    await page.getByTestId('jar-ledger-rate').fill('4.5');
    await clickClear(page, 'jar-ledger-save');
    await expect(page.getByTestId('jar-ledger-form')).toHaveCount(0);
    await page.waitForTimeout(600);
    const bond = (await persisted(page)).ledger.find((e: any) => e.source === 'jar');

    // A second move, picking Individual stocks and typing the user's own name for it.
    await nextDays(page, 1);
    await skipOnce(page);
    await go(page, '/', 'screen-home');
    await dismissCapturePrompt(page);
    let stock: any = null;
    if (await page.getByTestId('jar-move').isEnabled()) {
      await clickClear(page, 'jar-move');
      await clickClear(page, 'jar-ledger-type-stocks');
      await page.getByTestId('jar-ledger-what').fill('My brokerage');
      await clickClear(page, 'jar-ledger-save');
      await expect(page.getByTestId('jar-ledger-form')).toHaveCount(0);
      await page.waitForTimeout(600);
      stock = (await persisted(page)).ledger.find((e: any) => e.source === 'jar' && e.what === 'My brokerage') ?? null;
    }
    await go(page, '/invest', 'screen-invest');
    const line = bond ? await page.getByTestId(`ledger-maturity-${bond.id}`).count() : -1;
    const pillLoc = stock ? page.getByTestId(`ledger-row-type-${stock.id}`) : null;
    const pill = pillLoc && (await pillLoc.count()) > 0 ? ((await pillLoc.textContent()) ?? '').trim() : null;
    // eslint-disable-next-line no-console
    console.log(`JAR-MOVE: name after chip="${nameAfterChip}"; bond move stored ${JSON.stringify(bond)}; Invest line=${line}; stock move stored ${JSON.stringify(stock)}; type pill=${JSON.stringify(pill)}`);
    expect({
      bond: bond ? { t: bond.holdingType, term: bond.termMonths, rate: bond.yieldBps } : null,
      line,
      stock: stock ? stock.holdingType : 'second move not reached',
      pill,
    }).toEqual({ bond: { t: 'bondsCds', term: 12, rate: 450 }, line: 1, stock: 'stocks', pill: 'Individual stocks' });
  });

  test('320 px: in the add form, the edit form and the jar move form, all six chips are 44 px and on screen, and nothing scrolls sideways', async ({ page }) => {
    test.setTimeout(240_000);
    await onboard(page);
    await dismissCapturePrompt(page);
    await page.setViewportSize({ width: 320, height: 720 });
    const bad: string[] = [];
    await go(page, '/invest', 'screen-invest');
    await clickClear(page, 'invest-add');
    await clickClear(page, 'ledger-type-bondsCds');
    await expect(page.getByTestId('ledger-term')).toBeVisible();
    bad.push(...(await chipAudit(page, 'ledger', 320)));
    await clickClear(page, 'ledger-cancel');

    const id = await captureBond(page, '1000', '12', '4.5');
    await clickClear(page, `ledger-edit-${id}`);
    await expect(page.getByTestId('ledger-edit-term')).toBeVisible();
    bad.push(...(await chipAudit(page, 'ledger-edit', 320)));
    await clickClear(page, 'ledger-edit-cancel');

    // The nudge card lives on Home, so the skip that funds the jar has to happen there.
    await go(page, '/', 'screen-home');
    await dismissCapturePrompt(page);
    await demoClick(page, 'demo-make-habit');
    await skipOnce(page);
    await go(page, '/', 'screen-home');
    await dismissCapturePrompt(page);
    await clickClear(page, 'jar-move');
    await clickClear(page, 'jar-ledger-type-bondsCds');
    await expect(page.getByTestId('jar-ledger-term')).toBeVisible();
    bad.push(...(await chipAudit(page, 'jar-ledger', 320)));
    // eslint-disable-next-line no-console
    console.log(`CHIPS-320: ${bad.length ? bad.join('; ') : 'all three forms clean'}`);
    expect(bad).toEqual([]);
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`axe, ${theme}: every ledger form with a type chip picked has no serious or critical violation`, async ({ page }) => {
      test.setTimeout(240_000);
      await page.addInitScript((t) => window.localStorage.setItem('spare-change-theme', t), theme);
      await onboard(page);
      await dismissCapturePrompt(page);
      const found: string[] = [];
      const scan = async (label: string) => {
        await page.waitForTimeout(500);
        const r = await new AxeBuilder({ page }).analyze();
        for (const v of r.violations)
          if (v.impact === 'serious' || v.impact === 'critical') found.push(`${label}: ${v.id} (${v.impact}) ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
      };
      await go(page, '/invest', 'screen-invest');
      await clickClear(page, 'invest-add');
      await clickClear(page, 'ledger-type-bondsCds');
      await scan('add, Bonds or CDs picked');
      await clickClear(page, 'ledger-type-crypto');
      await scan('add, Crypto picked');
      await clickClear(page, 'ledger-cancel');
      const id = await captureBond(page, '1000', '12', '4.5');
      await clickClear(page, `ledger-edit-${id}`);
      await clickClear(page, 'ledger-edit-type-stocks');
      await scan('edit, Individual stocks picked');
      await clickClear(page, 'ledger-edit-cancel');
      // The nudge card lives on Home, so the skip that funds the jar has to happen there.
      await go(page, '/', 'screen-home');
      await dismissCapturePrompt(page);
      await demoClick(page, 'demo-make-habit');
      await skipOnce(page);
      await go(page, '/', 'screen-home');
      await dismissCapturePrompt(page);
      await clickClear(page, 'jar-move');
      await clickClear(page, 'jar-ledger-type-bondsCds');
      await scan('jar move, Bonds or CDs picked');
      // eslint-disable-next-line no-console
      console.log(`AXE-CHIPS ${theme}: ${found.length ? found.join('\n') : 'clean'}`);
      expect(found).toEqual([]);
    });
  }

  test('the name follows a chip only while it is empty or still the previous chip\'s label, and the add form saves the picked type', async ({ page }) => {
    test.setTimeout(240_000);
    await onboard(page);
    await dismissCapturePrompt(page);
    await go(page, '/invest', 'screen-invest');
    await clickClear(page, 'invest-add');
    const what = () => page.getByTestId('ledger-what').inputValue();
    const seq: string[] = [];
    await clickClear(page, 'ledger-type-bondsCds');
    seq.push(await what());
    await clickClear(page, 'ledger-type-crypto');
    seq.push(await what());
    await page.getByTestId('ledger-what').fill('My coins');
    await clickClear(page, 'ledger-type-cash');
    seq.push(await what());
    await page.getByTestId('ledger-what').fill('');
    await clickClear(page, 'ledger-type-stocks');
    seq.push(await what());
    await clickClear(page, 'ledger-type-other');
    seq.push(await what());
    await clickClear(page, 'ledger-type-cash');
    seq.push(await what());
    await clickClear(page, 'ledger-type-bondsCds');
    seq.push(await what());
    await page.getByTestId('ledger-amount').fill('100');
    await page.getByTestId('ledger-term').fill('12');
    await page.getByTestId('ledger-rate').fill('4.5');
    await clickClear(page, 'ledger-save');
    await expect(page.getByTestId('ledger-form')).toHaveCount(0);
    await page.waitForTimeout(400);
    const e = (await persisted(page)).ledger.find((x: any) => x.source === 'manual');
    expect({ seq, stored: e ? { t: e.holdingType, what: e.what, term: e.termMonths, rate: e.yieldBps } : null }).toEqual({
      seq: ['Bonds or CDs', 'Crypto', 'My coins', 'Individual stocks', '', 'Cash savings', 'Bonds or CDs'],
      stored: { t: 'bondsCds', what: 'Bonds or CDs', term: 12, rate: 450 },
    });
  });
});

// ---------------------------------------------------------------------------------------------
test.describe('V2-20 neighbours on the capture', () => {
  test('DEFECT: a Something else row whose label is one character too long, beside a valid row, disables Save and nothing on screen says why', async ({ page }) => {
    test.setTimeout(240_000);
    await onboard(page);
    await dismissCapturePrompt(page);
    await go(page, '/invest/capture', 'screen-invest-capture');
    await page.getByTestId('invest-capture-chip-indexFund').click();
    await page.getByTestId('invest-capture-amount-indexFund').fill('10');
    await page.getByTestId('invest-capture-chip-other').click();
    await page.getByTestId('invest-capture-amount-other').fill('5');
    await page.getByTestId('invest-capture-label-other').fill('x'.repeat(61));
    const typed = (await page.getByTestId('invest-capture-label-other').inputValue()).length;
    const enabled = await page.getByTestId('invest-capture-save').isEnabled();
    if (enabled) {
      await page.getByTestId('invest-capture-save').click();
      await page.waitForTimeout(500);
    }
    const alerts = (await page.locator('[role="alert"]').allTextContents()).map((t) => t.trim()).filter(Boolean);
    const ledger = (await persisted(page)).ledger.length;
    // eslint-disable-next-line no-console
    console.log(`LABEL-61: typed=${typed} saveEnabled=${enabled} alerts=${JSON.stringify(alerts)} ledger=${ledger}`);
    expect({ enabled, reason: alerts.length > 0, ledger }).toEqual({ enabled: false, reason: true, ledger: 0 });
  });

  test('a double tap on Save writes the rows once', async ({ page }) => {
    await onboard(page);
    await dismissCapturePrompt(page);
    await go(page, '/invest/capture', 'screen-invest-capture');
    await page.getByTestId('invest-capture-chip-indexFund').click();
    await page.getByTestId('invest-capture-amount-indexFund').fill('10');
    await page.getByTestId('invest-capture-save').dblclick();
    await expect(page.getByTestId('screen-invest')).toBeVisible();
    await page.waitForTimeout(600);
    const rows = ((await persisted(page)).ledger as any[]).map((e) => `${e.what} ${e.amountCents}`);
    expect(rows).toEqual(['Broad index fund 1000']);
  });
});
