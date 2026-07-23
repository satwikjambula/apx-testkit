/**
 * Verifies @apx/testkit's ApexInteractiveGridRegion against a real IG
 * region -- third, independent APEX 26.1 app: Oracle's own "Sample
 * Interactive Grids" gallery app (Basic Editing page, DOM static id
 * "emp" -- NOT the .apx export's region identifier "basic-editing"; see
 * docs/quirks/26.1.json "region-id-not-static-id" and the module doc on
 * ApexInteractiveGridRegion for why those two differ here).
 *
 * This app enables `pageAccessProtection: argumentsMustHaveChecksum` on its
 * pages, so a bare `page.goto()` to a friendly URL bounces back to /login
 * even with a valid authenticated session -- navigation here goes through
 * real in-app link clicks (home -> Editing card -> Basic Editing card),
 * the same way a real user would reach this page.
 *
 * Requires BOTH APX_LOGIN_TEST_USERNAME and APX_LOGIN_TEST_PASSWORD --
 * skips cleanly if either is unset. Neither credential is hardcoded here.
 */
import { expect, test } from '@playwright/test';
import { ApexInteractiveGridRegion, login } from '@apx/testkit';

const BASE =
  'https://g9323cdc071900d-tjta51y2tod5o8ej.adb.us-ashburn-1.oraclecloudapps.com/ords/r/satwik/sample-interactive-grids';

test('ApexInteractiveGridRegion against a real Interactive Grid (Basic Editing)', async ({ page }) => {
  const username = process.env.APX_LOGIN_TEST_USERNAME;
  const password = process.env.APX_LOGIN_TEST_PASSWORD;
  test.skip(
    !username || !password,
    'APX_LOGIN_TEST_USERNAME/APX_LOGIN_TEST_PASSWORD not set -- skipping live Interactive Grid verification',
  );

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await login(page, { username: username!, password: password! });

  // pageAccessProtection: argumentsMustHaveChecksum -- must navigate via
  // real link clicks, not page.goto(), to reach a protected page.
  await page.getByRole('link', { name: /^Editing/ }).click();
  await page.waitForLoadState('domcontentloaded');
  await page.getByRole('link', { name: /^Basic Editing/ }).click();
  await page.waitForLoadState('domcontentloaded');
  expect(page.url()).toContain('/basic-editing');
  expect(await page.title()).toBe('Basic Editing');

  const ig = new ApexInteractiveGridRegion(page, 'emp');

  const actions = await ig.getActions();
  expect(typeof actions).toBe('object');
  expect(Object.keys(actions)).toEqual(expect.arrayContaining(['add', 'remove', 'invoke', 'list']));

  const views = await ig.getViews();
  expect(views).toHaveProperty('grid');

  const currentViewId = await ig.getCurrentViewId();
  expect(typeof currentViewId).toBe('string');

  const currentView = await ig.getCurrentView();
  expect(typeof currentView).toBe('object');

  // Should not throw even with no rows selected.
  await ig.getSelectedRecords();
});
