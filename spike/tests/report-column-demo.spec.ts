/**
 * Live proof of the report-column testkit wrapper
 * (packages/testkit/src/components/report-column.ts) -- the Eighth round
 * "Column live-discovery" pass. No login required; UX Pattern Catalog is
 * publicly reachable.
 *
 * Covers BOTH confirmed DOM-id contracts (see report-column.ts's module
 * doc for the full evidence):
 * - classicReport (`item-detail-full` page, `child-records` region): the
 *   `<th>` id equals the `.apx` column's identifier, verbatim.
 * - interactiveReport (`browse-interactive-report` page): the `<th>` id is
 *   an APEX-internal numeric id, NOT derivable from the export -- only the
 *   accessible-role locator (heading text) is usable.
 */
import {
  apexPageUrl,
  classicReportColumnById,
  expectReportColumnHeadersPresent,
  gotoApexPage,
  reportColumnHeader,
  test,
} from '@apx/testkit';
import { expect } from '@playwright/test';
import { APP_BASE } from '../playwright.config.js';

test.describe('report-column (classicReport)', () => {
  const pageUrl = () => apexPageUrl(APP_BASE, 'item-detail-full');

  test('declared classicReport column headings resolve as accessible columnheaders', async ({ page }) => {
    await gotoApexPage(page, pageUrl());
    // Confirmed live: CHILD_RECORD_NAME/CHILD_RECORD_TYPE/OWNER_NAME/
    // CHILD_RECORD_STATUS/DUE_DATE -> Name/Type/Owner/Status/Due headings.
    await expectReportColumnHeadersPresent(page, ['Name', 'Type', 'Owner', 'Status', 'Due']);
  });

  test('classicReport <th> DOM id equals the .apx column identifier verbatim', async ({ page }) => {
    await gotoApexPage(page, pageUrl());
    // Confirmed live: a raw `#CHILD_RECORD_NAME` locator hits a strict-mode
    // violation (APEX's stickyTableHeader clone duplicates the id) --
    // classicReportColumnById() scopes around that, see its doc comment.
    const th = classicReportColumnById(page, 'CHILD_RECORD_NAME');
    await expect(th).toHaveText(/Name/);
  });

  test('classicReport column headers carry no sort affordance (confirmed structural, not a gap)', async ({
    page,
  }) => {
    await gotoApexPage(page, pageUrl());
    const header = reportColumnHeader(page, 'Name');
    await expect(header.locator('a')).toHaveCount(0);
    expect(await header.getAttribute('aria-sort')).toBeNull();
  });
});

test.describe('report-column (interactiveReport)', () => {
  const pageUrl = () => apexPageUrl(APP_BASE, 'browse-interactive-report');

  test('declared interactiveReport column headings resolve as accessible columnheaders', async ({ page }) => {
    await gotoApexPage(page, pageUrl());
    await expectReportColumnHeadersPresent(page, ['Title', 'Category', 'Priority', 'Updated On']);
  });

  test('interactiveReport <th> DOM id is an internal numeric id, NOT the .apx column identifier', async ({
    page,
  }) => {
    await gotoApexPage(page, pageUrl());
    // The .apx export identifier for this column is TITLE -- confirmed live
    // that no element with that id exists; the real runtime id is opaque.
    await expect(page.locator('#TITLE')).toHaveCount(0);
    const header = reportColumnHeader(page, 'Title');
    const runtimeId = await header.getAttribute('id');
    expect(runtimeId).toMatch(/^C\d+$/);
  });
});
