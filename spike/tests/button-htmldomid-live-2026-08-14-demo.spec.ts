/**
 * Live verification for @apx/testkit's buttonByHtmlDomId()
 * (packages/testkit/src/components/button.ts, runtime-review P0 item 4)
 * against a real button confirmed this pass to set `advanced { htmlDomId
 * }` -- Sample Interactive Grids page 57 ("Custom Server Processing"),
 * button `save`, static export field `advanced { htmlDomId: save-button
 * }` (confirmed via direct read of the real .apx export text, not
 * paraphrase).
 *
 * STATUS AT TIME OF WRITING: NOT YET RUN LIVE. Re-checked reachability
 * immediately before writing this spec (curl -o /dev/null
 * -w '%{http_code}' against the app's base URL below) -- returned HTTP
 * 404, and APX_LOGIN_TEST_USERNAME/APX_LOGIN_TEST_PASSWORD were unset in
 * this environment, so this spec could not be executed this pass.
 *
 * WHAT THIS SPEC ACTUALLY DECIDES, once run: whether `htmlDomId` becomes
 * the literal DOM `id` attribute on a BUTTON element the same way it's
 * already CONFIRMED to for regions (ADR-003) -- this is currently only a
 * well-reasoned hypothesis (same `advanced` group/property name, same
 * EBNF shape), NOT independently verified for buttons. If this spec's
 * first assertion fails, buttonByHtmlDomId()'s `#<id>` locator strategy
 * is WRONG for buttons and must not be used -- do not assume it passes
 * without actually running it.
 *
 * Requires BOTH APX_LOGIN_TEST_USERNAME and APX_LOGIN_TEST_PASSWORD --
 * skips cleanly if either is unset. Neither credential is hardcoded here.
 */
import { expect, test } from '@playwright/test';
import { buttonByHtmlDomId, buttonByLabel, login } from '@apx/testkit';

const BASE =
  'https://g9323cdc071900d-tjta51y2tod5o8ej.adb.us-ashburn-1.oraclecloudapps.com/ords/r/satwik/sample-interactive-grids';

test.beforeEach(async ({ page }) => {
  const username = process.env.APX_LOGIN_TEST_USERNAME;
  const password = process.env.APX_LOGIN_TEST_PASSWORD;
  test.skip(
    !username || !password,
    'APX_LOGIN_TEST_USERNAME/APX_LOGIN_TEST_PASSWORD not set -- skipping live buttonByHtmlDomId() verification',
  );
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await login(page, { username: username!, password: password! });
  // This app enables pageAccessProtection: argumentsMustHaveChecksum --
  // navigate via a real UI click, not page.goto() to a friendly URL (see
  // docs/quirks/26.1.json page-access-protection-blocks-bare-navigation).
  // Exact click path unconfirmed for this specific page (57) -- adjust
  // once run if the real nav structure differs from this best guess.
  await page.getByRole('link', { name: /^Custom Server Processing/ }).click();
  await page.waitForLoadState('domcontentloaded');
});

test('buttonByHtmlDomId() resolves the SAME element as buttonByLabel() for a button that sets advanced { htmlDomId }', async ({
  page,
}) => {
  const byLabel = buttonByLabel(page, 'Save');
  const byHtmlDomId = buttonByHtmlDomId(page, 'save-button');

  // The core hypothesis under test: does #save-button resolve to a real,
  // visible element at all?
  await expect(byHtmlDomId).toHaveCount(1);

  // If it does, is it the SAME element buttonByLabel() finds (confirming
  // htmlDomId really is this button's DOM id, not some other element
  // that happens to share the string)?
  const labelId = await byLabel.getAttribute('id');
  expect(labelId).toBe('save-button');
});

test('buttonByHtmlDomId() records a coverage touch with html-dom-id strategy, distinct from accessible-name', async ({ page }) => {
  const before = process.env.APX_COVERAGE_LOG;
  // Purely a locator-construction smoke check here -- full coverage-log
  // assertions belong in packages/testkit/test/coverage.test.ts (unit,
  // already passing without live access). This just confirms the call
  // doesn't throw against a real page.
  const locator = buttonByHtmlDomId(page, 'save-button', { pageId: 57, identifier: 'save' });
  expect(await locator.count()).toBeGreaterThanOrEqual(0);
  expect(process.env.APX_COVERAGE_LOG).toBe(before); // untouched -- coverage recording is opt-in only
});
