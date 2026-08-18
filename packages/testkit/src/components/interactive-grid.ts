/**
 * Interactive Grid wrapper -- this project's first LIVE ground truth for
 * Interactive Grid, verified against a real IG region ("Sample Interactive
 * Grids" gallery app, Basic Editing page, runtime region id `emp`).
 *
 * CRITICAL, project-specific caveat -- read before using this class: unlike
 * Interactive Report/Cards/Faceted Search (where the .apx export's region
 * identifier IS the runtime region id apex.region() expects -- confirmed),
 * Interactive Grid's runtime region id can DIFFER from the .apx export's
 * region identifier. Confirmed live: a region declared as
 * `region basic-editing (type: interactiveGrid ...)` in the export resolved
 * at runtime to region id "emp" (nested widget container `#emp_ig`) --
 * `apex.region('basic-editing')` returned null; `apex.region('emp')`
 * resolved correctly. This is real evidence for the previously-open
 * "region-id-not-static-id" question -- see docs/quirks/26.1.json. The
 * generator CANNOT reliably wire this component up from .apx metadata
 * alone; you must discover the runtime region id yourself (e.g. inspect the
 * DOM for a container whose id is `<runtimeRegionId>_ig`) and pass it in by hand.
 *
 * Dispatch goes through `apex.region(id).widget().interactiveGrid(method)`
 * -- the classic jQuery UI widget-factory pattern -- NOT the direct
 * `region[method]()` shape region.ts's generic ApexRegion methods use for
 * Interactive Report/Cards. Confirmed working: getActions, getViews,
 * getCurrentView, getCurrentViewId, getSelectedRecords. Confirmed REJECTED
 * (clear "no such method" error, not a silent failure): model, view,
 * getRegion -- do not add these without new evidence.
 *
 * Also confirmed live (a genuine, useful distinction from Interactive
 * Report/Cards): `apex.region(id).call(action)` DOES work for Interactive
 * Grid -- refresh/getSelectedRecords/getActions all succeeded through that
 * path too, unlike IR/Cards where region.ts documents ALL tested `.call()`
 * actions being rejected with "Call not supported." This class still uses
 * the widget-factory path since it's the one Oracle's own docs describe for
 * IG and the one tested in most depth here; `.call()` remains an
 * alternative worth exploring further, not yet built on.
 */
import type { Page } from '@playwright/test';
import { ApexRegion } from './region.js';
import { recordRegionCoverageTouch, type RegionCoverageIdentity } from '../fixtures/coverage.js';

async function callInteractiveGridWidget<T>(
  page: Page,
  id: string,
  method: string,
  args: unknown[] = [],
  identity?: RegionCoverageIdentity,
): Promise<T> {
  const result = await page.evaluate(
    ([id, method, args]: [string, string, unknown[]]) => {
      const region = (window as any).apex?.region?.(id);
      if (!region) {
        throw new Error(
          `apex.region('${id}') did not resolve -- not a recognized widget region. Interactive Grid's runtime ` +
            `region id often differs from its .apx export identifier -- see docs/quirks/26.1.json ` +
            `'region-id-not-static-id' before assuming '${id}' is wrong.`,
        );
      }
      const widget = region.widget?.();
      if (typeof widget?.interactiveGrid !== 'function') {
        throw new Error(
          `apex.region('${id}').widget() did not expose an interactiveGrid() widget-factory method -- is '${id}' really an Interactive Grid region's runtime region id?`,
        );
      }
      return widget.interactiveGrid(method, ...args);
    },
    [id, method, args] as [string, string, unknown[]],
  );
  recordRegionCoverageTouch(id, identity);
  return result;
}

export class ApexInteractiveGridRegion extends ApexRegion {
  protected invokeWidget<T>(method: string, ...args: unknown[]): Promise<T> {
    return callInteractiveGridWidget<T>(this.page, this.id, method, args, this.coverageIdentity);
  }

  /** Confirmed live: an apex.actions instance scoped to this grid (add/remove/invoke/toggle/get/set/...). */
  getActions(): Promise<Record<string, unknown>> {
    return this.invokeWidget('getActions');
  }

  /** Confirmed live: e.g. { grid, chart } -- the set of views this IG region supports. */
  getViews(): Promise<Record<string, unknown>> {
    return this.invokeWidget('getViews');
  }

  /** Confirmed live: e.g. 'grid' -- the id of the currently active view. */
  getCurrentViewId(): Promise<string> {
    return this.invokeWidget('getCurrentViewId');
  }

  /**
   * Confirmed live: returns the current view's controller object
   * (getSelectedRecords/setSelectedRecords/getActiveRecordId/
   * getContextRecord/gotoCell/init/destroy/... were observed on it via
   * property introspection, but only getSelectedRecords has itself been
   * called and confirmed -- see getSelectedRecords() below). Treat anything
   * else on this object as unverified until called and checked directly,
   * the same discipline `cards.ts` applies to `getRecords()`/`getModel()`.
   */
  getCurrentView(): Promise<Record<string, unknown>> {
    return this.invokeWidget('getCurrentView');
  }

  /** Confirmed live, called directly (not just observed as a property on getCurrentView()'s result). */
  getSelectedRecords(): Promise<unknown> {
    return this.invokeWidget('getSelectedRecords');
  }
}
