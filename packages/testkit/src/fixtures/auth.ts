/**
 * Login fixture. Field ids: VERIFIED against a real second APEX 26.1 app
 * (Sample File Upload and Download) -- P101_USERNAME/P101_PASSWORD, the
 * long-standing Universal Theme login page item ids, matched exactly with
 * no changes needed.
 *
 * Real bug found and fixed against that same app, corrected once by
 * evidence: the ORIGINAL "check page.url() right after
 * waitForLoadState('domcontentloaded')" design is a race condition, not a
 * submission-method problem. A run that threw "URL unchanged after submit"
 * had its failure screenshot show the user already logged in on the real
 * post-login dashboard -- meaning the login itself succeeded, but the
 * synchronous check ran before an async/AJAX-driven redirect had actually
 * updated the page URL. (This also means the earlier "Enter is unreliable,
 * switch to a button click" theory was very likely the WRONG diagnosis for
 * the same underlying race -- both submission methods can trigger an
 * async-redirect login that a synchronous check catches too early.)
 *
 * Fixed by waiting for an actual URL change (`page.waitForURL`) instead of
 * a fixed-point check -- this waits up to `timeoutMs` for the redirect to
 * actually happen, however long the app's own login processing takes,
 * rather than sampling the URL once right after a load-state event that
 * doesn't guarantee the redirect has landed yet.
 *
 * Fails loudly, not silently: if the expected login items aren't found, or
 * the URL never changes away from the login page within the timeout, this
 * throws -- it never returns as if login succeeded when it didn't.
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
  /** How long to wait for the URL to change away from the login page after submit. */
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
 * Throws if the login items are missing, or if the URL hasn't changed away
 * from the login page within `timeoutMs` (the generic "still logged out"
 * signal) -- waits for the actual redirect rather than sampling once.
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

  try {
    await page.waitForURL((url) => url.toString() !== loginUrl, { timeout: opts.timeoutMs });
  } catch {
    throw new Error(
      `login(): URL still ${loginUrl} after ${opts.timeoutMs}ms -- treating as a failed login rather than ` +
        'assuming success. Check credentials, that the submit button was found, or increase timeoutMs if this ' +
        'app has a slow async login redirect.',
    );
  }
  await page.waitForLoadState('domcontentloaded').catch(() => {});
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
