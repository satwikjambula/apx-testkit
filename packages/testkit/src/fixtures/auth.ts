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
 * SECOND hardening pass (maintainer P1 review): "URL changed to something"
 * is itself a weak success signal -- a URL can change while the user is
 * still on some authentication-adjacent page (an MFA step, an error
 * redisplay with a modified query string, a "verify your email" interstitial)
 * rather than the real authenticated app. `options.success` now lets a
 * caller supply a STRONGER, explicit condition: a URL pattern the final
 * authenticated page must actually match (not just differ from the login
 * URL), a locator that must become visible once truly logged in (e.g. a
 * "Logout" link only the authenticated shell renders), or an arbitrary
 * predicate. The bare "URL changed" check remains the DEFAULT when
 * `options.success` is omitted, for backward compatibility with
 * `spike/tests/*.spec.ts` and anything else already calling `login()` --
 * but it is documented here, deliberately, as the weaker interim signal it
 * always was. Passing an explicit `success` condition is the recommended,
 * stronger path; the default did not silently become strong just because
 * the API got more flexible around it.
 *
 * Fails loudly, not silently: if the expected login items aren't found, the
 * success condition is never satisfied within the timeout, or a custom
 * predicate never returns true, this throws -- it never returns as if login
 * succeeded when it didn't.
 */
import type { Browser, Locator, Page } from '@playwright/test';

export interface ApexCredentials {
  username: string;
  password: string;
}

/**
 * A URL condition, forwarded verbatim to Playwright's own `page.waitForURL`
 * -- a glob string, a RegExp, or a predicate over the resulting `URL`
 * object. Unlike the DEFAULT "URL changed to something" check, this
 * requires the URL to actually match the pattern you expect the real
 * authenticated app to land on (e.g. `/home`), not merely differ from the
 * login page.
 */
export interface LoginSuccessUrl {
  url: string | RegExp | ((url: URL) => boolean);
  locator?: never;
}

/**
 * A locator that must become VISIBLE once login has genuinely landed on the
 * authenticated app -- e.g. `page.getByRole('link', { name: 'Logout' })`.
 * Strong because it's tied to something only the real post-login UI
 * renders, not just page navigation.
 */
export interface LoginSuccessLocator {
  locator: Locator;
  url?: never;
}

/** An arbitrary custom predicate, polled until it returns true or the timeout elapses. */
export type LoginSuccessPredicate = (page: Page) => boolean | Promise<boolean>;

export type LoginSuccess = LoginSuccessUrl | LoginSuccessLocator | LoginSuccessPredicate;

export interface LoginOptions {
  usernameItemId?: string;
  passwordItemId?: string;
  /** Accessible name (or pattern) of the submit button. Falls back to Enter if no match is found. */
  submitButtonName?: string | RegExp;
  /** How long to wait for the success condition to be satisfied after submit. */
  timeoutMs?: number;
  /**
   * How to decide login succeeded. Omit to fall back to the DEFAULT, weaker
   * "URL changed away from the login page" check (kept for backward
   * compatibility -- see this file's doc comment). Pass one of:
   *   - `{ url: /home/ }` -- the final URL must actually match this pattern.
   *   - `{ locator: page.getByRole('link', { name: 'Logout' }) }` -- this
   *     locator must become visible.
   *   - `async (page) => boolean` -- an arbitrary custom predicate.
   */
  success?: LoginSuccess;
}

const DEFAULTS = {
  usernameItemId: 'P101_USERNAME',
  passwordItemId: 'P101_PASSWORD',
  submitButtonName: /sign.?in|log.?in/i,
  timeoutMs: 15_000,
} satisfies Required<Omit<LoginOptions, 'success'>>;

/** Polls `predicate` every `intervalMs` until it returns true or `timeoutMs` elapses. Always checks at least once. */
async function pollUntil(predicate: () => boolean | Promise<boolean>, timeoutMs: number, intervalMs = 200): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await predicate()) return true;
    const remaining = deadline - Date.now();
    if (remaining <= 0) return false;
    await new Promise((resolve) => setTimeout(resolve, Math.min(intervalMs, remaining)));
  }
}

function describeCause(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/**
 * Waits for `success` to be satisfied. `success === undefined` runs the
 * DEFAULT, weaker "URL changed away from `loginUrl`" check -- see this
 * file's doc comment for why that's an interim signal, not a strong one.
 */
async function waitForLoginSuccess(page: Page, loginUrl: string, success: LoginSuccess | undefined, timeoutMs: number): Promise<void> {
  if (success === undefined) {
    try {
      await page.waitForURL((url) => url.toString() !== loginUrl, { timeout: timeoutMs });
    } catch {
      throw new Error(
        `login(): URL still ${loginUrl} after ${timeoutMs}ms -- treating as a failed login rather than ` +
          'assuming success. Check credentials, that the submit button was found, or increase timeoutMs if this ' +
          'app has a slow async login redirect. Consider passing an explicit options.success condition (a URL ' +
          'pattern, a post-login locator, or a custom predicate) for a stronger signal than "the URL changed to ' +
          "something\" -- see docs/tutorial.md's Authorization section.",
      );
    }
    return;
  }

  if (typeof success === 'function') {
    const ok = await pollUntil(() => success(page), timeoutMs);
    if (!ok) {
      throw new Error(
        `login(): custom options.success predicate never returned true within ${timeoutMs}ms after submit -- ` +
          'treating as a failed login rather than assuming success.',
      );
    }
    return;
  }

  if ('locator' in success && success.locator) {
    try {
      await success.locator.waitFor({ state: 'visible', timeout: timeoutMs });
    } catch (cause) {
      throw new Error(
        `login(): options.success.locator never became visible within ${timeoutMs}ms after submit -- treating ` +
          `as a failed login rather than assuming success. ${describeCause(cause)}`,
      );
    }
    return;
  }

  try {
    await page.waitForURL(success.url, { timeout: timeoutMs });
  } catch (cause) {
    throw new Error(
      `login(): URL never matched options.success.url within ${timeoutMs}ms after submit -- still at ` +
        `${page.url()}, treating as a failed login rather than assuming success. ${describeCause(cause)}`,
    );
  }
}

/**
 * Log in against a running page already navigated to the login URL.
 * Throws if the login items are missing, or if the success condition
 * (`options.success`, or the default URL-change check -- see this file's
 * doc comment) isn't satisfied within `timeoutMs`.
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
        'This app may use a customized login page -- pass usernameItemId/passwordItemId explicitly, or a custom ' +
        "authentication scheme entirely; see docs/tutorial.md's Authorization section. " +
        'This fixture is unverified against a real instance; see CLAUDE.md debt #5.',
    );
  }

  const passwordCount = await passwordField.count();
  if (passwordCount === 0) {
    throw new Error(
      `login(): Could not find password field #${opts.passwordItemId} on ${loginUrl} -- this app may use a ` +
        "custom authentication scheme, or a non-default password item id; see docs/tutorial.md's Authorization " +
        'section. Pass passwordItemId explicitly if this app just names its password field differently.',
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

  await waitForLoginSuccess(page, loginUrl, opts.success, opts.timeoutMs);
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
