/**
 * Login fixture. Field ids: VERIFIED against a real second APEX 26.1 app
 * (Sample File Upload and Download) -- P101_USERNAME/P101_PASSWORD, the
 * long-standing Universal Theme login page item ids, matched exactly with
 * no changes needed.
 *
 * Submission method: switched from Enter-key to clicking the submit button
 * (located by accessible role/name, falling back to Enter only if no
 * matching button is found) after live evidence against that same app: an
 * initial attempt succeeded with Enter, then three consecutive attempts
 * failed -- the form was filled correctly (both fields, confirmed via
 * screenshot, no lockout/error banner), but the Enter keypress simply
 * didn't trigger submission. A visible button click is expected to be more
 * robust across different login page templates than relying on Enter
 * reaching whatever JS handler a given template wires up. This specific
 * fix has NOT been independently re-verified live (see CLAUDE.md/README --
 * credential-based verification is intentionally not repeated here); the
 * button-click path is the recommended default based on the evidence
 * above, not a fully closed-out verification.
 *
 * Fails loudly, not silently: if the expected login items aren't found, or
 * the page is still on the login URL after submit, this throws -- it never
 * returns as if login succeeded when it didn't.
 */
import type { Browser, Page } from '@playwright/test';

export interface ApexCredentials {
  username: string;
  password: string;
}

export interface LoginOptions {
  usernameItemId?: string;
  passwordItemId?: string;
  /** Accessible name (or pattern) of the submit button. Falls back to Enter if no match is found. */
  submitButtonName?: string | RegExp;
  /** Extra wait after submit for the post-login redirect to settle. */
  timeoutMs?: number;
}

const DEFAULTS = {
  usernameItemId: 'P101_USERNAME',
  passwordItemId: 'P101_PASSWORD',
  submitButtonName: /sign.?in|log.?in/i,
  timeoutMs: 15_000,
} satisfies Required<LoginOptions>;

/**
 * Log in against a running page already navigated to the login URL.
 * Throws if the login items are missing or if the URL hasn't changed away
 * from the login page after submit (the generic "still logged out" signal).
 */
export async function login(page: Page, credentials: ApexCredentials, options: LoginOptions = {}): Promise<void> {
  const opts = { ...DEFAULTS, ...options };
  const loginUrl = page.url();

  const usernameField = page.locator(`#${opts.usernameItemId}`);
  const passwordField = page.locator(`#${opts.passwordItemId}`);

  const usernameCount = await usernameField.count();
  if (usernameCount === 0) {
    throw new Error(
      `login(): #${opts.usernameItemId} not found on ${loginUrl}. ` +
        'This app may use a customized login page -- pass usernameItemId/passwordItemId explicitly. ' +
        'This fixture is unverified against a real instance; see CLAUDE.md debt #5.',
    );
  }

  await usernameField.fill(credentials.username);
  await passwordField.fill(credentials.password);

  const submitButton = page.getByRole('button', { name: opts.submitButtonName });
  if ((await submitButton.count()) > 0) {
    await submitButton.first().click();
  } else {
    await passwordField.press('Enter');
  }
  await page.waitForLoadState('domcontentloaded', { timeout: opts.timeoutMs });

  if (page.url() === loginUrl) {
    throw new Error(
      `login(): URL unchanged after submit (${loginUrl}) -- treating as a failed login rather than ` +
        'assuming success. Check credentials, that the submit button was found, or pass submitButtonName explicitly.',
    );
  }
}

/**
 * Log in inside a fresh browser context and persist the resulting session as
 * a Playwright storageState file, so a full suite can reuse it via
 * `test.use({ storageState: path })` instead of logging in per test.
 */
export async function loginAndSaveState(
  browser: Browser,
  loginUrl: string,
  credentials: ApexCredentials,
  storageStatePath: string,
  options: LoginOptions = {},
): Promise<void> {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(loginUrl, { waitUntil: 'domcontentloaded' });
    await login(page, credentials, options);
    await context.storageState({ path: storageStatePath });
  } finally {
    await context.close();
  }
}
