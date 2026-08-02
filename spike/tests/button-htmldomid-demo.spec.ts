/**
 * Live evidence for `ApexButton.htmlDomId` (packages/parser/src/ast.ts)
 * and docs/quirks/26.1.json `button-id-not-static-id` -- the Eighth round
 * "Button DOM identifier discovery" pass. No login required; UX Pattern
 * Catalog is publicly reachable.
 *
 * Does NOT change `button.ts`'s runtime behavior -- confirms the NEGATIVE
 * finding this pass is built on: every button checked (across 3 pages)
 * has no `advanced { htmlDomId }`/`staticId` override in its `.apx`
 * export (confirmed separately by grepping the real export -- see
 * ApexButton.htmlDomId's doc comment), and its runtime DOM id is an
 * APEX-internal `B<numeric>` id, structurally identical to region's
 * `R<numeric>` fallback (ADR-003 layer 3) but with no positive
 * (htmlDomId-set) example anywhere in this project's corpus to verify a
 * resolution convention against. `buttonByLabel()`'s existing accessible-
 * role/label locator remains the only verified way to target a button.
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
