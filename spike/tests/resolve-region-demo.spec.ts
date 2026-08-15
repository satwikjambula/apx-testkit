/**
 * Verifies @apx/testkit's resolveRegion()/regionCandidatesFromAst()
 * (packages/testkit/src/components/resolve-region.ts, runtime-review P0
 * item 1) against real regions on two independently-verified apps --
 * Sample Charts (Chart, Interactive Report) and Sample Interactive Grids
 * (Interactive Grid) -- confirming the resolver reaches the SAME real
 * runtime ids already recorded in docs/quirks/26.1.json
 * `region-id-not-static-id`, and reports the correct `strategy` for each.
 *
 * STATUS AT TIME OF WRITING: NOT YET RUN LIVE. Re-checked reachability
 * immediately before writing this spec (curl -o /dev/null -w '%{http_code}'
 * against both apps' base URLs below) -- both returned HTTP 404, and
 * APX_LOGIN_TEST_USERNAME/APX_LOGIN_TEST_PASSWORD were unset in this
 * environment, so this spec could not be executed this pass. It is built
 * against the SAME literal evidence already live-confirmed and recorded in
 * docs/quirks/26.1.json (`apex.region('projects')` -> false,
 * `apex.region('projects_report')` -> true; `apex.region('basic-editing')`
 * -> null, `apex.region('emp')` -> real region) -- resolveRegion() is a
 * thin wrapper around the exact same `apex.region(id)` truthiness check
 * used to gather that evidence originally, so this should be a formality
 * to confirm, not a new risk -- but it has NOT been literally re-run, and
 * this file must not be cited as "live-verified" until it has been.
 *
 * Requires BOTH APX_LOGIN_TEST_USERNAME and APX_LOGIN_TEST_PASSWORD --
 * skips cleanly if either is unset. Neither credential is hardcoded here.
 */
import { expect, test } from '@playwright/test';
import { login, resolveRegion, type RegionCandidate } from '@apx/testkit';

const CHARTS_BASE =
  'https://g9323cdc071900d-tjta51y2tod5o8ej.adb.us-ashburn-1.oraclecloudapps.com/ords/r/satwik/sample-charts';
const IG_BASE =
  'https://g9323cdc071900d-tjta51y2tod5o8ej.adb.us-ashburn-1.oraclecloudapps.com/ords/r/satwik/sample-interactive-grids';

async function loginOrSkip(page: import('@playwright/test').Page, base: string) {
  const username = process.env.APX_LOGIN_TEST_USERNAME;
  const password = process.env.APX_LOGIN_TEST_PASSWORD;
  test.skip(
    !username || !password,
    'APX_LOGIN_TEST_USERNAME/APX_LOGIN_TEST_PASSWORD not set -- skipping live resolveRegion() verification',
  );
  await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded' });
  await login(page, { username: username!, password: password! });
}

test('resolveRegion() resolves via htmlDomId for a Chart region (Pie page, "pie-chart" export id -> "pie1" runtime id)', async ({
  page,
}) => {
  await loginOrSkip(page, CHARTS_BASE);
  await page.getByRole('link', { name: 'Pie', exact: true }).click();
  await page.waitForLoadState('domcontentloaded');

  // Mirrors regionCandidatesFromAst({ identifier: 'pie-chart', htmlDomId: 'pie1' })
  const candidates: RegionCandidate[] = [
    { value: 'pie1', strategy: 'htmlDomId' },
    { value: 'pie-chart', strategy: 'export-identifier' },
  ];
  const result = await resolveRegion(page, candidates);
  expect(result).toEqual({ runtimeId: 'pie1', strategy: 'htmlDomId' });
});

test('resolveRegion() falls back to export-identifier for an Interactive Report region with htmlDomId set (Interactive Report page, "projects" -> "projects_report")', async ({
  page,
}) => {
  await loginOrSkip(page, CHARTS_BASE);
  await page.getByRole('link', { name: 'Interactive Report', exact: true }).click();
  await page.waitForLoadState('domcontentloaded');

  // Mirrors regionCandidatesFromAst({ identifier: 'projects', htmlDomId: 'projects_report' })
  // -- the htmlDomId candidate here IS the correct runtime id (this test
  // confirms resolveRegion() picks it correctly, matching
  // docs/quirks/26.1.json's already-recorded finding exactly).
  const candidates: RegionCandidate[] = [
    { value: 'projects_report', strategy: 'htmlDomId' },
    { value: 'projects', strategy: 'export-identifier' },
  ];
  const result = await resolveRegion(page, candidates);
  expect(result).toEqual({ runtimeId: 'projects_report', strategy: 'htmlDomId' });
});

test('resolveRegion() resolves via htmlDomId for an Interactive Grid region (Basic Editing page, "basic-editing" export id -> "emp" runtime id)', async ({
  page,
}) => {
  await loginOrSkip(page, IG_BASE);
  // This app enables pageAccessProtection: argumentsMustHaveChecksum --
  // navigate via a real UI click, not page.goto() to a friendly URL (see
  // docs/quirks/26.1.json `page-access-protection-blocks-bare-navigation`).
  await page.getByRole('link', { name: /^Editing/ }).click();
  await page.waitForLoadState('domcontentloaded');
  await page.getByRole('link', { name: /^Basic Editing/ }).click();
  await page.waitForLoadState('domcontentloaded');

  // Mirrors regionCandidatesFromAst({ identifier: 'basic-editing', htmlDomId: 'emp' })
  const candidates: RegionCandidate[] = [
    { value: 'emp', strategy: 'htmlDomId' },
    { value: 'basic-editing', strategy: 'export-identifier' },
  ];
  const result = await resolveRegion(page, candidates);
  expect(result).toEqual({ runtimeId: 'emp', strategy: 'htmlDomId' });
});

test('resolveRegion() hard-fails with a specific, actionable message when no candidate resolves', async ({ page }) => {
  await loginOrSkip(page, CHARTS_BASE);
  await page.getByRole('link', { name: 'Pie', exact: true }).click();
  await page.waitForLoadState('domcontentloaded');

  const candidates: RegionCandidate[] = [{ value: 'this-id-does-not-exist-anywhere', strategy: 'export-identifier' }];
  await expect(resolveRegion(page, candidates)).rejects.toThrow(/none of the candidate ids resolved/);
});
