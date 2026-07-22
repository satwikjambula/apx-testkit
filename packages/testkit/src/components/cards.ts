/**
 * Cards region wrapper -- VERIFIED live against a real Cards region
 * (UX Pattern Catalog, faceted-search-cards page). Extends ApexRegion with
 * the additional pagination/record/selection methods confirmed present on
 * this widget type (region.ts's generic methods are also available: refresh,
 * getCurrentRecordId, getSessionState, etc. -- getViewName is NOT present on
 * Cards, unlike Interactive Report; calling it throws per ApexRegion's
 * fail-loud contract).
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
 * Left in the API surface (rather than removed) so the failure is visible
 * and typed, not silently unavailable -- but treat any use of these two
 * methods as needing its own investigation, not a verified contract like
 * the rest of this class.
 */
import { ApexRegion } from './region.js';

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

export class ApexCardsRegion extends ApexRegion {
  getPageInfo(): Promise<CardsPageInfo> {
    return this.invoke('getPageInfo');
  }

  firstPage(): Promise<void> {
    return this.invoke('firstPage');
  }

  lastPage(): Promise<void> {
    return this.invoke('lastPage');
  }

  nextPage(): Promise<void> {
    return this.invoke('nextPage');
  }

  previousPage(): Promise<void> {
    return this.invoke('previousPage');
  }

  gotoPage(page: number): Promise<void> {
    return this.invoke('gotoPage', page);
  }

  loadMore(): Promise<void> {
    return this.invoke('loadMore');
  }

  /** KNOWN BROKEN in this app -- see module doc. Throws, does not return records. */
  getRecords(): Promise<unknown[]> {
    return this.invoke('getRecords');
  }

  /** KNOWN BROKEN in this app -- see module doc. */
  getModel(): Promise<unknown> {
    return this.invoke('getModel');
  }

  getSelectedRecords(): Promise<unknown[]> {
    return this.invoke('getSelectedRecords');
  }

  setSelectedRecords(records: unknown[]): Promise<void> {
    return this.invoke('setSelectedRecords', records);
  }

  selectAll(): Promise<void> {
    return this.invoke('selectAll');
  }
}
