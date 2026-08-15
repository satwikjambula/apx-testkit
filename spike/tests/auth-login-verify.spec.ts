/**
 * Verifies @apx/testkit's auth.ts login() against a REAL login page --
 * resolves the long-standing gap in CLAUDE.md/docs/limitations.md: every
 * other ground-truth page used in this project (UX Pattern Catalog) is
 * `authentication: public`, so the auth path had zero real-world
 * validation until now.
 *
 * Second, independent APEX 26.1 app: "Sample File Upload and Download"
 * (an Oracle sample gallery app). Standard username/password login --
 * confirmed live that P101_USERNAME/P101_PASSWORD (auth.ts's defaults,
 * based on the long-standing Universal Theme convention) are the REAL
 * field ids on this app's login page.
 *
 * Requires BOTH APX_LOGIN_TEST_USERNAME and APX_LOGIN_TEST_PASSWORD --
 * skips cleanly if either is unset. NEVER commit real credentials to this
 * repo, including the username: even a sample test-account name is left
 * out of source so this file carries no account-identifying information
 * at all.
 */
import { expect, test } from '@playwright/test';
import { login } from '@apx/testkit';

const BASE =
  'https://g9323cdc071900d-tjta51y2tod5o8ej.adb.us-ashburn-1.oraclecloudapps.com/ords/r/satwik/sample-file-upload-download';

test('login() succeeds against a real APEX login page (P101_USERNAME/P101_PASSWORD confirmed)', async ({ page }) => {
  const username = process.env.APX_LOGIN_TEST_USERNAME;
  const password = process.env.APX_LOGIN_TEST_PASSWORD;
  test.skip(
    !username || !password,
    'APX_LOGIN_TEST_USERNAME/APX_LOGIN_TEST_PASSWORD not set -- skipping live login verification',
  );

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await login(page, { username: username!, password: password! });
  expect(page.url()).toContain('/home');
});

/**
 * P1 hardening pass (maintainer review): the DEFAULT "URL changed away
 * from the login page" check above is a weak success signal -- it would
 * also pass if the app redirected to an MFA step or an error-redisplay
 * page instead of the real authenticated app. This test exercises the
 * new, STRONGER `options.success: { url: ... }` condition instead,
 * against this same app's confirmed real post-login landing path
 * (`.../home` -- see docs/quirks/26.1.json `page-access-protection-
 * blocks-bare-navigation`'s evidence: "Live: right after login(), landed
 * on .../home?session=<id>"). Same env-var gate as the test above --
 * skips cleanly if credentials aren't set. As of this pass, this test has
 * only been confirmed to type-check and skip cleanly (site reachability
 * was re-confirmed fresh, but no test credentials were available in this
 * environment to actually execute the login flow -- see
 * docs/quirks/26.1.json `login-race-condition.secondPass` for the full
 * status). Ready for whoever has credentials to run it for real.
 */
test('login() with options.success.url requires the REAL post-login URL, not just any change', async ({ page }) => {
  const username = process.env.APX_LOGIN_TEST_USERNAME;
  const password = process.env.APX_LOGIN_TEST_PASSWORD;
  test.skip(
    !username || !password,
    'APX_LOGIN_TEST_USERNAME/APX_LOGIN_TEST_PASSWORD not set -- skipping live login verification',
  );

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await login(page, { username: username!, password: password! }, { success: { url: /\/home/ } });
  expect(page.url()).toMatch(/\/home/);
});
