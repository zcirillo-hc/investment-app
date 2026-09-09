/**
 * TESTER v2, job 4 (the honesty half of the privacy claims).
 *
 * Criterion 24 and 20: with the permission denied, and on an iPhone Safari tab before Add to
 * Home Screen, NO row is created in `push_subs`. The Nudges card must not then tell the user
 * what is on the server, or offer to delete a row that does not exist.
 *
 * `?push=<state>` is the coder's own override (build notes, client deviation 8): it forces
 * `supportState()` and nothing else, so these cases are reachable in one Chromium profile.
 */
import { expect, test } from '@playwright/test';
import { collapseTray, onboard } from './fixtures';

const P = '?demo=1&freeze=1&start=2026-06-15&seed=42';

for (const state of ['denied', 'needs-ios-install', 'unsupported'] as const) {
  test(`the Nudges card in the "${state}" state does not claim a server row it never created`, async ({ page }) => {
    const apiCalls: string[] = [];
    await onboard(page);
    page.on('request', (r) => {
      if (r.url().includes('/api/')) apiCalls.push(`${r.method()} ${new URL(r.url()).pathname}`);
    });

    await page.goto(`/settings${P}&push=${state}`);
    await expect(page.getByTestId('screen-settings')).toBeVisible();
    await collapseTray(page);

    if ((await page.getByTestId('nudges-toggle').count()) === 0) {
      test.skip(true, `the ${state} state renders no toggle`);
      return;
    }
    await page.getByTestId('nudges-toggle').click();
    await page.waitForTimeout(900);

    const on = await page.getByTestId('nudges-state').getAttribute('data-on');
    const endpointShown = await page.getByTestId('nudges-endpoint').count();
    const storedBlock = await page.getByTestId('nudges-stored').count();
    const text = await page.locator('body').innerText();

    // eslint-disable-next-line no-console
    console.log(
      `PUSH-STATE ${state}: nudgesEnabled=${on} nudges-stored=${storedBlock} endpoint-line=${endpointShown} apiCalls=[${apiCalls.join(', ')}]`,
    );

    // Nothing was subscribed: there is no endpoint hash and no subscribe call was made.
    expect(endpointShown, 'no endpoint hash exists in this state').toBe(0);
    expect(apiCalls.filter((c) => c.includes('subscribe')), 'nothing subscribed in this state').toEqual([]);

    if (on === 'true') {
      expect(
        storedBlock,
        `"What is on the server while nudges are on" is rendered with nothing on the server. Card text:\n${text.slice(0, 900)}`,
      ).toBe(0);
      expect(text, 'the card must not say a row exists on the server').not.toContain('What is on the server while nudges are on');
      expect(text, 'the card must not offer to delete a server row that was never created').not.toContain(
        'This deletes the row on the server, right now',
      );
    }
  });
}

test('the "ready" state is the only one that reaches the 9.4a explainer before a prompt', async ({ page }) => {
  await onboard(page);
  await page.goto(`/settings${P}&push=ready`);
  await expect(page.getByTestId('screen-settings')).toBeVisible();
  await collapseTray(page);
  // Deviation 5: the switch opens the panel; the panel's own button turns nudges on.
  await page.getByTestId('nudges-toggle').click();
  await page.waitForTimeout(400);
  const text = await page.locator('body').innerText();
  // eslint-disable-next-line no-console
  console.log(`READY STATE after toggle:\n${text.slice(text.indexOf('Nudges'), text.indexOf('Nudges') + 900)}`);
  expect(await page.getByTestId('nudges-state').getAttribute('data-on')).toBe('false');
});
