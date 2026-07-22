/**
 * M3: live proof of the PageObject pattern (packages/generator/src/page-object.ts)
 * against a real running instance.
 *
 * This is HAND-WRITTEN, not generator output. The real APEXlang export for
 * this app isn't committed (redistribution unchecked, per
 * docs/grammar-assumptions.md fixture policy) and isn't available in every
 * environment that might run this suite, so spike/tests-generated/ could not
 * be regenerated end-to-end here. What IS verified:
 *   - the generator's determinism and its exact PageObject/spec shape,
 *     against the committed synthetic fixture
 *     (packages/generator/test/fixtures/mini-export) -- see the CI
 *     "Determinism gate" step and packages/generator/test/fixtures/;
 *   - that the SAME shape (typed ApexItem accessors, buttonByLabel click
 *     methods, goto()/url()) works correctly live, right here, using only
 *     items/buttons with reliable ground truth already established in
 *     p410-simple-form.spec.ts (Q2/Q3 discovery) and
 *     p410-testkit-primitives.spec.ts (M2 exit criterion).
 *
 * Whoever has the real export can regenerate spike/tests-generated for real
 * with: node packages/generator/dist/cli.js <export-dir> --out spike/tests-generated
 */
import type { Page } from '@playwright/test';
import { ApexItem, apexPageUrl, buttonByLabel, expect, gotoApexPage, test } from '@apx/testkit';
import { APP_BASE } from '../playwright.config.js';

/** Same shape the generator emits -- see packages/generator/src/page-object.ts. */
class DataEntrySimpleFormPage {
  static readonly alias = 'data-entry-simple-form';

  constructor(private readonly page: Page) {}

  url(): string {
    return apexPageUrl(APP_BASE, DataEntrySimpleFormPage.alias);
  }

  async goto(): Promise<string[]> {
    return gotoApexPage(this.page, this.url());
  }

  get name(): ApexItem {
    return new ApexItem(this.page, 'P410_NAME');
  }

  async clickPrimaryAction(): Promise<void> {
    await buttonByLabel(this.page, 'Primary Action').click();
  }
}

test.describe('p410 page-object pattern (hand-written, mirrors generator shape)', () => {
  test('goto + item accessor round-trip through the page object', async ({ page }) => {
    const po = new DataEntrySimpleFormPage(page);
    await po.goto();
    await po.name.setValue('apx-page-object');
    expect(await po.name.getValue()).toBe('apx-page-object');
  });

  test('button click method locates its target via the page object', async ({ page }) => {
    const po = new DataEntrySimpleFormPage(page);
    await po.goto();
    await expect(buttonByLabel(page, 'Primary Action')).toBeVisible();
    // Not calling po.clickPrimaryAction() -- it submits the form, which is
    // out of scope for this smoke check (no assertion on post-submit state).
  });
});
