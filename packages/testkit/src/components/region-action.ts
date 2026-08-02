/**
 * Region action (`ApexRegionAction` -- a row-level action/link nested
 * directly inside a Cards/List-family region, NOT a Dynamic Action)
 * wrapper -- live-discovery pass per `.ai/checklists/runtime-api.md`,
 * against Oracle's own UX Pattern Catalog (`faceted-search-cards` and
 * `faceted-search-content-row` pages, the two live regions this project
 * has for the Cards/List family).
 *
 * DISPATCH PATH: same discipline as `button.ts`/`report-column.ts` --
 * no `apex.region()`/widget-factory call exists for a Cards row action (a
 * plain rendered `<a>`/`<button>`, not a JET/jQuery-UI widget method).
 * This wraps an accessible-role locator.
 *
 * CONFIRMED, but with a real, load-bearing caveat this module's API
 * reflects rather than hides:
 *
 * 1. **Cards region (`action-d`)** -- a row action (e.g. `Edit`) renders
 *    as a real `<a>` with an accessible `link` role, name = the action's
 *    `label` -- confirmed live, `faceted-search-cards`, 24 matching `Edit`
 *    links (one per card). `regionActionLocator()` below wraps exactly
 *    this. IMPORTANT, confirmed live: the label is **NOT unique per
 *    region** the way a page-level Button's label typically is -- every
 *    row repeats the SAME action label, so `regionActionLocator(page,
 *    'Edit')` resolves to N elements, one per record, with **no** DOM
 *    attribute or accessible property tying a specific match back to a
 *    specific `.apx` record. This is a structural limitation, not a
 *    testkit gap -- there is no confirmed way to scope to "the Edit
 *    action for record X" from `.apx` metadata alone. Callers needing a
 *    specific row must scope further themselves (e.g. `.nth(i)`, or by
 *    finding an ancestor container that also holds an identifying text
 *    value) -- this module intentionally does not pretend to solve that.
 *
 * 2. **List/Content Row region (`action-e`)** -- CONFIRMED DIFFERENT, NOT
 *    wrapped here. `faceted-search-content-row`'s row actions are NOT
 *    rendered as direct same-labeled links/buttons the way Cards' are --
 *    each row instead has ONE `"Row Actions"` button (itself repeated,
 *    same non-uniqueness caveat as above) that opens a menu whose
 *    `menuitem`-role entries carry the actual action labels. This is a
 *    genuinely different, two-step DOM contract from Cards' direct
 *    rendering -- confirmed live, not assumed to generalize from Cards.
 *    Deliberately NOT wrapped in this pass (ADR-002: a second, structurally
 *    different contract needs its own verified design, not a forced reuse
 *    of `regionActionLocator()`) -- see docs/ecosystem-roadmap.md.
 *
 * 3. **Click-through EFFECTS are a CONFIRMED DEAD END on this specific live
 *    app**, not silently unverified: every row action tested -- Cards'
 *    `Edit` link, a Cards card-title link (`fullCard`-style action), and
 *    List's `Row Action 1`/`2`/`3` menu items -- has `href="#"` (or no
 *    href at all for the menu items) and produces ZERO observable effect
 *    on click: no URL change, no network request, no console activity,
 *    no dialog. This matches UX Pattern Catalog's own established
 *    pattern of shipping decorative, non-functional demo affordances (see
 *    `docs/quirks/26.1.json` `ux-pattern-catalog-required-marker-not-
 *    enforced` for the same class of finding on a different component) --
 *    this app is a UI PATTERN reference, not a functionally wired demo.
 *    Contrast: Interactive Report's structurally similar `Primary Row
 *    Action` link on the SAME app DOES have a real `href` and DOES
 *    navigate (confirmed live) -- so click-driven navigation via a region
 *    action is not impossible in principle, just unverified for THIS
 *    component family on the only live instance available. No
 *    click-effect assertion is shipped here as a result -- only presence,
 *    matching this module's honest confidence level. See
 *    docs/ecosystem-roadmap.md for what would resolve this (a live app
 *    with a functionally wired Cards/List action).
 */
import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Locate region actions (Cards `action-d` shape only -- see module doc)
 * by their `.apx` `label`. Matches ONE OR MORE elements -- one per row/
 * record that renders this action, NOT a unique locator the way
 * `buttonByLabel()` (button.ts) is for page-level buttons. Callers wanting
 * a specific record's action must scope further (see module doc).
 */
export function regionActionLocator(page: Page, label: string): Locator {
  return page.getByRole('link', { name: label, exact: true });
}

/** Count of rendered elements for a given action label -- 0 is a real, checkable failure; >1 is the expected common case, not an error. */
export function regionActionCount(page: Page, label: string): Promise<number> {
  return regionActionLocator(page, label).count();
}

/**
 * Assert a region action's label resolves to at least `expectedMinCount`
 * elements (default 1) -- presence only, deliberately NOT a click-through
 * effect assertion (see module doc, point 3). Mirrors
 * `expectButtonsPresent()`'s (button.ts) intent, adjusted for the
 * confirmed one-per-record repetition this component family has and
 * page-level buttons do not.
 */
export async function expectRegionActionPresent(page: Page, label: string, expectedMinCount = 1): Promise<void> {
  const count = await regionActionCount(page, label);
  expect(count, `region action "${label}" declared in .apx but not found at runtime (or found fewer than expected)`)
    .toBeGreaterThanOrEqual(expectedMinCount);
}
