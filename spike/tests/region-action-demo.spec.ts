/**
 * Live proof of the region-action testkit wrapper
 * (packages/testkit/src/components/region-action.ts) -- the Eighth round
 * "Region action (Cards/List row-level action) live-discovery" pass. No
 * login required; UX Pattern Catalog is publicly reachable.
 *
 * Confirms BOTH the positive finding (presence, real accessible locator,
 * confirmed non-unique per region) AND the negative finding (click-through
 * effects are a confirmed dead end on this app -- see region-action.ts's
 * module doc). The negative-finding tests exist so a future fix to this
 * app (or a different, functionally-wired app) is NOTICED (these start
 * failing) rather than silently assumed unchanged forever.
 */
import { apexPageUrl, expectRegionActionPresent, gotoApexPage, regionActionCount, regionActionLocator, test } from '@apx/testkit';
import { expect } from '@playwright/test';
import { APP_BASE } from '../playwright.config.js';

test.describe('region-action (Cards)', () => {
  const pageUrl = () => apexPageUrl(APP_BASE, 'faceted-search-cards');

  test('the "Edit" row action is present, once per rendered card -- not unique', async ({ page }) => {
    await gotoApexPage(page, pageUrl());
    await expectRegionActionPresent(page, 'Edit', 1);
    const count = await regionActionCount(page, 'Edit');
    expect(count).toBeGreaterThan(1);
  });

  test('CONFIRMED DEAD END: clicking "Edit" produces no observable effect on this app', async ({ page }) => {
    await gotoApexPage(page, pageUrl());
    const requests: string[] = [];
    page.on('request', (r) => requests.push(r.url()));
    const before = page.url();
    await regionActionLocator(page, 'Edit').first().click();
    await page.waitForTimeout(1000);
    expect(page.url()).toBe(before);
    expect(requests.filter((u) => u.includes('wwv_flow'))).toEqual([]);
  });
});
