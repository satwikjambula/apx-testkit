/**
 * Region wrapper. Two tiers, deliberately kept separate:
 *
 * 1. `probeRegions`/`refreshRegion` -- PARTIAL / OPEN. Per
 *    docs/grammar-assumptions.md "Still open", region IDENTIFIERS (the
 *    .apx static id -> DOM/region id mapping) matched no probed convention
 *    for at least one region type in the ground-truth app. Do not assume a
 *    region's DOM id equals its .apx identifier.
 *
 * 2. `ApexRegion` -- VERIFIED generic apex.region() method surface. Once you
 *    HAVE a region's runtime id (however you obtained it -- e.g. read off
 *    the live DOM, not assumed from the .apx identifier), these methods are
 *    confirmed live, working, on TWO independently-typed regions in the
 *    ground-truth app (an Interactive Report and a Cards region):
 *    refresh, getSessionState, getCurrentRecordId/setCurrentRecordId,
 *    getRecordValues/setRecordValues, getSelectedValues/setSelectedValues,
 *    focus. `getViewName` is confirmed on Interactive Report only (absent
 *    on Cards) -- calling it against a region that doesn't implement it
 *    throws a clear error rather than silently returning undefined.
 *
 * All calls go through apex.region(id)'s own documented method dispatch --
 * never a raw selector, never a guessed DOM structure. `apex.region(id).call(action)`
 * (the generic action-dispatch API) was tested against an Interactive Report
 * region with several plausible action names (refresh, search, getViews,
 * getCurrentView, reset, ...) and rejected ALL of them with "Call not
 * supported." -- that action-dispatch path is NOT how this widget type is
 * driven; use the direct methods on the region object instead (see
 * cards.ts and faceted-search.ts, which extend this same pattern for the
 * additional methods those specific widget types expose).
 */
import type { Page } from '@playwright/test';
import { recordCoverageTouch } from '../fixtures/coverage.js';

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
  for (const id of ids) recordCoverageTouch('region', id);
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
  recordCoverageTouch('region', id);
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

/**
 * Low-level dispatcher shared by ApexRegion and its subclasses (cards.ts,
 * faceted-search.ts). Fails loudly with a specific reason -- region not
 * found vs. method not supported on this widget type -- never silently
 * returns undefined for a typo'd or unsupported method name.
 */
export async function callRegionMethod<T>(page: Page, id: string, method: string, args: unknown[] = []): Promise<T> {
  recordCoverageTouch('region', id);
  return page.evaluate(
    ([id, method, args]: [string, string, unknown[]]) => {
      const region = (window as any).apex?.region?.(id);
      if (!region) {
        throw new Error(`apex.region('${id}') did not resolve -- not a recognized widget region.`);
      }
      if (typeof region[method] !== 'function') {
        throw new Error(`apex.region('${id}').${method} is not a function on this widget type.`);
      }
      return region[method](...args);
    },
    [id, method, args] as [string, string, unknown[]],
  );
}

/**
 * Generic region wrapper for the VERIFIED apex.region() method surface
 * (see module doc). Use this directly for Interactive Report and other
 * generic regions; cards.ts/faceted-search.ts extend the same
 * callRegionMethod primitive with their widget-specific additions.
 */
export class ApexRegion {
  constructor(
    protected readonly page: Page,
    public readonly id: string,
  ) {}

  protected invoke<T>(method: string, ...args: unknown[]): Promise<T> {
    return callRegionMethod<T>(this.page, this.id, method, args);
  }

  refresh(): Promise<void> {
    return this.invoke('refresh');
  }

  /** Confirmed on Interactive Report; NOT present on Cards -- throws if unsupported. */
  getViewName(): Promise<string> {
    return this.invoke('getViewName');
  }

  getSessionState(): Promise<unknown> {
    return this.invoke('getSessionState');
  }

  getCurrentRecordId(): Promise<string | null> {
    return this.invoke('getCurrentRecordId');
  }

  setCurrentRecordId(recordId: string): Promise<void> {
    return this.invoke('setCurrentRecordId', recordId);
  }

  getRecordValues(): Promise<Record<string, unknown>> {
    return this.invoke('getRecordValues');
  }

  setRecordValues(values: Record<string, unknown>): Promise<void> {
    return this.invoke('setRecordValues', values);
  }

  getSelectedValues(): Promise<unknown[]> {
    return this.invoke('getSelectedValues');
  }

  setSelectedValues(values: unknown[]): Promise<void> {
    return this.invoke('setSelectedValues', values);
  }

  focus(): Promise<void> {
    return this.invoke('focus');
  }
}
