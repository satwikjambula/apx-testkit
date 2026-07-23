/**
 * Live proof of the message/notification component
 * (packages/testkit/src/components/messages.ts). apex.message is a
 * universal top-level API, confirmed live: #APEX_SUCCESS_MESSAGE and
 * #APEX_ERROR_MESSAGE exist on this page even before any message is shown
 * (class u-hidden on fresh load), and toggle to class u-visible when
 * apex.message.showPageSuccess()/showErrors() run, back to u-hidden on
 * hidePageSuccess()/clearErrors(). Deliberately class-based, not
 * Playwright's toBeVisible()/toBeHidden() -- see messages.ts module doc
 * for why the rendered bounding box is unreliable here (confirmed stuck at
 * 0px height on this app when triggered this way).
 */
import { apexPageUrl, expectError, expectNoErrors, expectNoSuccessMessage, expectSuccess, gotoApexPage, test } from '@apx/testkit';
import { APP_BASE } from '../playwright.config.js';

const pageUrl = () => apexPageUrl(APP_BASE, 'data-entry-simple-form');

test.describe('page message assertions (apex.message)', () => {
  test('no messages showing on a fresh page load', async ({ page }) => {
    await gotoApexPage(page, pageUrl());
    await expectNoErrors(page);
    await expectNoSuccessMessage(page);
  });

  test('expectSuccess sees a real success message', async ({ page }) => {
    await gotoApexPage(page, pageUrl());
    await page.evaluate(() => (window as any).apex.message.showPageSuccess('Record saved'));
    await expectSuccess(page, 'Record saved');
  });

  test('expectError sees a real error message', async ({ page }) => {
    await gotoApexPage(page, pageUrl());
    await page.evaluate(() =>
      (window as any).apex.message.showErrors([{ type: 'error', location: 'page', message: 'Something broke' }]),
    );
    await expectError(page, 'Something broke');
  });

  test('clearErrors() is reflected by expectNoErrors', async ({ page }) => {
    await gotoApexPage(page, pageUrl());
    await page.evaluate(() =>
      (window as any).apex.message.showErrors([{ type: 'error', location: 'page', message: 'temp' }]),
    );
    await expectError(page, 'temp');
    await page.evaluate(() => (window as any).apex.message.clearErrors());
    await expectNoErrors(page);
  });
});
