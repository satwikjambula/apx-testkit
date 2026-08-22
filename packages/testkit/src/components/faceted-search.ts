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
 * Per-facet methods observed on the widget (`getFacetCount`,
 * `getFacetValueCounts`, `showFacet`, `hideFacet`) are deliberately NOT
 * exposed: their `facetId` parameter contract has not been exercised live.
 * They can join this class only after live verification and evidence-registry
 * updates, like every other public runtime wrapper.
 */
import type { Page } from '@playwright/test';
import type { RegionCoverageIdentity } from '../fixtures/coverage.js';
import { fetchFacetCountsAndWait } from '../fixtures/lifecycle.js';
import { internalCallRegionMethod } from './region.js';

export class ApexFacetsRegion {
  constructor(
    private readonly page: Page,
    public readonly id: string,
    private readonly coverageIdentity?: RegionCoverageIdentity,
  ) {}

  private invoke<T>(method: string, ...args: unknown[]): Promise<T> {
    return internalCallRegionMethod<T>(this.page, this.id, method, args, this.coverageIdentity);
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
   * `getTotalResourceCount()` is safe to call
   * immediately after this resolves, no polling required.
   */
  fetchCountsAndWait(timeoutMs = 10_000): Promise<void> {
    return fetchFacetCountsAndWait(this.page, this.id, timeoutMs, this.coverageIdentity);
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
