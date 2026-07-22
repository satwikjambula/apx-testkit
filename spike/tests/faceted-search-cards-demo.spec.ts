/**
 * Live proof of the Cards/Faceted-Search testkit wrappers
 * (packages/testkit/src/components/{cards,faceted-search}.ts) against the
 * real running app. Region ids below were read directly off the live DOM
 * (not assumed from the .apx identifier -- see region.ts module doc on why
 * that mapping is still an open item) via ancestor-walk to the nearest
 * `.js-apex-region` element, same technique used to discover the
 * Interactive Report region id.
 */
import { apexPageUrl, ApexCardsRegion, ApexFacetsRegion, expect, gotoApexPage, test } from '@apx/testkit';
import { APP_BASE } from '../playwright.config.js';

const PAGE_ALIAS = 'faceted-search-cards';
const CARDS_REGION_ID = 'R14614559648487636';
const FACETS_REGION_ID = 'R14614638417487636';

const pageUrl = () => apexPageUrl(APP_BASE, PAGE_ALIAS);

test.describe('faceted-search-cards (Cards + Facets testkit wrappers)', () => {
  test('facets report a real total resource count (event-based wait, not polling)', async ({ page }) => {
    await gotoApexPage(page, pageUrl());
    const facets = new ApexFacetsRegion(page, FACETS_REGION_ID);
    // fetchCountsAndWait() waits for the real apexafterrefresh event APEX
    // fires on this region when the count fetch completes -- deterministic,
    // not a poll or a fixed waitForTimeout. See faceted-search.ts and
    // fixtures/lifecycle.ts.
    await facets.fetchCountsAndWait();
    const total = await facets.getTotalResourceCount();
    expect(total).toBeGreaterThan(0);
  });

  test('cards region reports pagination info matching its page size', async ({ page }) => {
    await gotoApexPage(page, pageUrl());
    const cards = new ApexCardsRegion(page, CARDS_REGION_ID);
    const info = await cards.getPageInfo();
    expect(info.pageSize).toBeGreaterThan(0);
    expect(info.lastOffset).toBeGreaterThanOrEqual(info.firstOffset);
  });

  test('getRecords() is confirmed broken in this app, not silently empty', async ({ page }) => {
    await gotoApexPage(page, pageUrl());
    const cards = new ApexCardsRegion(page, CARDS_REGION_ID);
    // Documented in cards.ts: throws even after an awaited refresh(). This
    // test exists so a future APEX/app fix is NOTICED (test starts failing
    // here, prompting the doc comment + this test to be updated) rather
    // than the breakage being silently masked.
    await expect(cards.getRecords()).rejects.toThrow(/reading 'each'/);
  });

  test('calling an unsupported method throws instead of failing silently', async ({ page }) => {
    await gotoApexPage(page, pageUrl());
    const cards = new ApexCardsRegion(page, CARDS_REGION_ID);
    // Cards does not implement getViewName (confirmed live -- see region.ts) --
    // this must throw a clear error, not resolve to undefined.
    await expect(cards.getViewName()).rejects.toThrow(/not a function on this widget type/);
  });
});
