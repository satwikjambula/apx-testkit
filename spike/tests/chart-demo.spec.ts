/**
 * Verifies ApexChartRegion (graduated from a stub -- see
 * packages/testkit/src/components/chart.ts) against real Chart regions --
 * Oracle's own "Sample Charts" gallery app.
 *
 * CORRECTION, for the record: this file previously claimed
 * `apex.region(id).widget()` returns `null` for chart regions, based on a
 * single region ("area1"). Re-tested live and found FALSE -- it returns a
 * real jQuery-wrapped element on every chart type tried. The real jQuery
 * UI widget-factory plugin is "ojChart" (Oracle JET), attached to the JET
 * container element (id convention: `<runtime static id>_jet`), reachable
 * THROUGH `region.widget()`, not around it. `getProperty`/`getOption`
 * remain confirmed NOT valid method names ("no such method" errors) --
 * the real method is the standard widget-factory `option` (getter AND
 * setter), which chart.ts wraps as `getOption()`/`setOption()`.
 *
 * Runtime static ids used below ("area1", "pie1") are NOT the .apx
 * export's region identifiers -- see `ApexRegion.htmlDomId`
 * (packages/parser/src/ast.ts) for the now-diagnosed root cause
 * (`advanced { htmlDomId: ... }` in the export, when present, predicts
 * `<htmlDomId>_jet`).
 *
 * This app enables `pageAccessProtection: argumentsMustHaveChecksum` --
 * navigate via real UI clicks, not page.goto() to a friendly URL.
 *
 * Requires BOTH APX_LOGIN_TEST_USERNAME and APX_LOGIN_TEST_PASSWORD --
 * skips cleanly if either is unset. Neither credential is hardcoded here.
 */
import { expect, test } from '@playwright/test';
import { ApexChartRegion, ApexRegion, expectButtonsPresent, login } from '@apx/testkit';

const BASE =
  'https://g9323cdc071900d-tjta51y2tod5o8ej.adb.us-ashburn-1.oraclecloudapps.com/ords/r/satwik/sample-charts';

test.beforeEach(async ({ page }) => {
  const username = process.env.APX_LOGIN_TEST_USERNAME;
  const password = process.env.APX_LOGIN_TEST_PASSWORD;
  test.skip(
    !username || !password,
    'APX_LOGIN_TEST_USERNAME/APX_LOGIN_TEST_PASSWORD not set -- skipping live Chart verification',
  );
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await login(page, { username: username!, password: password! });
});

test('ApexRegion.refresh() against a real Chart region (Area page)', async ({ page }) => {
  await page.getByRole('link', { name: 'Area', exact: true }).click();
  await page.waitForLoadState('domcontentloaded');
  expect(page.url()).toContain('/area');
  expect(await page.title()).toBe('Area');

  // Real runtime static id ("area1"), NOT the .apx export identifier
  // ("area-chart-color-javascript-code-customization") -- predicted by
  // that region's `advanced { htmlDomId: area1 }` override.
  const chart = new ApexRegion(page, 'area1');
  await chart.refresh();
});

test('expectButtonsPresent() against real, labeled .apx buttons (Area page)', async ({ page }) => {
  await page.getByRole('link', { name: 'Area', exact: true }).click();
  await page.waitForLoadState('domcontentloaded');

  // Real button labels declared in the Area page's export -- confirmed via
  // examples/verified-apps/sample-charts/generated/p00002-area.spec.ts,
  // exactly what @apx/testgen auto-emits for this page's labeled buttons.
  await expectButtonsPresent(page, [
    'Curved', 'Horizontal', 'None', 'Centered Segmented', 'Stack', 'Stepped',
    'Straight', 'Unstack', 'Vertical',
  ]);
});

test('ApexChartRegion.getOption()/setOption() against a real Chart region (Pie page)', async ({ page }) => {
  await page.getByRole('link', { name: 'Pie', exact: true }).click();
  await page.waitForLoadState('domcontentloaded');
  expect(page.url()).toContain('/pie');
  expect(await page.title()).toBe('Pie');

  // JET chart widgets finish initializing asynchronously, after
  // domcontentloaded -- wait for the actual precondition (ojChart
  // attached to the widget) rather than guessing a fixed delay.
  await page.waitForFunction(() => {
    const region = (window as any).apex?.region?.('pie1');
    return typeof region?.widget?.()?.ojChart === 'function';
  });

  const chart = new ApexChartRegion(page, 'pie1');

  const type = await chart.getOption('type');
  expect(type).toBe('pie');

  const fullConfig = await chart.getOption();
  expect(fullConfig).toHaveProperty('series');

  const before = await chart.getOption('selectionMode');
  await chart.setOption('selectionMode', 'multiple');
  const afterSet = await chart.getOption('selectionMode');
  expect(afterSet).toBe('multiple');
  // Restore, since this is a shared gallery app -- client-side only, but
  // leave it as found for the next run/person.
  await chart.setOption('selectionMode', before ?? 'single');
});
