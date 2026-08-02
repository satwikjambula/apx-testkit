/**
 * Resolves the previously-"inconclusive, blocked on login" question from
 * docs/ecosystem-roadmap.md's Seventh round follow-up and
 * docs/quirks/26.1.json's `validation` runtime entry: does a real,
 * server-side Interactive Grid `validation()` failure surface through
 * packages/testkit/src/components/messages.ts's `expectError()`
 * (`#APEX_ERROR_MESSAGE` toggled to class `u-visible`), with ZERO new
 * runtime code -- or does APEX route IG validation failures through a
 * structurally different, IG-specific mechanism `messages.ts` doesn't
 * touch?
 *
 * ANSWER, confirmed live against Sample Interactive Grids page 31
 * ("Validation", static id "emp"): IT DEPENDS ON THE VALIDATION TYPE --
 * two genuinely different mechanisms, not one:
 *
 * 1. PAGE-LEVEL SQL VALIDATIONS (`comm-limit`, and by extension
 *    `hire-date-in-past` -- true server-side checks, evaluated in the
 *    database) DO go through a real AJAX round trip
 *    (`wwv_flow.ajax`, `interactiveGridAutoRowProcessing`). The JSON
 *    response's `errors` array carries `location: ["page", "inline"]` --
 *    confirmed literally via a monkey-patched `apex.message.showErrors`
 *    and direct inspection of `#APEX_ERROR_MESSAGE`. `apex.message.
 *    showErrors()` IS called, and `#APEX_ERROR_MESSAGE` DOES toggle to
 *    `u-visible` with the exact configured error text -- exactly like a
 *    classic Form region's full-submit validation failure.
 *    `messages.ts`'s `expectError()` covers THIS case today, zero new
 *    runtime code needed. See the first test below.
 *
 * 2. COLUMN-LEVEL `valueRequired: true` (ENAME/HIREDATE here) is a
 *    CLIENT-SIDE check, exactly as this page's own bundled help text
 *    says ("Required is the only validation done on the client by
 *    default"). Clicking Save with a required cell empty NEVER issues an
 *    AJAX request at all -- confirmed via a `page.on('request')` listener
 *    that saw zero POSTs to `wwv_flow.ajax`. Instead, APEX calls
 *    `apex.message.alert('Correct errors before saving.', ...)` -- a
 *    real, different, documented `apex.message` API, a MODAL, not
 *    `showErrors`/the page banner -- and marks the offending `<td
 *    role="gridcell">` with class `is-error` directly (the "red
 *    triangle in the column header" / in-cell marker the help text
 *    describes). `#APEX_ERROR_MESSAGE` stays `u-hidden` throughout --
 *    confirmed by direct inspection immediately after the modal appears.
 *    `messages.ts`'s `expectError()` does NOT catch this case -- it needed
 *    a new helper. Built this pass: `expectAlert()`/`dismissAlert()`/
 *    `alertDialog()` (same file), reading `role="alertdialog"`, not
 *    `#APEX_ERROR_MESSAGE`. See the second test below.
 *
 * This corrects the prior hypothesis in docs/ecosystem-roadmap.md ("IG
 * saves are AJAX, structurally unlikely to route through the page
 * banner") for case 1 -- real evidence contradicts that guess -- while
 * confirming a DIFFERENT, real gap for case 2. Both are recorded, in
 * place, in docs/quirks/26.1.json and docs/ecosystem-roadmap.md; neither
 * is silently resolved by picking one answer for the whole `validation`
 * question.
 *
 * `hire-date-in-past` (the second page-level SQL validation, distinct
 * from `comm-limit`, per this project's own discipline of never
 * generalizing from a single instance -- see the Chart `widget()`
 * precedent) was ALSO confirmed live to route through the identical
 * AJAX/showErrors/`u-visible` mechanism as case 1 (message text "Hire
 * Date must be in the past.") -- but only reproducible by adding a new
 * row with a blank Hire Date, which ALSO fails the column's own
 * `valueRequired` check at the same instant (`to_date(null) < SYSDATE`
 * is NULL, not TRUE, in Oracle SQL -- a real, correct combination, not a
 * test artifact). The page's inline `show: inline` date-picker has no
 * scriptable path to a genuinely future date in isolation (its Year
 * `<select>` is a fixed +/-10 window around the field's CURRENT value,
 * not around today), so an isolated single-cause reproduction of
 * `hire-date-in-past` alone is not automated here -- the combined
 * reproduction is real evidence for the same case-1 finding and is
 * recorded in docs/quirks/26.1.json, not silently dropped.
 *
 * Both scenarios below are confirmed non-destructive: case 1's AJAX
 * validation failure is REJECTED server-side and never persisted
 * (re-checked after a full reload: data unchanged); case 2 never even
 * reaches the server, so there is nothing to persist. Neither test needs
 * to revert data afterward.
 *
 * Requires BOTH APX_LOGIN_TEST_USERNAME and APX_LOGIN_TEST_PASSWORD --
 * skips cleanly if either is unset. Neither credential is hardcoded here.
 */
import { expect, test } from '@playwright/test';
import { dismissAlert, expectAlert, expectError, login } from '@apx/testkit';

const BASE =
  'https://g9323cdc071900d-tjta51y2tod5o8ej.adb.us-ashburn-1.oraclecloudapps.com/ords/r/satwik/sample-interactive-grids';

async function gotoValidationPage(page: import('@playwright/test').Page): Promise<void> {
  // pageAccessProtection: argumentsMustHaveChecksum -- must navigate via real link clicks, not
  // page.goto(), same discipline as interactive-grid-demo.spec.ts.
  await page.getByRole('link', { name: /^Editing/ }).click();
  await page.waitForLoadState('domcontentloaded');
  await page.getByRole('link', { name: /^Validation/ }).click();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('#emp_ig_grid_vc [role="gridcell"]', { timeout: 15000 });
}

/** Resolve + click a data row's cell by EMPNO and 0-based visible-column index (matches header order:
 *  0=selector,1=row-actions,2=ID,3=icon,4=Name,5=Job,6=Manager,7=HireDate,8=Salary,9=Commission,...). */
async function clickCell(page: import('@playwright/test').Page, empno: string, columnIndex: number): Promise<boolean> {
  return page.evaluate(
    ([empno, columnIndex]) => {
      const cells = Array.from(document.querySelectorAll('#emp_ig_grid_vc [role="gridcell"]')) as HTMLElement[];
      const idCell = cells.find((c) => c.textContent?.trim() === empno);
      const row = idCell?.closest('[role="row"]');
      if (!row) return false;
      const rowCells = Array.from(row.querySelectorAll('[role="gridcell"]')) as HTMLElement[];
      const target = rowCells[columnIndex as number];
      if (!target) return false;
      target.click();
      return true;
    },
    [empno, columnIndex] as [string, number],
  );
}

test.describe('Interactive Grid server-side validation failures surface through messages.ts', () => {
  test('page-level SQL row validation (comm-limit) -- expectError() catches it with zero new code', async ({ page }) => {
    const username = process.env.APX_LOGIN_TEST_USERNAME;
    const password = process.env.APX_LOGIN_TEST_PASSWORD;
    test.skip(
      !username || !password,
      'APX_LOGIN_TEST_USERNAME/APX_LOGIN_TEST_PASSWORD not set -- skipping live Interactive Grid validation verification',
    );

    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await login(page, { username: username!, password: password! });
    await gotoValidationPage(page);

    // KING (empno 7839) has SAL=5000; comm-limit requires COMM < 1.5*SAL (7500). 10000 violates it.
    const clicked = await clickCell(page, '7839', 9); // column 9 = Commission
    expect(clicked).toBe(true);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    await page.keyboard.press('Control+A');
    await page.keyboard.type('10000');
    await page.keyboard.press('Tab');
    await page.waitForTimeout(300);

    const [resp] = await Promise.all([
      page.waitForResponse((r) => r.request().method() === 'POST' && r.url().includes('wwv_flow.ajax')),
      page.getByRole('button', { name: 'Save', exact: true }).click(),
    ]);
    const body = await resp.json();
    expect(body.errors?.[0]?.message).toBe('Commission must be less than 1.5 times the Salary');
    expect(body.errors?.[0]?.location).toEqual(['page', 'inline']);

    // The actual claim under test: messages.ts's expectError() catches this with zero IG-specific code.
    await expectError(page, 'Commission must be less than 1.5 times the Salary');

    // Corroborating IG-specific evidence (a real, additional surface -- not instead of the page banner).
    const gridErrorRow = page.locator('#emp_ig_grid_vc [role="row"].is-error');
    await expect(gridErrorRow.first()).toBeVisible();

    // Confirmed live: a rejected row-save is never persisted -- reload and check COMM reverted to null.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#emp_ig_grid_vc [role="gridcell"]', { timeout: 15000 });
    const commAfterReload = await page.evaluate(() => {
      const cells = Array.from(document.querySelectorAll('#emp_ig_grid_vc [role="gridcell"]')) as HTMLElement[];
      const idCell = cells.find((c) => c.textContent?.trim() === '7839');
      const row = idCell?.closest('[role="row"]');
      const rowCells = row ? Array.from(row.querySelectorAll('[role="gridcell"]')) : [];
      return rowCells[9]?.textContent?.trim();
    });
    expect(commAfterReload).toBe('-'); // '-' is this app's configured null-value display (showNullValuesAs).
  });

  test('column valueRequired (ENAME) -- CLIENT-SIDE only; expectError() does NOT catch this', async ({ page }) => {
    const username = process.env.APX_LOGIN_TEST_USERNAME;
    const password = process.env.APX_LOGIN_TEST_PASSWORD;
    test.skip(
      !username || !password,
      'APX_LOGIN_TEST_USERNAME/APX_LOGIN_TEST_PASSWORD not set -- skipping live Interactive Grid validation verification',
    );

    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await login(page, { username: username!, password: password! });
    await gotoValidationPage(page);

    // CLARK (empno 7782) -- clear the required Name column.
    const clicked = await clickCell(page, '7782', 4); // column 4 = Name
    expect(clicked).toBe(true);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    const focused = page.locator('input:focus');
    await expect(focused).toHaveCount(1);
    await focused.fill('');
    await page.keyboard.press('Tab');
    await page.waitForTimeout(300);

    // Monkey-patch apex.message.alert (NOT showErrors) -- confirmed live this is the actual API called
    // for a required-column violation, and confirm no wwv_flow.ajax POST is ever issued.
    await page.evaluate(() => {
      const w = window as any;
      w.__alertCalls = [];
      const orig = w.apex.message.alert?.bind(w.apex.message);
      if (orig) {
        w.apex.message.alert = (...args: any[]) => {
          w.__alertCalls.push(args[0]);
          return orig(...args);
        };
      }
    });
    let sawAjaxPost = false;
    page.on('request', (r) => {
      if (r.method() === 'POST' && r.url().includes('wwv_flow.ajax')) sawAjaxPost = true;
    });

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForTimeout(800);

    // The actual claim under test: this is a CLIENT-SIDE-only block, not the AJAX/page-banner path.
    expect(sawAjaxPost).toBe(false);
    const alertCalls = await page.evaluate(() => (window as any).__alertCalls);
    expect(alertCalls).toEqual(['Correct errors before saving.']);
    const errBanner = await page.evaluate(() => document.getElementById('APEX_ERROR_MESSAGE')?.className);
    expect(errBanner).toContain('u-hidden'); // confirms expectError() would NOT have anything to catch here

    // The real, IG-specific indicator for THIS validation type: the offending <td> gets class is-error.
    const cellClass = await page.evaluate(() => {
      const cells = Array.from(document.querySelectorAll('#emp_ig_grid_vc [role="gridcell"]')) as HTMLElement[];
      const idCell = cells.find((c) => c.textContent?.trim() === '7782');
      const row = idCell?.closest('[role="row"]');
      const rowCells = row ? Array.from(row.querySelectorAll('[role="gridcell"]')) : [];
      return rowCells[4]?.className;
    });
    expect(cellClass).toContain('is-error');

    // The small, evidence-backed testkit addition this pass produced: expectAlert()/dismissAlert()
    // (packages/testkit/src/components/messages.ts) cover THIS mechanism, distinct from expectError().
    await expectAlert(page, 'Correct errors before saving.');
    await dismissAlert(page);
    await page.waitForTimeout(300);

    // Nothing was ever sent to the server -- confirm by reloading (accept the resulting
    // beforeunload prompt for the still-unsaved client-side edit) and checking ENAME is back to CLARK.
    page.once('dialog', (d) => void d.accept());
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#emp_ig_grid_vc [role="gridcell"]', { timeout: 15000 });
    await page.waitForTimeout(1000);
    const enameAfterReload = await page.evaluate(() => {
      const cells = Array.from(document.querySelectorAll('#emp_ig_grid_vc [role="gridcell"]')) as HTMLElement[];
      const idCell = cells.find((c) => c.textContent?.trim() === '7782');
      const row = idCell?.closest('[role="row"]');
      const rowCells = row ? Array.from(row.querySelectorAll('[role="gridcell"]')) : [];
      return rowCells[4]?.textContent?.trim();
    });
    expect(enameAfterReload).toBe('CLARK');
  });
});
