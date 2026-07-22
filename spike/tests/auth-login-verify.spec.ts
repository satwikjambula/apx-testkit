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
 * field ids on this app's login page, and login() succeeded with no
 * changes needed: filled both fields, submitted via Enter, detected the
 * redirect to /home.
 *
 * Requires APX_LOGIN_TEST_PASSWORD -- skips cleanly if unset. NEVER commit
 * a real password to this repo; the username alone (a fixed sample test
 * account, not a personal credential) is not sensitive and is safe here.
 */
import { expect, test } from '@playwright/test';
import { login } from '@apx/testkit';

const BASE =
  'https://g9323cdc071900d-tjta51y2tod5o8ej.adb.us-ashburn-1.oraclecloudapps.com/ords/r/satwik/sample-file-upload-download';
const USERNAME = 'CLAUDE_USER';

test('login() succeeds against a real APEX login page (P101_USERNAME/P101_PASSWORD confirmed)', async ({ page }) => {
  const password = process.env.APX_LOGIN_TEST_PASSWORD;
  test.skip(!password, 'APX_LOGIN_TEST_PASSWORD not set -- skipping live login verification');

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await login(page, { username: USERNAME, password: password! });
  expect(page.url()).toContain('/home');
});
