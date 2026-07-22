/**
 * Faceted Search region wrapper -- VERIFIED live against a real Facets
 * region (UX Pattern Catalog, faceted-search-cards page). This widget type
 * does NOT share ApexRegion's generic record/selection API (no
 * getCurrentRecordId/getSessionState observed on it) -- it's a standalone
 * wrapper over the same callRegionMethod primitive, not an ApexRegion
 * subclass.
 *
 * IMPORTANT lifecycle finding, NOW FIXED: `getTotalResourceCount()` can
 * return `null` if called too soon after navigation -- the facet counts are
 * fetched asynchronously. A single `await fetchCounts()` then read is NOT
 * reliable (confirmed in a genuinely fresh browser context, not a
 * warmed/reused tab). Use `fetchCountsAndWait()` below instead of
 * `fetchCounts()` -- it waits for the real `apexafterrefresh` event APEX
 * fires on this region's own element when the count fetch completes
 * (verified live, ~400ms observed), which is deterministic where polling
 * was a stopgap. See fixtures/lifecycle.ts for how the event wait works and
 * why it must use apex.jQuery, not a native addEventListener.
 *
 * getFacetCount/getFacetValueCounts/showFacet/hideFacet are typed here as
 * taking a facetId: string by naming convention -- that parameter shape is
 * INFERRED, not directly exercised live. Verify against your own app before
 * trusting the per-facet methods; getTotalResourceCount (after
 * fetchCountsAndWait())/clear/apply are the higher-confidence entry points.
 */
import type { Page } from '@playwright/test';
import { callRegionMethodAndWaitForEvent } from '../fixtures/lifecycle.js';
import { callRegionMethod } from './region.js';

export class ApexFacetsRegion {
  constructor(
    private readonly page: Page,
    public readonly id: string,
  ) {}

  private invoke<T>(method: string, ...args: unknown[]): Promise<T> {
    return callRegionMethod<T>(this.page, this.id, method, args);
  }

  refresh(): Promise<void> {
    return this.invoke('refresh');
  }

  refreshView(): Promise<void> {
    return this.invoke('refreshView');
  }

  focus(): Promise<void> {
    return this.invoke('focus');
  }

  /**
   * Confirmed live: returns a real count (e.g. 24), no arguments -- but
   * ONLY after the initial count fetch completes. Call `await
   * fetchCounts()` first (see module doc); calling this immediately after
   * navigation returned `null` in a fresh browser context.
   */
  getTotalResourceCount(): Promise<number | null> {
    return this.invoke('getTotalResourceCount');
  }

  fetchCounts(): Promise<void> {
    return this.invoke('fetchCounts');
  }

  /**
   * Preferred over bare `fetchCounts()` -- waits for the verified
   * `apexafterrefresh` event on this region before resolving, so
   * `getTotalResourceCount()`/`getFacetCount()` are safe to call
   * immediately after this resolves, no polling required.
   */
  fetchCountsAndWait(timeoutMs = 10_000): Promise<void> {
    return callRegionMethodAndWaitForEvent(this.page, this.id, 'fetchCounts', {
      eventName: 'apexafterrefresh',
      timeoutMs,
    });
  }

  /** Parameter shape inferred (facetId), not directly exercised live -- see module doc. */
  getFacetCount(facetId: string): Promise<number> {
    return this.invoke('getFacetCount', facetId);
  }

  /** Parameter shape inferred (facetId), not directly exercised live -- see module doc. */
  getFacetValueCounts(facetId: string): Promise<unknown> {
    return this.invoke('getFacetValueCounts', facetId);
  }

  /** Parameter shape inferred (facetId), not directly exercised live -- see module doc. */
  showFacet(facetId: string): Promise<void> {
    return this.invoke('showFacet', facetId);
  }

  /** Parameter shape inferred (facetId), not directly exercised live -- see module doc. */
  hideFacet(facetId: string): Promise<void> {
    return this.invoke('hideFacet', facetId);
  }

  clear(): Promise<void> {
    return this.invoke('clear');
  }

  clearFacets(): Promise<void> {
    return this.invoke('clearFacets');
  }

  reset(): Promise<void> {
    return this.invoke('reset');
  }

  apply(): Promise<void> {
    return this.invoke('apply');
  }

  enable(): Promise<void> {
    return this.invoke('enable');
  }

  disable(): Promise<void> {
    return this.invoke('disable');
  }

  lock(): Promise<void> {
    return this.invoke('lock');
  }

  unlock(): Promise<void> {
    return this.invoke('unlock');
  }
}
