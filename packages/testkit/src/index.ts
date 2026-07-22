/**
 * @apx/testkit -- Playwright fixtures + component helpers for APEX 26.1+
 * apps. Generated code (from @apx/testgen) and hand-written specs both
 * import from here; neither should contain raw selectors or duplicate this
 * logic locally (see the "treadmill rule" in apexlang-testkit-v0.1-plan.md
 * §3). When APEX's DOM changes, fix it once here.
 */
import { test as base } from '@playwright/test';
import { armConsoleGuard } from './fixtures/console-guard.js';

export { armConsoleGuard } from './fixtures/console-guard.js';
export { apexPageUrl, gotoApexPage, normalizeTitle } from './fixtures/session.js';
export { login, loginAndSaveState, type ApexCredentials, type LoginOptions } from './fixtures/auth.js';

export {
  ApexItem,
  itemsPresent,
  expectItemsPresent,
  getItemValue,
  setItemValue,
  itemRoundTrip,
  type ItemPresence,
} from './components/item.js';
export { probeRegions, refreshRegion, type RegionProbe } from './components/region.js';
export { buttonByLabel, clickButton } from './components/button.js';

export interface ApxFixtures {
  /** Auto-armed for every test; empty array means no console/page errors so far. */
  consoleErrors: string[];
}

/**
 * Drop-in replacement for `test` from '@playwright/test' that auto-arms the
 * console guard on every test's `page` fixture, so specs don't have to call
 * armConsoleGuard() themselves unless they need the finer-grained control
 * gotoApexPage() already gives them.
 */
export const test = base.extend<ApxFixtures>({
  consoleErrors: async ({ page }, use) => {
    const errors = armConsoleGuard(page);
    await use(errors);
  },
});

export { expect } from '@playwright/test';
