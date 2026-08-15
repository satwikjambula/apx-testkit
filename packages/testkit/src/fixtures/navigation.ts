/**
 * Navigation MODES for reaching an APEX page -- `direct-url` (bare
 * `page.goto()`, `gotoApexPage()`'s existing contract in session.ts),
 * `ui-navigation` (a real sequence of in-app link clicks), and `auto`
 * (decide between the two from static `.apx` security metadata, never a
 * live guess).
 *
 * Why this exists: `security.pageAccessProtection:
 * argumentsMustHaveChecksum` is CONFIRMED LIVE to make a bare
 * `page.goto()` silently redirect an AUTHENTICATED session to `/login`
 * (HTTP 200, not an error) -- even immediately after a successful login,
 * even to the exact same page just landed on. See
 * docs/quirks/26.1.json `page-access-protection-blocks-bare-navigation`.
 * `@apx/testgen` used to always emit a plain `gotoApexPage()` call
 * regardless of this flag, generating a guaranteed-to-fail test for any
 * authenticated, checksum-protected page. `assessNavigationSafety()`
 * below is what `@apx/testgen` now consults before deciding whether to
 * emit a normal test or a clear, explicit skip (see
 * packages/generator/src/lib.ts).
 */
import type { Page } from '@playwright/test';
import { armConsoleGuard } from './console-guard.js';
import { gotoApexPage } from './session.js';

export type NavigationMode = 'direct-url' | 'ui-navigation' | 'auto';

export interface NavigationSafetyAssessment {
  /** 'direct-url' if a bare gotoApexPage() call is confirmed/assumed safe; 'ui-navigation' if it is NOT. */
  mode: 'direct-url' | 'ui-navigation';
  reason: string;
}

/**
 * Decide whether a page is safe to reach via `gotoApexPage()`'s bare
 * goto, from static `.apx` security metadata alone -- this is a
 * generation-time/planning-time decision, made before any browser or
 * session exists, never a live probe.
 *
 * DIRECTLY CONFIRMED unsafe: `security.pageAccessProtection:
 * argumentsMustHaveChecksum` on a NON-PUBLIC (authenticated) page --
 * reproduced live, twice, on Sample Interactive Grids (Home page 1,
 * Basic Editing page 30 -- both require the app's `@apex-accounts`
 * scheme, neither declares `authentication: public`); the identical
 * `pageAccessProtection`+auth-scheme pattern is also confirmed present
 * on Sample Charts. See docs/quirks/26.1.json
 * `page-access-protection-blocks-bare-navigation`.
 *
 * INFERRED, not directly live-confirmed, for a PUBLIC page with the same
 * flag set: UX Pattern Catalog's own pages ALL declare
 * `pageAccessProtection: argumentsMustHaveChecksum` (including its
 * public ones), yet this project's own already-recorded evidence shows a
 * DIFFERENT failure mode on one of those exact pages -- p00420 (Data
 * Entry -- Drawer Form, `authentication: public`, checksum-protected)
 * returns a page-level HTTP 400 on a direct GET (see
 * docs/quirks/26.1.json `drawer-modal-pages-400`), not a redirect to
 * `/login`. A redirect-to-login would not be possible to distinguish
 * from a 400 if checksum enforcement had rejected the request before it
 * reached page-specific rendering -- the fact that a DIFFERENT,
 * page-specific error surfaced instead is real, if indirect, evidence
 * that checksum enforcement did not block this exact public page's bare
 * GET the way it blocks an authenticated one. This is treated here as a
 * REASONED INFERENCE, not an equally-strong claim to the directly
 * live-confirmed authenticated case above -- flagged explicitly so a
 * future live pass can re-confirm it directly (e.g. a fresh, cookie-less
 * `page.goto()` to a public+checksum page, checking it does NOT redirect
 * to `/login`) rather than this inference being silently treated as
 * equally certain.
 */
export function assessNavigationSafety(page: {
  readonly pageAccessProtection: string | null;
  readonly isPublic: boolean;
}): NavigationSafetyAssessment {
  if (page.pageAccessProtection === 'argumentsMustHaveChecksum' && !page.isPublic) {
    return {
      mode: 'ui-navigation',
      reason:
        "security.pageAccessProtection: argumentsMustHaveChecksum on a non-public page -- confirmed live that a bare " +
        'page.goto() silently redirects an authenticated session to /login (HTTP 200, not an error), even immediately ' +
        "after a successful login to the exact same page. See docs/quirks/26.1.json 'page-access-protection-blocks-bare-navigation'.",
    };
  }
  return { mode: 'direct-url', reason: 'No confirmed-or-inferred-unsafe navigation condition detected for this page.' };
}

/**
 * Navigate to a page via a real sequence of in-app link clicks -- the
 * confirmed-working alternative to `gotoApexPage()`'s bare goto for
 * checksum-protected pages. Each step is an ACCESSIBLE LINK NAME
 * (matched via `page.getByRole('link', { name: step })`), clicked in
 * order, waiting for a real navigation between each click -- exactly the
 * pattern already used by hand in `spike/tests/chart-demo.spec.ts` and
 * `spike/tests/interactive-grid-demo.spec.ts`, formalized into a single
 * reusable primitive instead of being copy-pasted per spec.
 *
 * This does NOT auto-derive the click path from a Flow Map -- the CALLER
 * supplies it (a hand-written spec that already knows the real
 * in-app path, per the two spike specs above). Auto-deriving a
 * navigation path from the Flow Map (`packages/generator/src/flow.ts`)
 * for this specific purpose is a real, deliberately scoped-out follow-up
 * -- see docs/ecosystem-roadmap.md -- not attempted by this function.
 */
export async function navigateViaUiPath(page: Page, steps: readonly string[]): Promise<string[]> {
  if (steps.length === 0) {
    throw new Error('navigateViaUiPath(): no steps supplied -- at least one link-click step is required.');
  }
  const errors = armConsoleGuard(page);
  for (const step of steps) {
    await page.getByRole('link', { name: step }).click();
    await page.waitForLoadState('domcontentloaded');
  }
  await page.waitForFunction(() => typeof (window as any).apex?.item === 'function');
  return errors;
}

/**
 * `auto` navigation: consult `assessNavigationSafety()` and either
 * delegate to a bare goto (safe) or FAIL LOUDLY with a specific,
 * actionable error (unsafe) -- never silently attempt a goto that is
 * already known to redirect away, and never guess a UI-click path on the
 * caller's behalf. Callers who already have a real, hand-verified click
 * path should use `navigateViaUiPath()` directly instead of this
 * function -- this exists for the "auto" case where the caller wants a
 * clear signal ONE WAY OR THE OTHER rather than writing the check
 * itself.
 */
export async function gotoApexPageAuto(page: Page, url: string, safety: NavigationSafetyAssessment): Promise<string[]> {
  if (safety.mode === 'ui-navigation') {
    throw new Error(
      `gotoApexPageAuto(): bare navigation to '${url}' is NOT safe -- ${safety.reason} Use navigateViaUiPath() ` +
        'with a real, hand-verified click path instead. Auto-deriving that path from the Flow Map is a scoped-out ' +
        'follow-up, not implemented here (see docs/ecosystem-roadmap.md).',
    );
  }
  return gotoApexPage(page, url);
}
