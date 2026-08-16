/**
 * Cards region wrapper -- VERIFIED live against a real Cards region
 * (UX Pattern Catalog, faceted-search-cards page). Extends ApexRegion with
 * the additional pagination/record/selection methods confirmed present on
 * this widget type. It extends `ApexDataRegion`, so the record/session
 * operations verified on Cards remain available; IR-only `getViewName()`
 * is absent from the type entirely.
 *
 * PageInfo shape confirmed live and reliable: { rowHeight, recordsPerRow,
 * firstOffset, lastOffset, pageSize, pageOffset, scrollOffset, viewOffset }.
 *
 * KNOWN BROKEN in this app, do not treat as working: `getRecords()` and
 * `getModel()` exist on the widget's method list but throw a genuine
 * runtime error --
 *   "TypeError: Cannot read properties of undefined (reading 'each')"
 *   (inside APEX's own modelViewBase.min.js)
 * -- both immediately after navigation AND after an awaited `refresh()`.
 * This is not a timing fluke (tested both ways); the underlying model
 * object this widget expects isn't present the way these methods assume.
 * They are preserved in the evidence ledger but deliberately excluded from
 * this public class. Confirmed-broken methods do not cross the runtime
 * evidence boundary.
 */
import { ApexDataRegion, internalCallRegionMethod } from './region.js';

export interface CardsPageInfo {
  rowHeight: number;
  recordsPerRow: number;
  firstOffset: number;
  lastOffset: number;
  pageSize: number;
  pageOffset: number;
  scrollOffset: number;
  viewOffset: number;
}

export class ApexCardsRegion extends ApexDataRegion {
  private invokeCards<T>(method: string, ...args: unknown[]): Promise<T> {
    return internalCallRegionMethod<T>(this.page, this.id, method, args, this.coverageIdentity);
  }

  getPageInfo(): Promise<CardsPageInfo> {
    return this.invokeCards('getPageInfo');
  }

  firstPage(): Promise<void> {
    return this.invokeCards('firstPage');
  }

  lastPage(): Promise<void> {
    return this.invokeCards('lastPage');
  }

  nextPage(): Promise<void> {
    return this.invokeCards('nextPage');
  }

  previousPage(): Promise<void> {
    return this.invokeCards('previousPage');
  }

  gotoPage(page: number): Promise<void> {
    return this.invokeCards('gotoPage', page);
  }

  loadMore(): Promise<void> {
    return this.invokeCards('loadMore');
  }

  getSelectedRecords(): Promise<unknown[]> {
    return this.invokeCards('getSelectedRecords');
  }

  setSelectedRecords(records: unknown[]): Promise<void> {
    return this.invokeCards('setSelectedRecords', records);
  }

  selectAll(): Promise<void> {
    return this.invokeCards('selectAll');
  }
}
