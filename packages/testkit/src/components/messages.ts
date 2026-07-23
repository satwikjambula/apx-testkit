/**
 * Page message / notification assertions -- VERIFIED live, with one real
 * correction along the way. `apex.message` is a universal, documented
 * top-level APEX API: `#APEX_SUCCESS_MESSAGE` and `#APEX_ERROR_MESSAGE` are
 * standard DOM elements present on every APEX page's template (confirmed:
 * class `u-hidden` on a fresh load, before any message has ever shown),
 * toggled to `u-visible` by `apex.message.showPageSuccess()` / `showErrors()`
 * and back to `u-hidden` by `hidePageSuccess()` / `clearErrors()`.
 *
 * IMPORTANT, found live: do NOT use Playwright's `toBeVisible()`/
 * `toBeHidden()` against these elements. Confirmed on the ground-truth app:
 * even with class `u-visible` correctly applied, the element's rendered
 * height stayed exactly `0px` (checked repeatedly over 1.8s -- not a
 * transient animation, a stuck state) when the message was triggered by
 * calling `apex.message.showPageSuccess()` directly rather than through a
 * real form submission. Playwright's visibility check requires a non-empty
 * bounding box, so `toBeVisible()` reports "hidden" even though the class
 * says otherwise -- and in the OTHER direction, because the box is *always*
 * zero-height in this app/theme regardless of state, `toBeHidden()` would
 * trivially pass even while a message genuinely is showing. Both directions
 * are unsafe. The CLASS is the reliable signal; these functions check that,
 * not rendered visibility.
 */
import { expect, type Locator, type Page } from '@playwright/test';

const VISIBLE_CLASS = /(^|\s)u-visible(\s|$)/;

export function successMessage(page: Page): Locator {
  return page.locator('#APEX_SUCCESS_MESSAGE');
}

export function errorMessage(page: Page): Locator {
  return page.locator('#APEX_ERROR_MESSAGE');
}

/** Assert a page-success message is showing (class-based, not rendered-visibility-based -- see module doc), optionally matching its text. */
export async function expectSuccess(page: Page, textOrPattern?: string | RegExp): Promise<void> {
  const el = successMessage(page);
  await expect(el).toHaveClass(VISIBLE_CLASS);
  if (textOrPattern !== undefined) await expect(el).toContainText(textOrPattern);
}

/** Assert a page-error message is showing (class-based -- see module doc), optionally matching its text. */
export async function expectError(page: Page, textOrPattern?: string | RegExp): Promise<void> {
  const el = errorMessage(page);
  await expect(el).toHaveClass(VISIBLE_CLASS);
  if (textOrPattern !== undefined) await expect(el).toContainText(textOrPattern);
}

/** Assert no page-error message is currently showing (class-based -- see module doc). */
export async function expectNoErrors(page: Page): Promise<void> {
  await expect(errorMessage(page)).not.toHaveClass(VISIBLE_CLASS);
}

/** Assert no page-success message is currently showing (class-based -- see module doc). */
export async function expectNoSuccessMessage(page: Page): Promise<void> {
  await expect(successMessage(page)).not.toHaveClass(VISIBLE_CLASS);
}
