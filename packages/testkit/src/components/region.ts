/**
 * Region wrapper -- PARTIAL / OPEN contract. Per docs/grammar-assumptions.md
 * "Still open": region identifiers matched NO probed DOM convention (verbatim
 * #id, R_ prefix, data-region-id, data-static-id) in the spike run, and
 * apex.region() itself is expected to miss for staticContent/form (non-widget)
 * regions even once that convention is known.
 *
 * Until the REGION DISCOVERY report lands, this wrapper does exactly one
 * thing: ask apex.region()'s own documented widget API whether it recognizes
 * the id, and say so honestly. It does NOT fall back to a guessed selector
 * (getElementById, [data-region-id], etc.) -- a guess here would violate the
 * "no raw selectors, no unverified assertions" rule this project is built on.
 * Do not add selector fallbacks to this file without first recording the
 * verified convention in docs/grammar-assumptions.md.
 */
import type { Page } from '@playwright/test';

export interface RegionProbe {
  id: string;
  /** True only if apex.region(id) resolved to a registered widget region. */
  isWidgetRegion: boolean;
}

/**
 * Probe whether apex.region(id) recognizes each id. Non-widget regions
 * (staticContent, form) are expected to report false -- that is not a
 * failure, it is the documented gap. Use this for diagnostics, not
 * pass/fail assertions, until the DOM convention is verified.
 */
export async function probeRegions(page: Page, ids: readonly string[]): Promise<RegionProbe[]> {
  return page.evaluate(
    (ids: readonly string[]) =>
      ids.map((id) => ({
        id,
        isWidgetRegion: typeof (window as any).apex?.region === 'function' && !!(window as any).apex.region(id),
      })),
    ids,
  );
}

/**
 * Refresh a widget region via the documented apex.region() API. Throws a
 * clear error (rather than silently no-op'ing) if the id is not a
 * recognized widget region -- see the module doc for why this doesn't fall
 * back to a guessed selector.
 */
export async function refreshRegion(page: Page, id: string): Promise<void> {
  const ok = await page.evaluate((id: string) => {
    const region = (window as any).apex?.region?.(id);
    if (!region) return false;
    region.refresh();
    return true;
  }, id);
  if (!ok) {
    throw new Error(
      `refreshRegion('${id}'): apex.region('${id}') did not resolve to a widget region. ` +
        'This region may be staticContent/form (apex.region() is not expected to see these), ' +
        'or the DOM convention for this region type is not yet verified -- see ' +
        'docs/grammar-assumptions.md "Still open" before assuming this is a bug.',
    );
  }
}
