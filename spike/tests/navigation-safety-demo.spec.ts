/**
 * Verifies @apx/testkit's navigation-mode primitives
 * (packages/testkit/src/fixtures/navigation.ts, runtime-review P0 item 2)
 * against a real checksum-protected app -- Sample Interactive Grids.
 *
 * STATUS AT TIME OF WRITING: NOT YET RUN LIVE. Re-checked reachability
 * immediately before writing this spec (curl -o /dev/null
 * -w '%{http_code}' against the app's base URL below) -- returned HTTP
 * 404, and APX_LOGIN_TEST_USERNAME/APX_LOGIN_TEST_PASSWORD were unset in
 * this environment, so this spec could not be executed this pass.
 * navigateViaUiPath() is a direct formalization of the EXACT click
 * sequence already live-confirmed working in
 * spike/tests/interactive-grid-demo.spec.ts (same page.getByRole('link',
 * ...).click() + page.waitForLoadState('domcontentloaded') calls, just
 * factored into a reusable function) -- this should be a formality to
 * confirm, not a new risk, but it has NOT been literally re-run, and
 * this file must not be cited as "live-verified" until it has been.
 *
 * Requires BOTH APX_LOGIN_TEST_USERNAME and APX_LOGIN_TEST_PASSWORD --
 * skips cleanly if either is unset. Neither credential is hardcoded here.
 */
import { expect, test } from '@playwright/test';
import { assessNavigationSafety, gotoApexPageAuto, login, navigateViaUiPath } from '@apx/testkit';

const BASE =
  'https://g9323cdc071900d-tjta51y2tod5o8ej.adb.us-ashburn-1.oraclecloudapps.com/ords/r/satwik/sample-interactive-grids';

test.beforeEach(async ({ page }) => {
  const username = process.env.APX_LOGIN_TEST_USERNAME;
  const password = process.env.APX_LOGIN_TEST_PASSWORD;
  test.skip(
    !username || !password,
    'APX_LOGIN_TEST_USERNAME/APX_LOGIN_TEST_PASSWORD not set -- skipping live navigation-safety verification',
  );
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await login(page, { username: username!, password: password! });
});

test('assessNavigationSafety() correctly flags the Basic Editing page as unsafe (mirrors the AST: non-public + argumentsMustHaveChecksum)', () => {
  // Mirrors the real p00030-basic-editing.apx export: no `authentication:
  // public` declared, `security { pageAccessProtection:
  // argumentsMustHaveChecksum }` present.
  const safety = assessNavigationSafety({ pageAccessProtection: 'argumentsMustHaveChecksum', isPublic: false });
  expect(safety.mode).toBe('ui-navigation');
});

test('navigateViaUiPath() reaches Basic Editing via the confirmed-working click path', async ({ page }) => {
  const errors = await navigateViaUiPath(page, ['Editing', 'Basic Editing']);
  expect(page.url()).toContain('/basic-editing');
  expect(errors).toEqual([]);
  // apex.item must exist -- the same boot signal gotoApexPage() waits for.
  expect(
    await page.evaluate(() => typeof (window as any).apex?.item === 'function'),
  ).toBe(true);
});

test('gotoApexPageAuto() throws a specific, actionable error instead of attempting a bare goto to Basic Editing', async ({
  page,
}) => {
  const safety = assessNavigationSafety({ pageAccessProtection: 'argumentsMustHaveChecksum', isPublic: false });
  await expect(gotoApexPageAuto(page, `${BASE}/basic-editing`, safety)).rejects.toThrow(/NOT safe/);
  // Confirm the page truly never navigated away from wherever it was
  // (the error must be thrown BEFORE any goto is attempted).
  expect(page.url()).not.toContain('/basic-editing');
});
