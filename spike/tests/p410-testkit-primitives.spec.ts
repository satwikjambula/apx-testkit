/**
 * M2 exit criterion: a hand-written spec against the UX Pattern Catalog app
 * (the Sample DB App stand-in) that passes using ONLY @apx/testkit
 * primitives -- no raw selectors, no locally duplicated helpers. Compare
 * against tests-generated/p00410-data-entry-simple-form.spec.ts: same page,
 * same assertions, but this file is written by a person exercising the
 * public API, not emitted by the generator. If this drifts from what the
 * generator produces, the testkit's public surface is the thing to fix.
 *
 * Region/button DOM convention is still open (see
 * docs/grammar-assumptions.md "Still open") -- the button test below
 * deliberately uses the accessible-role/label locator from button.ts rather
 * than any static-id assumption.
 */
import { apexPageUrl, ApexItem, buttonByLabel, expectItemsPresent, expect, gotoApexPage, normalizeTitle, test } from '@apx/testkit';
import { APP_BASE } from '../playwright.config.js';

const PAGE_ALIAS = 'data-entry-simple-form';
const PAGE_TITLE = 'Data Entry – Simple Form';
const VISIBLE_ITEM_IDS = ['P410_NAME', 'P410_EMAIL', 'P410_NOTES', 'P410_SALARY', 'P410_JOB'];
const HIDDEN_ITEM_IDS = ['P410_ID'];

const pageUrl = () => apexPageUrl(APP_BASE, PAGE_ALIAS);

test.describe('p410 data entry simple form (testkit primitives only)', () => {
  test('loads with clean console', async ({ page, consoleErrors }) => {
    await gotoApexPage(page, pageUrl());
    await page.waitForTimeout(1000);
    expect(consoleErrors).toEqual([]);
  });

  test('title matches metadata (normalized)', async ({ page }) => {
    await gotoApexPage(page, pageUrl());
    expect(normalizeTitle(await page.title())).toBe(normalizeTitle(PAGE_TITLE));
  });

  test('every declared pageItem is present', async ({ page }) => {
    await gotoApexPage(page, pageUrl());
    await expectItemsPresent(page, [...VISIBLE_ITEM_IDS, ...HIDDEN_ITEM_IDS]);
  });

  test('apex.item round-trip via the ApexItem helper', async ({ page }) => {
    await gotoApexPage(page, pageUrl());
    const nameItem = new ApexItem(page, 'P410_NAME');
    await nameItem.setValue('apx-testkit');
    expect(await nameItem.getValue()).toBe('apx-testkit');
  });

  test('primary action button is locatable by its accessible label', async ({ page }) => {
    await gotoApexPage(page, pageUrl());
    await expect(buttonByLabel(page, 'Primary Action')).toBeVisible();
  });
});
