/**
 * Live proof of the Interactive Report UI-locator-driven testkit wrapper
 * (packages/testkit/src/components/interactive-report.ts) -- the Eighth
 * round "Interactive Report accessible-locator discovery" pass. No login
 * required; UX Pattern Catalog is publicly reachable.
 *
 * Region id below (`R11643575732369775`) was read directly off the live
 * DOM (`apex.region()`'s own container id, confirmed resolvable via
 * `apex.region('R11643575732369775')`), same technique already used for
 * the Cards/Facets region ids in faceted-search-cards-demo.spec.ts -- not
 * derivable from the .apx export (this region has no `advanced { htmlDomId
 * }` override; its export identifier is `interactive-report`, a different
 * string entirely -- see ADR-003 layer 3, `docs/quirks/26.1.json`
 * `region-id-not-static-id`).
 */
import { apexPageUrl, getColumnSortState, gotoApexPage, searchInteractiveReport, sortReportColumn, test } from '@apx/testkit';
import { expect } from '@playwright/test';
import { APP_BASE } from '../playwright.config.js';

const REGION_ID = 'R11643575732369775';
const pageUrl = () => apexPageUrl(APP_BASE, 'browse-interactive-report');

test.describe('interactive-report (search)', () => {
  test('unquoted multi-word search matches ANY word (OR), not the whole phrase', async ({ page }) => {
    await gotoApexPage(page, pageUrl());
    await searchInteractiveReport(page, REGION_ID, 'Item 2');
    // "Item" alone appears in every row's title -- confirmed real APEX
    // Row Search default semantics, not a testkit bug.
    const rowCount = await page.getByRole('heading', { name: /^Item \d+$/ }).count();
    expect(rowCount).toBeGreaterThan(20);
  });

  test('quoted exact-phrase search narrows to the matching rows', async ({ page }) => {
    await gotoApexPage(page, pageUrl());
    await searchInteractiveReport(page, REGION_ID, '"Item 2"');
    const headings = await page.getByRole('heading', { name: /^Item \d+$/ }).allTextContents();
    expect(headings).toContain('Item 2');
    // Item 2, Item 20-29 -- confirmed live: 11 total.
    expect(headings.length).toBe(11);
    expect(headings.every((h) => h === 'Item 2' || /^Item 2\d$/.test(h))).toBe(true);
  });
});

test.describe('interactive-report (sort)', () => {
  test('sorting Ascending/Descending updates aria-sort, confirmed live', async ({ page }) => {
    await gotoApexPage(page, pageUrl());
    expect(await getColumnSortState(page, 'Priority')).toBeNull();

    await sortReportColumn(page, REGION_ID, 'Priority', 'ascending');
    expect(await getColumnSortState(page, 'Priority')).toBe('ascending');

    await sortReportColumn(page, REGION_ID, 'Priority', 'descending');
    expect(await getColumnSortState(page, 'Priority')).toBe('descending');
  });

  test('sort works on more than one column (Title, Category) -- not a one-off', async ({ page }) => {
    await gotoApexPage(page, pageUrl());
    await sortReportColumn(page, REGION_ID, 'Category', 'ascending');
    expect(await getColumnSortState(page, 'Category')).toBe('ascending');

    await sortReportColumn(page, REGION_ID, 'Title', 'descending');
    expect(await getColumnSortState(page, 'Title')).toBe('descending');
  });
});
