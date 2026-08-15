import { describe, expect, it } from 'vitest';
import { login } from '../src/fixtures/auth.js';

/**
 * login() dispatches through Playwright's real Page/Locator APIs
 * (`page.locator()`, `page.getByRole()`, `page.waitForURL()`,
 * `Locator.waitFor()`). These tests fake that boundary with a minimal
 * Page/Locator stand-in that mimics the real semantics closely enough to
 * exercise login()'s own control flow (field-existence checks, submit
 * dispatch, and -- the P1 hardening this suite is regression coverage
 * for -- the configurable `options.success` condition), without needing a
 * live browser or real credentials. See spike/tests/auth-login-verify.spec.ts
 * for the live counterpart (env-var gated, not run by this suite).
 */

interface FakeField {
  exists: boolean;
  count: () => Promise<number>;
  fill: (value: string) => Promise<void>;
  press: (key: string) => Promise<void>;
}

interface FakePageConfig {
  loginUrl: string;
  hasUsernameField?: boolean;
  hasPasswordField?: boolean;
  hasSubmitButton?: boolean;
  /** If set, the URL changes to this value `redirectDelayMs` after submit. Omit to simulate a login that never redirects. */
  redirectTo?: string;
  redirectDelayMs?: number;
}

function createFakePage(config: FakePageConfig) {
  let currentUrl = config.loginUrl;
  const filled: { username?: string; password?: string } = {};
  const events: string[] = [];

  function triggerSubmit() {
    events.push('submit');
    if (config.redirectTo === undefined) return;
    const delay = config.redirectDelayMs ?? 0;
    setTimeout(() => {
      currentUrl = config.redirectTo!;
    }, delay);
  }

  const usernameField: FakeField = {
    exists: config.hasUsernameField ?? true,
    count: async () => (usernameField.exists ? 1 : 0),
    fill: async (value: string) => {
      filled.username = value;
    },
    press: async () => {},
  };

  const passwordField: FakeField = {
    exists: config.hasPasswordField ?? true,
    count: async () => (passwordField.exists ? 1 : 0),
    fill: async (value: string) => {
      filled.password = value;
    },
    press: async (key: string) => {
      if (key === 'Enter') triggerSubmit();
    },
  };

  const submitButton = {
    exists: config.hasSubmitButton ?? true,
    count: async () => (submitButton.exists ? 1 : 0),
    first: () => ({
      click: async () => {
        triggerSubmit();
      },
    }),
  };

  function matchesUrlPattern(matcher: string | RegExp | ((url: URL) => boolean), url: string): boolean {
    if (typeof matcher === 'function') return matcher(new URL(url));
    if (matcher instanceof RegExp) return matcher.test(url);
    return url.includes(matcher);
  }

  const page = {
    url: () => currentUrl,
    locator: (selector: string) => {
      if (selector === `#${'P101_USERNAME'}`) return usernameField;
      if (selector === `#${'P101_PASSWORD'}`) return passwordField;
      throw new Error(`fakePage: unexpected selector ${selector}`);
    },
    getByRole: (_role: string, _opts: { name: string | RegExp }) => submitButton,
    waitForURL: async (matcher: string | RegExp | ((url: URL) => boolean), opts: { timeout: number }) => {
      const deadline = Date.now() + opts.timeout;
      for (;;) {
        if (matchesUrlPattern(matcher, currentUrl)) return;
        if (Date.now() >= deadline) throw new Error(`fakePage: waitForURL timed out at ${currentUrl}`);
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
    },
    waitForLoadState: async () => {},
    filled,
    events,
  };

  return page;
}

function createFakeLocator(config: { becomesVisibleAfterMs?: number }) {
  const createdAt = Date.now();
  return {
    waitFor: async (opts: { state: string; timeout: number }) => {
      if (config.becomesVisibleAfterMs === undefined) {
        throw new Error('fakeLocator: never becomes visible');
      }
      const target = createdAt + config.becomesVisibleAfterMs;
      const deadline = Date.now() + opts.timeout;
      for (;;) {
        if (Date.now() >= target) return;
        if (Date.now() >= deadline) throw new Error('fakeLocator: waitFor timed out');
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
    },
  };
}

describe('login() -- field-existence checks', () => {
  it('throws a specific, actionable error naming the missing username field id', async () => {
    const page = createFakePage({ loginUrl: 'https://host/login', hasUsernameField: false });
    await expect(login(page as any, { username: 'u', password: 'p' })).rejects.toThrow(/#P101_USERNAME not found/);
  });

  it('throws a specific, actionable error naming the missing password field id -- checked BEFORE any fill/submit', async () => {
    const page = createFakePage({ loginUrl: 'https://host/login', hasPasswordField: false });
    await expect(login(page as any, { username: 'u', password: 'p' })).rejects.toThrow(
      /Could not find password field #P101_PASSWORD/,
    );
    // Never got as far as filling the username field or submitting.
    expect(page.filled.username).toBeUndefined();
    expect(page.events).toEqual([]);
  });

  it('mentions the custom-authentication-scheme possibility and points at docs/tutorial.md', async () => {
    const page = createFakePage({ loginUrl: 'https://host/login', hasPasswordField: false });
    await expect(login(page as any, { username: 'u', password: 'p' })).rejects.toThrow(
      /custom authentication scheme.*docs\/tutorial\.md/s,
    );
  });
});

describe('login() -- default success condition (backward-compatible, weaker signal)', () => {
  it('succeeds once the URL changes away from the login URL', async () => {
    const page = createFakePage({
      loginUrl: 'https://host/login',
      redirectTo: 'https://host/home',
      redirectDelayMs: 10,
    });
    await login(page as any, { username: 'u', password: 'p' }, { timeoutMs: 500 });
    expect(page.url()).toBe('https://host/home');
  });

  it('throws if the URL never changes within timeoutMs', async () => {
    const page = createFakePage({ loginUrl: 'https://host/login' });
    await expect(login(page as any, { username: 'u', password: 'p' }, { timeoutMs: 50 })).rejects.toThrow(
      /URL still https:\/\/host\/login after 50ms/,
    );
  });
});

describe('login() -- options.success: url', () => {
  it('succeeds only once the URL matches the given pattern, not merely any change', async () => {
    const page = createFakePage({
      loginUrl: 'https://host/login',
      redirectTo: 'https://host/mfa',
      redirectDelayMs: 5,
    });
    await expect(
      login(page as any, { username: 'u', password: 'p' }, { timeoutMs: 100, success: { url: /\/home/ } }),
    ).rejects.toThrow(/URL never matched options\.success\.url/);
  });

  it('succeeds once the URL matches the given RegExp', async () => {
    const page = createFakePage({
      loginUrl: 'https://host/login',
      redirectTo: 'https://host/home?welcome=1',
      redirectDelayMs: 5,
    });
    await login(page as any, { username: 'u', password: 'p' }, { timeoutMs: 500, success: { url: /\/home/ } });
    expect(page.url()).toBe('https://host/home?welcome=1');
  });
});

describe('login() -- options.success: locator', () => {
  it('succeeds once the locator becomes visible', async () => {
    const page = createFakePage({ loginUrl: 'https://host/login' });
    const locator = createFakeLocator({ becomesVisibleAfterMs: 10 });
    await login(page as any, { username: 'u', password: 'p' }, { timeoutMs: 500, success: { locator: locator as any } });
  });

  it('throws if the locator never becomes visible within timeoutMs', async () => {
    const page = createFakePage({ loginUrl: 'https://host/login' });
    const locator = createFakeLocator({});
    await expect(
      login(page as any, { username: 'u', password: 'p' }, { timeoutMs: 50, success: { locator: locator as any } }),
    ).rejects.toThrow(/options\.success\.locator never became visible/);
  });
});

describe('login() -- options.success: custom predicate', () => {
  it('succeeds once the predicate returns true', async () => {
    const page = createFakePage({
      loginUrl: 'https://host/login',
      redirectTo: 'https://host/home',
      redirectDelayMs: 10,
    });
    await login(
      page as any,
      { username: 'u', password: 'p' },
      { timeoutMs: 500, success: async (p) => p.url() === 'https://host/home' },
    );
  });

  it('throws with a specific message if the predicate never returns true within timeoutMs', async () => {
    const page = createFakePage({ loginUrl: 'https://host/login' });
    await expect(
      login(page as any, { username: 'u', password: 'p' }, { timeoutMs: 50, success: async () => false }),
    ).rejects.toThrow(/custom options\.success predicate never returned true/);
  });
});
