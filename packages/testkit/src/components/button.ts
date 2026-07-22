/**
 * Button wrapper -- PARTIAL contract. Per docs/grammar-assumptions.md
 * "Still open", no button identifier/DOM convention has been verified yet
 * (BUTTON DISCOVERY report pending). Rather than guess a selector, this
 * wrapper locates buttons by accessible role + name (the .apx `label`
 * field), using Playwright's accessibility-tree locator -- not a raw CSS
 * selector, and not dependent on APEX's internal id/class scheme. This
 * degrades gracefully across whatever DOM convention APEX renders, at the
 * cost of only working when the label text is the accessible name (true for
 * ordinary buttons; not verified for icon-only or template-customized ones).
 *
 * Once the BUTTON DISCOVERY report lands and an id-based convention is
 * confirmed, prefer a static-id locator here and keep this as the fallback.
 */
import type { Locator, Page } from '@playwright/test';
import { recordCoverageTouch } from '../fixtures/coverage.js';

/**
 * Locate a button by its .apx `label` via the accessibility tree. Records
 * a coverage touch keyed by LABEL, not a static id (there is no verified
 * button-id convention yet -- see module doc); the coverage report cross-
 * references by label against the AST's button.label field.
 */
export function buttonByLabel(page: Page, label: string): Locator {
  recordCoverageTouch('button', label);
  return page.getByRole('button', { name: label, exact: true });
}

export async function clickButton(page: Page, label: string): Promise<void> {
  await buttonByLabel(page, label).click();
}
