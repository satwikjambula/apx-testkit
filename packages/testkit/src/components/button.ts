/**
 * Button wrapper -- PARTIAL contract. Per docs/grammar-assumptions.md
 * "Still open", no button identifier/DOM convention has been verified yet
 * (BUTTON DISCOVERY report pending). Rather than guess a selector, this
 * wrapper locates buttons by accessible role + name (the .apx `label`
 * field), using Playwright's accessibility-tree locator -- not a raw CSS
 * selector, and not dependent on APEX's internal id/class scheme. This
 * degrades gracefully across whatever DOM convention APEX renders, at the
 * cost of only working when the label text is the accessible name (true for
 * ordinary buttons; not verified for icon-only or template-customized ones).
 *
 * Once the BUTTON DISCOVERY report lands and an id-based convention is
 * confirmed, prefer a static-id locator here and keep this as the fallback.
 */
import { expect, type Locator, type Page } from '@playwright/test';
import { recordCoverageTouch } from '../fixtures/coverage.js';

/**
 * Locate a button by its .apx `label` via the accessibility tree. Records
 * a coverage touch keyed by LABEL, not a static id (there is no verified
 * button-id convention yet -- see module doc); the coverage report cross-
 * references by label against the AST's button.label field.
 */
export function buttonByLabel(page: Page, label: string): Locator {
  recordCoverageTouch('button', label);
  return page.getByRole('button', { name: label, exact: true });
}

export async function clickButton(page: Page, label: string): Promise<void> {
  await buttonByLabel(page, label).click();
}

export interface ButtonPresence {
  label: string;
  ok: boolean;
}

/**
 * Check that every declared button label resolves to at least one real
 * button via the accessible-role locator above. A separate, non-mutating
 * presence check from `clickButton` -- but not new ground truth on its
 * own: `clickButton`'s click() already requires the same locator to
 * resolve to a visible, enabled, stable element (a strictly stronger
 * condition), and generated click methods have already run live as part
 * of this project's full-suite verification. Presence is logically
 * subsumed by that -- this exists for pages whose buttons are declared
 * but never clicked by a generated smoke test, to still get a signal.
 */
export async function buttonsPresent(page: Page, labels: readonly string[]): Promise<ButtonPresence[]> {
  const out: ButtonPresence[] = [];
  for (const label of labels) {
    const ok = (await buttonByLabel(page, label).count()) > 0;
    out.push({ label, ok });
  }
  return out;
}

/** Assert every declared button label resolves; fails with the list of missing labels. */
export async function expectButtonsPresent(page: Page, labels: readonly string[]): Promise<void> {
  const presence = await buttonsPresent(page, labels);
  const missing = presence.filter((p) => !p.ok).map((p) => p.label);
  expect(missing, 'buttons declared in .apx but absent at runtime').toEqual([]);
}
