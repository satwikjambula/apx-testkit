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
 *
 * Label uniqueness is NOT guaranteed (runtime-review P0 item 4) -- a real
 * app can have multiple buttons sharing a label (`Save`, `Save`, `Save &
 * Close`) or icon/template buttons whose accessible name isn't the `.apx`
 * label at all. `buttonByLabel()`'s locator itself is unchanged (still
 * label-based -- there is still no verified alternative for the general
 * case), but callers that DO know a button's semantic identity should
 * supply it via the optional `identity` parameter so coverage tracking
 * doesn't silently collapse two different, same-labeled buttons into one
 * entry (`@apx/testgen`'s generated click methods always supply it; see
 * page-object.ts, which also refuses to generate a click method at all
 * for buttons it can't disambiguate -- see its own module doc).
 */
import { expect, type Locator, type Page } from '@playwright/test';
import { recordButtonCoverageTouch, type ButtonCoverageIdentity } from '../fixtures/coverage.js';

/**
 * Locate a button by its .apx `label` via the accessibility tree. Records
 * a coverage touch carrying full semantic identity when `identity` is
 * supplied (pageId + the button's `.apx` `identifier` -- never the
 * label as identity, per DESIGN_GUARDRAILS.md); degrades to
 * label-as-identifier when omitted, for backward compatibility with
 * callers that don't have richer identity on hand.
 */
export function buttonByLabel(page: Page, label: string, identity?: ButtonCoverageIdentity): Locator {
  recordButtonCoverageTouch({ strategy: 'accessible-name', value: label }, identity);
  return page.getByRole('button', { name: label, exact: true });
}

export async function clickButton(page: Page, label: string, identity?: ButtonCoverageIdentity): Promise<void> {
  await buttonByLabel(page, label, identity).click();
}

/**
 * Locate a button by `advanced { htmlDomId: ... }` (`ApexButton.htmlDomId`)
 * instead of its label -- the disambiguation escape hatch for buttons
 * that share a label with another button on the same page, when a
 * distinct `htmlDomId` is available (see page-object.ts's duplicate-label
 * detection).
 *
 * STATUS: NOT LIVE-VERIFIED. Real, reproducible STATIC evidence exists --
 * 4 real buttons across 4 independent local-corpus apps (`apextogo`,
 * `concurrent-manager`, `sample-charts`, `sample-interactive-grids`) were
 * found this pass to set `advanced { htmlDomId }` (a genuine, in-place
 * CORRECTION of the earlier `button-id-not-static-id` finding, which had
 * claimed zero ever did -- see docs/quirks/26.1.json). The hypothesis
 * that `htmlDomId` becomes the literal DOM `id` attribute follows the
 * SAME `advanced` group/property name and EBNF production shape already
 * CONFIRMED for regions (ADR-003) -- but per ADR-002, structural analogy
 * is not live verification, and buttons have not been independently
 * checked (see spike/tests/button-htmldomid-demo.spec.ts, written and
 * gated, not yet run -- blocked on live access at the time this was
 * built). `@apx/testgen` deliberately does NOT auto-wire this into
 * generated click methods yet, precisely because a wrong id-based click
 * could silently click the WRONG element with no assertion to catch it
 * (a real, worse failure mode than skipping generation entirely) --
 * see report-column.ts's `classic-report-column-id-verbatim` for a
 * precedent of a superficially-similar id assumption that needed a real
 * scoping fix (a sticky-header duplicate-id collision) once actually
 * checked live. Use this function directly in a hand-written spec once
 * you have live access to confirm it, not as a default.
 */
export function buttonByHtmlDomId(page: Page, htmlDomId: string, identity?: ButtonCoverageIdentity): Locator {
  recordButtonCoverageTouch({ strategy: 'html-dom-id', value: htmlDomId }, identity);
  return page.locator(`#${htmlDomId}`);
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
