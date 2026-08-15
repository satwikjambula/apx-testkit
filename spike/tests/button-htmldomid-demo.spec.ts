/**
 * Live evidence for `ApexButton.htmlDomId` (packages/parser/src/ast.ts)
 * and docs/quirks/26.1.json `button-id-not-static-id` -- the Eighth round
 * "Button DOM identifier discovery" pass. No login required; UX Pattern
 * Catalog is publicly reachable.
 *
 * Does NOT change `button.ts`'s runtime behavior -- confirms the NEGATIVE
 * finding this pass is built on, SPECIFICALLY FOR THESE 3 PAGES OF THIS
 * ONE APP: every button checked here has no `advanced { htmlDomId }`/
 * `staticId` override in its `.apx` export (confirmed separately by
 * grepping the real export), and its runtime DOM id is an APEX-internal
 * `B<numeric>` id, structurally identical to region's `R<numeric>`
 * fallback (ADR-003 layer 3).
 *
 * CORRECTED (runtime-review P0 item 4, 2026-08-14) -- this file's ORIGINAL
 * comment overclaimed the scope of this negative finding as project-wide
 * ("no positive example anywhere in this project's corpus"). Re-swept the
 * full local corpus this pass and found FOUR real buttons that DO set
 * `advanced { htmlDomId }`: `apextogo` page 4 button `search` ->
 * `SEARCH`; `concurrent-manager` page 350 button `edit` ->
 * `edit_master_btn`; `sample-charts` page 3 button `p3-go` -> `P3_GO`;
 * `sample-interactive-grids` page 57 button `save` -> `save-button`. See
 * docs/quirks/26.1.json `button-id-not-static-id` (corrected in place)
 * and `spike/tests/button-htmldomid-live-2026-08-14-demo.spec.ts` (new,
 * gated, not yet run -- blocked on live access at the time it was
 * written) for the follow-up live check against one of these 4 real
 * examples. `buttonByHtmlDomId()` (packages/testkit/src/components/
 * button.ts) now exists as a real, ready primitive for this, explicitly
 * marked NOT YET LIVE-VERIFIED until that follow-up spec actually runs.
 * `buttonByLabel()`'s accessible-role/label locator remains the only
 * VERIFIED way to target a button.
 */
import { apexPageUrl, buttonByLabel, gotoApexPage, test } from '@apx/testkit';
import { expect } from '@playwright/test';
import { APP_BASE } from '../playwright.config.js';

test.describe('button DOM id convention (confirmed dead end for auto-construction)', () => {
  for (const alias of ['browse-interactive-report', 'faceted-search-cards', 'data-entry-simple-form']) {
    test(`"${alias}": Primary Action button's runtime id is an internal B<numeric> id`, async ({ page }) => {
      await gotoApexPage(page, apexPageUrl(APP_BASE, alias));
      const id = await buttonByLabel(page, 'Primary Action').getAttribute('id');
      expect(id).toMatch(/^B\d+$/);
    });
  }
});
