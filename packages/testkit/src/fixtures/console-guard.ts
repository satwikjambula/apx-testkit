/**
 * Console/page-error capture — VERIFIED contract (V5 in docs/grammar-assumptions.md).
 * This is plain Playwright event wiring, not an APEX-specific DOM convention,
 * so it carries no ledger risk.
 */
import type { Page } from '@playwright/test';

export function armConsoleGuard(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
}
