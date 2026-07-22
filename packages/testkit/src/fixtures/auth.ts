/**
 * Login fixture -- UNVERIFIED against a real 26.1 instance. Every page in the
 * ground-truth export (UX Pattern Catalog) is `authentication: public`, so
 * the auth path has zero runtime validation (tracked as a debt in CLAUDE.md
 * "Outstanding debts" #5). This exists so the login-required pages that the
 * generator currently `test.describe.skip()`s have a fixture to switch to --
 * but treat it as a starting point, not a verified contract.
 *
 * What it assumes, and why: `P101_USERNAME` / `P101_PASSWORD` are Oracle's
 * long-standing Universal Theme login page item ids, unchanged across many
 * APEX releases and predating APEXlang -- not a 26.1-specific guess. They
 * are still overridable per-call because a customized login page can rename
 * them. Sign-in is submitted with Enter (matches the standard login page's
 * default button behavior) rather than a button-label locator, so this does
 * not depend on the still-open BUTTON DISCOVERY convention (see button.ts).
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
  /** Extra wait after submit for the post-login redirect to settle. */
  timeoutMs?: number;
}

const DEFAULTS: Required<LoginOptions> = {
  usernameItemId: 'P101_USERNAME',
  passwordItemId: 'P101_PASSWORD',
  timeoutMs: 15_000,
};

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
  await passwordField.press('Enter');
  await page.waitForLoadState('domcontentloaded', { timeout: opts.timeoutMs });

  if (page.url() === loginUrl) {
    throw new Error(
      `login(): URL unchanged after submit (${loginUrl}) -- treating as a failed login rather than ` +
        'assuming success. Check credentials, or that Enter submits this login page.',
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
