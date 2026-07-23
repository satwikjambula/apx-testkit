/**
 * Verifies the generic ApexRegion class against a real Chart region --
 * fourth real APEX 26.1 app: Oracle's own "Sample Charts" gallery app
 * (Area page, DOM static id "area1" -- NOT the .apx export's region
 * identifier "area-chart-color-javascript-code-customization"; a second,
 * independent confirmation of the region-id-not-static-id pattern first
 * found on Interactive Grid -- see docs/quirks/26.1.json).
 *
 * Unlike Interactive Grid, Chart regions do NOT expose a jQuery widget
 * instance via apex.region(id).widget() (confirmed: returns null). The
 * real jQuery UI widget-factory plugin is "ojChart" (Oracle JET), attached
 * directly to the JET container element (id convention: `<static id>_jet`),
 * not reachable through region.widget(). Two of its methods are confirmed
 * live: `refresh` (callable, no error) and `getContextByNode` (callable,
 * returns null with no arguments). `getProperty`/`getOption` are confirmed
 * NOT valid method names on this widget ("no such method" errors). None of
 * that is exposed as a dedicated component here -- the one thing confirmed
 * useful enough to verify is that the EXISTING generic ApexRegion class
 * already works for `refresh()` against a chart region, using the real
 * static id. See docs/quirks/26.1.json for the full ojChart investigation.
 *
 * This app enables the same `pageAccessProtection: argumentsMustHaveChecksum`
 * pattern as Sample Interactive Grids -- navigate via real UI clicks.
 *
 * Requires BOTH APX_LOGIN_TEST_USERNAME and APX_LOGIN_TEST_PASSWORD --
 * skips cleanly if either is unset. Neither credential is hardcoded here.
 */
import { expect, test } from '@playwright/test';
import { ApexRegion, login } from '@apx/testkit';

const BASE =
  'https://g9323cdc071900d-tjta51y2tod5o8ej.adb.us-ashburn-1.oraclecloudapps.com/ords/r/satwik/sample-charts';

test('ApexRegion.refresh() against a real Chart region (Area page)', async ({ page }) => {
  const username = process.env.APX_LOGIN_TEST_USERNAME;
  const password = process.env.APX_LOGIN_TEST_PASSWORD;
  test.skip(
    !username || !password,
    'APX_LOGIN_TEST_USERNAME/APX_LOGIN_TEST_PASSWORD not set -- skipping live Chart verification',
  );

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await login(page, { username: username!, password: password! });

  // pageAccessProtection: argumentsMustHaveChecksum -- navigate via a real
  // link click, not page.goto().
  await page.getByRole('link', { name: 'Area', exact: true }).click();
  await page.waitForLoadState('domcontentloaded');
  expect(page.url()).toContain('/area');
  expect(await page.title()).toBe('Area');

  // Real runtime static id ("area1"), NOT the .apx export identifier
  // ("area-chart-color-javascript-code-customization") -- discovered by
  // inspecting the live DOM for the `<static id>_jet` widget container.
  const chart = new ApexRegion(page, 'area1');
  await chart.refresh();
});
