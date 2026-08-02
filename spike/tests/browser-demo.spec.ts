/**
 * DEMO-ONLY spec -- exists purely to produce a real, video-recorded run of
 * apx-testkit-generated-style assertions driving Playwright against a
 * live Oracle APEX app, for docs/browser-demo.gif (README "30-second
 * overview"). This is NOT new test coverage and asserts no new
 * capability: every ASSERTION here is the exact same testkit call,
 * against the exact same live region, already verified in
 * `interactive-report-demo.spec.ts` (search + sort against the UX
 * Pattern Catalog's `browse-interactive-report` page, region id
 * `R11643575732369775` -- see that file's header comment for how that
 * region id was confirmed, and `packages/testkit/src/components/
 * interactive-report.ts` for the underlying wrapper's own live-evidence
 * comments).
 *
 * Two things are added purely for recording pacing/visibility, neither of
 * which is a new functional claim:
 *  1. Steps are chained in one continuous flow (no page reload between
 *     them) instead of `interactive-report-demo.spec.ts`'s separate,
 *     independent tests, so a single recording tells one coherent visual
 *     story: navigate -> type a real search into a real search box ->
 *     watch real results narrow -> sort a real column and watch the
 *     order change.
 *  2. `typeSearchVisibly()` below submits the search through the exact
 *     same real search box and the exact same real Enter-triggered
 *     `QUICK_FILTER` AJAX round-trip as `searchInteractiveReport()` (both
 *     built from the SAME exported testkit primitives --
 *     `interactiveReportSearchBox` + `waitForRegionEvent`) -- it only
 *     types the characters one at a time (`pressSequentially`, with a
 *     delay) instead of `fill()`'s instant set, purely so the recording
 *     shows a human-readable typing action instead of text popping in
 *     over one frame. This is the same kind of pacing choice
 *     `docs/demo.tape` makes with VHS's `TypingSpeed 40ms` for the
 *     terminal recording -- not a different code path being exercised.
 *
 * No login required -- UX Pattern Catalog is publicly reachable.
 */
import {
  apexPageUrl,
  getColumnSortState,
  gotoApexPage,
  interactiveReportSearchBox,
  sortReportColumn,
  test,
  waitForRegionEvent,
} from '@apx/testkit';
import { type Page, expect } from '@playwright/test';
import { APP_BASE } from '../playwright.config.js';

const REGION_ID = 'R11643575732369775';
const pageUrl = () => apexPageUrl(APP_BASE, 'browse-interactive-report');

/** See module doc, point 2 -- same real search box + same real wait, typed visibly. */
async function typeSearchVisibly(page: Page, regionId: string, term: string): Promise<void> {
  const box = interactiveReportSearchBox(page, regionId);
  await box.click();
  const eventPromise = waitForRegionEvent(page, regionId, 'apexafterrefresh', 10_000);
  await box.pressSequentially(term, { delay: 90 });
  await box.press('Enter');
  await eventPromise;
}

test('browser demo: search narrows real rows, then sort reorders them', async ({ page }) => {
  await gotoApexPage(page, pageUrl());

  // Start state: the full, unfiltered set of rows is visible.
  const initialRows = await page.getByRole('heading', { name: /^Item \d+$/ }).count();
  expect(initialRows).toBeGreaterThan(20);
  await page.waitForTimeout(1200); // pacing only -- let the start state read on camera

  // Real search -- quoted exact-phrase narrows to the matching rows,
  // confirmed live in interactive-report-demo.spec.ts (11 rows: Item 2,
  // Item 20-29).
  await typeSearchVisibly(page, REGION_ID, '"Item 2"');
  const filteredHeadings = await page.getByRole('heading', { name: /^Item \d+$/ }).allTextContents();
  expect(filteredHeadings.length).toBe(11);
  expect(filteredHeadings).toContain('Item 2');
  await page.waitForTimeout(1200); // pacing only -- let the filtered result read on camera

  // Real sort -- ascending, then descending, confirmed live via the same
  // aria-sort signal in interactive-report-demo.spec.ts.
  expect(await getColumnSortState(page, 'Priority')).toBeNull();
  await sortReportColumn(page, REGION_ID, 'Priority', 'ascending');
  expect(await getColumnSortState(page, 'Priority')).toBe('ascending');
  await page.waitForTimeout(900); // pacing only
  await sortReportColumn(page, REGION_ID, 'Priority', 'descending');
  expect(await getColumnSortState(page, 'Priority')).toBe('descending');
  await page.waitForTimeout(1200); // pacing only -- let the final sorted state read on camera
});
