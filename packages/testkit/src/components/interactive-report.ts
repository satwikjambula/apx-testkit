/**
 * Interactive Report UI-locator-driven interaction wrapper -- VERIFIED
 * live against Oracle's own UX Pattern Catalog (`browse-interactive-report`
 * page, the only live `interactiveReport` region this project has access
 * to). This is a DELIBERATELY DIFFERENT path from the already-closed
 * question in `docs/quirks/26.1.json` (`interactive-report-private-methods`):
 * that entry confirms Interactive Report's JS WIDGET API
 * (`apex.region(id).widget()`) exposes only private, `_`-prefixed
 * internals for search/sort/pagination -- unchanged, not re-litigated
 * here. This file drives the same features through the VISIBLE UI instead,
 * via Playwright accessible-role locators, the same discipline
 * `button.ts`/`report-column.ts` already use -- no JS API call anywhere in
 * this file.
 *
 * SEARCH -- CONFIRMED WORKING, with a real semantic quirk to know about:
 * the search box (`getByRole('searchbox', { name: 'Row Search' })` --
 * confirmed live, this exact accessible name/role is APEX's own
 * hard-coded `aria-label`, not derived from anything app-specific) accepts
 * text, and pressing Enter DOES fire a real `QUICK_FILTER` AJAX action
 * (confirmed via `page.waitForResponse` + a real `apexbeforerefresh`/
 * `apexafterrefresh` event pair on the region's own DOM element -- the
 * SAME lifecycle event `fixtures/lifecycle.ts` already established for
 * Facets, reused here via `waitForRegionEvent`). The confirmed SEMANTIC
 * quirk: an UNQUOTED multi-word search term is matched as "any word"
 * (OR) across default search columns -- confirmed live: `Item 2`
 * (unquoted) matched all 48 rows, because "Item" alone appears in every
 * row's title. A QUOTED exact-phrase term (`"Item 2"`) correctly narrows
 * to just the matching rows (confirmed live: 11 rows -- Item 2, Item
 * 20-29). This is standard APEX Row Search behavior, not a testkit
 * limitation -- `searchInteractiveReport()` does NOT auto-quote for you
 * (a caller wanting exact-phrase matching must pass the quotes
 * themselves), so this surprising-by-default OR semantics is documented
 * here rather than silently masked.
 *
 * SORT -- CONFIRMED WORKING (aria-sort, a real standard ARIA attribute),
 * with a real, reproducible DOM-overlap quirk that changes how you must
 * click: clicking a column header's sort-trigger link fails Playwright's
 * default actionability check EVERY TIME (confirmed on 3 independent
 * columns -- Title, Category, Priority -- 100% reproduction), because
 * APEX's OWN `stickyTableHeader` widget renders a visual clone of the
 * header row, absolutely positioned with a higher z-index, overlapping
 * the real header at the SAME screen coordinates from the moment the page
 * loads (confirmed via `getBoundingClientRect()` -- no scrolling needed to
 * reproduce). The clone forwards clicks to the same underlying handler
 * (confirmed: force-clicking the clone directly opens the identical sort
 * menu) but is NOT part of the accessible tree (not reachable via
 * `getByRole`) -- meaning the REAL, accessible header link is the correct
 * thing to target, it just needs `{ force: true }` to bypass Playwright's
 * (correct, in general) overlap protection. This is documented, not
 * silently defaulted -- `sortReportColumn()` below always force-clicks and
 * says why in this comment, rather than leaving a future reader to
 * rediscover the same investigation.
 *
 * PAGINATION -- PARTIALLY CONFIRMED, genuinely incomplete: a real,
 * accessible `region` (`getByRole('region', { name: 'Pagination' })`,
 * confirmed live) exists with a range label (`"1 - 48"`), but this
 * project's only live IR instance has just 48 rows, all fitting on one
 * page -- the actual next/prev controls render `aria-hidden="true"` and
 * disabled in this state, so clicking through to a second page has NOT
 * been observed live. No pagination click wrapper is shipped here as a
 * result (ADR-002: a capability isn't wrapped on the strength of a
 * plausible-looking but unexercised DOM node) -- this is recorded as an
 * open gap, not silently skipped; see docs/ecosystem-roadmap.md.
 */
import { type Locator, type Page } from '@playwright/test';
import { waitForRegionEvent } from '../fixtures/lifecycle.js';
import { reportColumnHeader } from './report-column.js';

/**
 * The Row Search box for a given Interactive Report region. `regionId`
 * must be the region's REAL runtime region id (ADR-003 layered
 * resolution: `region.htmlDomId ?? region.identifier`) -- the accessible
 * name `Row Search` is APEX's own fixed `aria-label`, identical across
 * every Interactive Report region, so if a page ever has more than one IR
 * this locator MUST be scoped to the specific region's container to avoid
 * ambiguity (that scoping is what `regionId` is for here).
 */
export function interactiveReportSearchBox(page: Page, regionId: string): Locator {
  return page.locator(`#${regionId}`).getByRole('searchbox', { name: 'Row Search' });
}

/**
 * Fill the Row Search box and submit via Enter, waiting for the region's
 * real `apexafterrefresh` event (not a fixed timeout) before resolving --
 * confirmed live to fire for a genuine `QUICK_FILTER` search round-trip,
 * the same event/wait pattern `fixtures/lifecycle.ts` already established.
 *
 * READ THE MODULE DOC before relying on exact-match semantics: an
 * unquoted multi-word `term` matches ANY word (OR), not the whole phrase
 * -- pass a quoted term (`'"exact phrase"'`) if you need phrase matching,
 * confirmed live to work correctly.
 */
export async function searchInteractiveReport(
  page: Page,
  regionId: string,
  term: string,
  timeoutMs = 10_000,
): Promise<void> {
  const box = interactiveReportSearchBox(page, regionId);
  await box.click();
  await box.fill(term);
  const eventPromise = waitForRegionEvent(page, regionId, 'apexafterrefresh', timeoutMs);
  await box.press('Enter');
  await eventPromise;
}

/**
 * Read a column header's current sort state via the standard `aria-sort`
 * attribute -- confirmed live to be a real, reliable signal (`ascending`/
 * `descending`), not testkit-invented. `null` when the column is unsorted
 * (the attribute is absent, confirmed the default state).
 */
export async function getColumnSortState(page: Page, heading: string): Promise<'ascending' | 'descending' | null> {
  const value = await reportColumnHeader(page, heading).getAttribute('aria-sort');
  return value === 'ascending' || value === 'descending' ? value : null;
}

/**
 * Open a column's sort menu and choose Sort Ascending/Descending, waiting
 * for the region's `apexafterrefresh` event before resolving. ALWAYS
 * force-clicks the header link -- see the module doc for the confirmed,
 * reproducible `stickyTableHeader` overlap this works around; a plain
 * (non-forced) click has been confirmed to reliably time out instead.
 */
export async function sortReportColumn(
  page: Page,
  regionId: string,
  heading: string,
  direction: 'ascending' | 'descending',
  timeoutMs = 10_000,
): Promise<void> {
  const header = reportColumnHeader(page, heading);
  const headerLink = header.getByRole('link', { name: heading, exact: true });
  await headerLink.click({ force: true });
  const menuButtonName = direction === 'ascending' ? 'Sort Ascending' : 'Sort Descending';
  const eventPromise = waitForRegionEvent(page, regionId, 'apexafterrefresh', timeoutMs);
  await page.getByRole('button', { name: menuButtonName }).click();
  await eventPromise;
}
