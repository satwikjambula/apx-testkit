/**
 * Report column header wrapper -- VERIFIED live against TWO independently
 * typed real report region types on the same live app (UX Pattern
 * Catalog): `interactiveReport` (`browse-interactive-report` page) and
 * `classicReport` (`item-detail-full` page). This is genuinely new ground
 * truth: `column` (`ApexReportColumn`) was typed in the parser this
 * session with no runtime component at all -- this is that live-discovery
 * pass, per `.ai/checklists/runtime-api.md`.
 *
 * DISPATCH PATH: NOT `apex.region()` or a widget-factory call -- no such
 * API exists for report columns (a plain `<th>`/report-column-header DOM
 * node, not a JET/jQuery-UI widget). This wraps a Playwright ACCESSIBLE
 * ROLE locator instead, the same discipline `button.ts` already
 * established: `<th>` gets the standard implicit ARIA `columnheader` role
 * from plain HTML table semantics (confirmed live: `getByRole('columnheader',
 * { name: <heading text> })` resolves correctly on BOTH region types,
 * count exactly 1 per heading, no `role` ATTRIBUTE needed -- the browser's
 * own accessibility tree infers it), with the heading text as the
 * accessible name (`ApexReportColumn.heading`).
 *
 * TWO GENUINELY DIFFERENT DOM-ID CONTRACTS CONFIRMED, not one -- do not
 * conflate them:
 *
 * 1. `classicReport`: the `<th>`'s own `id` attribute is the `.apx`
 *    COLUMN'S `identifier`, VERBATIM -- confirmed live, all 5 columns of
 *    the `child-records` region on `item-detail-full`
 *    (`CHILD_RECORD_NAME`, `CHILD_RECORD_TYPE`, `OWNER_NAME`,
 *    `CHILD_RECORD_STATUS`, `DUE_DATE`), cross-checked directly against
 *    the real `.apx` export's `column CHILD_RECORD_NAME ( ... )` etc. This
 *    is a NEW, column-level extension of ADR-003's "export identifier can
 *    be a real, static, generator-usable DOM id" finding -- stronger than
 *    the region-level case, because it needs no `htmlDomId` override at
 *    all; the export identifier IS the DOM id, always, for every
 *    classicReport column checked. Use `classicReportColumnById()` below.
 *    Confirmed NOT sortable via header click -- classicReport headers are
 *    plain text with no wrapping `<a>`/button and no `aria-sort` (verified
 *    live: `child-records`' 5 headers all lack both), a real, structural
 *    difference from Interactive Report, not a gap in this wrapper.
 *
 * 2. `interactiveReport`: the `<th>`'s own `id` is an APEX-internal
 *    auto-generated numeric id (e.g. `C11643982695369779`) with NO
 *    corresponding field anywhere in the static `.apx` export -- confirmed
 *    live against `browse-interactive-report` (export column identifiers
 *    `TITLE`/`CATEGORY`/`PRIORITY`/etc., runtime ids
 *    `C11643982695369779`/`C11644187233369781`/`C11644419072369784`, no
 *    relationship). Genuinely undiscoverable from export data, the SAME
 *    "layer 3" class of finding ADR-003 already established for regions
 *    without `htmlDomId` -- do NOT attempt to construct an IR column's DOM
 *    id from `.apx` data. Use the accessible-role locator
 *    (`reportColumnHeader()`) instead, which does not need the id at all.
 *
 * Interactive Report's SORT capability (aria-sort, Sort Ascending/
 * Descending menu) is a further, IR-specific behavior -- see
 * `interactive-report.ts`, not duplicated here.
 */
import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Locate a report column header by its heading text, via the accessible
 * `columnheader` role. Works for classicReport AND interactiveReport alike
 * (confirmed live on both) -- does NOT resolve the column's DOM id, which
 * has two genuinely different, non-interchangeable conventions depending
 * on region type (see module doc).
 */
export function reportColumnHeader(page: Page, heading: string): Locator {
  return page.getByRole('columnheader', { name: heading, exact: true });
}

export interface ReportColumnPresence {
  heading: string;
  ok: boolean;
}

/**
 * Check that every declared column heading resolves to a real
 * `columnheader`-role element. Mirrors `buttonsPresent()`'s shape/intent
 * (button.ts) applied to report columns.
 */
export async function reportColumnHeadersPresent(
  page: Page,
  headings: readonly string[],
): Promise<ReportColumnPresence[]> {
  const out: ReportColumnPresence[] = [];
  for (const heading of headings) {
    const ok = (await reportColumnHeader(page, heading).count()) > 0;
    out.push({ heading, ok });
  }
  return out;
}

/** Assert every declared column heading resolves; fails with the list of missing headings. */
export async function expectReportColumnHeadersPresent(page: Page, headings: readonly string[]): Promise<void> {
  const presence = await reportColumnHeadersPresent(page, headings);
  const missing = presence.filter((p) => !p.ok).map((p) => p.heading);
  expect(missing, 'report columns declared in .apx but absent at runtime').toEqual([]);
}

/**
 * classicReport ONLY -- locate a column's own `<th>` by its `.apx` column
 * `identifier`, which IS the live DOM id verbatim (see module doc,
 * contract 1). Do NOT use this for `interactiveReport` columns -- their
 * runtime id is a different, undiscoverable-from-export-data scheme
 * (contract 2); calling this against an IR column's identifier (e.g.
 * `TITLE`) will simply fail to resolve, since no such DOM id exists on
 * that region type.
 *
 * REAL, CONFIRMED CAVEAT found while writing this pass's live spike spec
 * (not a guess, not fixed silently): classicReport ALSO renders a
 * `stickyTableHeader` clone (the SAME APEX widget already documented in
 * `interactive-report.ts`'s module doc for Interactive Report), and
 * unlike IR's clone, classicReport's clone re-uses the IDENTICAL `id`
 * attribute on its own `<th>` -- confirmed live (`item-detail-full`,
 * `#CHILD_RECORD_NAME` resolves to TWO elements: one inside
 * `table#report_table_..._orig` (the real table) and one inside
 * `table#report_table_...` without the `_orig` suffix (the sticky clone),
 * both reporting as visible). A plain `page.locator('#id')` hits
 * Playwright's strict-mode violation as a result. This function scopes to
 * the `_orig`-suffixed table specifically (confirmed live to resolve to
 * exactly one element, matching the real column) -- do not remove this
 * scoping under the assumption the duplicate id was a one-off; it was
 * reproduced deterministically on every column checked on this page.
 */
export function classicReportColumnById(page: Page, columnIdentifier: string): Locator {
  return page.locator(`table[id$="_orig"] #${columnIdentifier}`);
}
