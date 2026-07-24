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

test('auto-generated Chart type-check pattern, exactly as @apx/testgen emits it (Pie page, both chart regions)', async ({ page }) => {
  await page.getByRole('link', { name: 'Pie', exact: true }).click();
  await page.waitForLoadState('domcontentloaded');

  // Exactly what examples/verified-apps/sample-charts/generated/
  // p00004-pie.spec.ts's auto-generated Chart test does: resolve each
  // wired region's htmlDomId, wait for ojChart readiness, confirm the
  // live type is a real, non-empty string -- NOT an exact-match assertion
  // against the declared chartSettings.type (see below for why).
  const charts: Array<[string, string]> = [
    ['donut1', 'donut'],
    ['pie1', 'pie'],
  ];
  for (const [id] of charts) {
    await page.waitForFunction((regionId) => {
      const region = (window as any).apex?.region?.(regionId);
      return typeof region?.widget?.()?.ojChart === 'function';
    }, id);
    const chart = new ApexChartRegion(page, id);
    const liveType = await chart.getOption('type');
    expect(typeof liveType).toBe('string');
    expect(liveType).not.toBe('');
  }
});

test('CORRECTION: declared chart type does NOT always equal the live JET type (donut declares "donut", reports "pie")', async ({ page }) => {
  await page.getByRole('link', { name: 'Pie', exact: true }).click();
  await page.waitForLoadState('domcontentloaded');

  // Real, confirmed finding: this region's .apx export declares
  // `chart { type: donut }`, but JET has no separate "donut" widget type
  // -- APEX's donut is JET's "pie" type plus
  // styleDefaults.pieInnerRadius (confirmed present and nonzero below).
  // This is why the auto-generated Chart assertion (above) checks for a
  // non-empty type string, not equality against the declared value --
  // asserting equality here would have been a real, live-contradicted
  // assumption, not a safe generalization. See docs/quirks/26.1.json
  // `chart-declared-type-not-runtime-type`.
  await page.waitForFunction(() => {
    const region = (window as any).apex?.region?.('donut1');
    return typeof region?.widget?.()?.ojChart === 'function';
  });
  const donut = new ApexChartRegion(page, 'donut1');
  expect(await donut.getOption('type')).toBe('pie');
  const fullConfig = (await donut.getOption()) as Record<string, unknown>;
  const styleDefaults = fullConfig.styleDefaults as Record<string, unknown> | undefined;
  expect(styleDefaults?.pieInnerRadius).toBeTruthy();

  // Separately confirmed: NOT every declared type is aliased -- 'pie' and
  // 'area' both report their declared type verbatim.
  await page.waitForFunction(() => {
    const region = (window as any).apex?.region?.('pie1');
    return typeof region?.widget?.()?.ojChart === 'function';
  });
  const pie = new ApexChartRegion(page, 'pie1');
  expect(await pie.getOption('type')).toBe('pie');
});
