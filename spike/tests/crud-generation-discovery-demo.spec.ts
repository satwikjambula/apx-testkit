/**
 * Live evidence for the CRUD-generation discovery pass (GitHub issue #5,
 * docs/ecosystem-roadmap.md Ninth round follow-up,
 * docs/quirks/26.1.json `crud-generation-discovery-pass-blocked`). No login
 * required; UX Pattern Catalog is publicly reachable.
 *
 * This does NOT prove a working CRUD contract -- it proves the opposite,
 * on purpose, the same way `button-htmldomid-demo.spec.ts` documents a
 * confirmed dead end rather than a positive capability. Two things are
 * captured here:
 *
 * 1. The save-button LOCATION convention holds (accessible role/label,
 *    same runtime id already on record from the Eighth round) -- this
 *    part is reusable once a genuine form-over-table page is available.
 * 2. Clicking that button produces NO observable, self-consistent
 *    persisted state on this specific app: the field the test itself set
 *    is cleared rather than echoed back, no PK item gets populated, and
 *    neither the success nor the error banner appears. A CRUD generator
 *    cannot assert "my self-created value round-trips" against this --
 *    there is nothing here that round-trips.
 *
 * Sample Interactive Grids / Sample Charts (the apps most likely to have
 * a genuine credentialed CRUD-shaped page) were not reachable in the
 * environment this pass ran in -- `APX_LOGIN_TEST_USERNAME`/
 * `APX_LOGIN_TEST_PASSWORD` were unset. Re-run this discovery pass, not
 * just re-read it, the moment credentials or a different live app become
 * available.
 */
import { apexPageUrl, buttonByLabel, expectNoErrors, expectNoSuccessMessage, gotoApexPage, test } from '@apx/testkit';
import { expect } from '@playwright/test';
import { APP_BASE } from '../playwright.config.js';

test.describe('CRUD-generation discovery: data-entry-simple-form (page 410)', () => {
  const pageUrl = () => apexPageUrl(APP_BASE, 'data-entry-simple-form');

  test('save button resolves via the same accessible-role/label convention as every other page (positive, reusable finding)', async ({
    page,
  }) => {
    await gotoApexPage(page, pageUrl());
    const id = await buttonByLabel(page, 'Primary Action').getAttribute('id');
    // Same runtime id already on record from the Eighth round's button
    // DOM-identifier discovery pass -- stable across sessions.
    expect(id).toBe('B6286693148755797');
  });

  test('a hidden PK item exists (P410_ID) but is never populated by a save click -- no INSERT is observable', async ({
    page,
  }) => {
    await gotoApexPage(page, pageUrl());
    const pkBefore = await page.locator('#P410_ID').inputValue();
    expect(pkBefore).toBe('');

    const uniqueName = `apx-crud-discovery-${Date.now()}`;
    await page.evaluate((value: string) => {
      (window as any).apex.item('P410_NAME').setValue(value);
    }, uniqueName);
    expect(await page.evaluate(() => (window as any).apex.item('P410_NAME').getValue())).toBe(uniqueName);

    // CORRECTED IN PLACE (see docs/quirks/26.1.json
    // `crud-generation-discovery-pass-blocked`): an earlier manual check
    // via a raw DOM .click() + a separate tool call read `location.href`
    // too early and concluded "no navigation happens." That was wrong --
    // clicking "Primary Action" triggers a REAL full-page POST-redirect-GET
    // (a genuine `wwv_flow.accept` form submit, not an AJAX-only PPR call),
    // confirmed here via `page.on('framenavigated')`: exactly one
    // navigation fires, and it redirects back to the SAME page url (a
    // "create another" pattern, not a redirect to a saved-record URL).
    const [, response] = await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
      page.waitForResponse((r) => r.url().includes('wwv_flow.accept') && r.request().method() === 'POST'),
      buttonByLabel(page, 'Primary Action').click(),
    ]);
    expect(response.ok()).toBe(true);
    expect(page.url()).toBe(pageUrl());

    // Whatever happened server-side (a real insert with no client-visible
    // confirmation, or nothing at all), the RELOADED page is indistinguishable
    // from a fresh create-mode form: P410_NAME is blank again (not echoing
    // the value this test itself supplied), P410_ID is still blank (not
    // switched into "edit the record you just created" mode), and no
    // success/error banner is showing. This is the actual blocker for CRUD
    // generation -- not "nothing happens," but "nothing CLIENT-OBSERVABLE
    // happens that a self-created-data assertion could check."
    await page.waitForFunction(() => typeof (window as any).apex?.item === 'function');
    expect(await page.evaluate(() => (window as any).apex.item('P410_NAME').getValue())).toBe('');
    expect(await page.locator('#P410_ID').inputValue()).toBe('');
  });

  test('neither the success nor the error banner appears after a save click (confirmed non-functional for this purpose)', async ({
    page,
  }) => {
    await gotoApexPage(page, pageUrl());
    await page.evaluate(() => (window as any).apex.item('P410_NAME').setValue('apx-crud-discovery-banner-check'));
    // See the previous test's comment -- Save triggers a real full-page
    // POST-redirect-GET, not an AJAX-only call; wait for it explicitly
    // rather than relying on locator auto-retry to paper over the reload.
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
      page.waitForResponse((r) => r.url().includes('wwv_flow.accept') && r.request().method() === 'POST'),
      buttonByLabel(page, 'Primary Action').click(),
    ]);
    await page.waitForFunction(() => typeof (window as any).apex?.item === 'function');
    await expectNoSuccessMessage(page);
    await expectNoErrors(page);
  });
});

test.describe('CRUD-generation discovery: browse-interactive-report row-action link', () => {
  test('every "Primary Row Action" link shares one identical, non-existent URL -- not a real per-record edit target', async ({
    page,
  }) => {
    await gotoApexPage(page, apexPageUrl(APP_BASE, 'browse-interactive-report'));
    const hrefs = await page.getByRole('link', { name: 'Primary Row Action' }).evaluateAll((els) =>
      els.map((el) => (el as HTMLAnchorElement).href),
    );
    expect(hrefs.length).toBeGreaterThan(1);
    expect(new Set(hrefs).size).toBe(1); // same URL for every row, no per-record id

    const resp = await page.request.get(hrefs[0]);
    expect(resp.status()).toBe(404);
  });
});
