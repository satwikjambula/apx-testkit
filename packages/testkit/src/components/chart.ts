/**
 * Chart wrapper -- graduated from the `Chart` stub in unsupported.ts after
 * live verification against Oracle's own "Sample Charts" gallery app
 * corrected an earlier wrong finding.
 *
 * CORRECTION, for the record: docs/quirks/26.1.json previously claimed
 * `apex.region(id).widget()` returns `null` for chart regions (based on a
 * single region, "area1"). Re-tested live and found FALSE -- it returns a
 * real jQuery-wrapped element, confirmed independently on THREE chart
 * types (`area1`, `stackCategoryChart`, `pie1`), corroborated by the
 * Sample Charts app's OWN exported JS code calling
 * `apex.region("stackCategoryChart").widget().ojChart(...)` directly. The
 * dispatch path IS the classic jQuery UI widget-factory pattern used by
 * Interactive Grid (see interactive-grid.ts) -- `widget().ojChart(method,
 * ...args)` -- not a dead end.
 *
 * Confirmed live, on all three chart types above: the standard jQuery UI
 * widget-factory `option` method, used both as a getter (`ojChart('option')`
 * returns the full config object -- 25-42 keys depending on chart type,
 * including `type`/`series`/`groups`/`xAxis`/`legend`/`styleDefaults`;
 * `ojChart('option', 'type')` returns a single property) and as a SETTER
 * (`ojChart('option', 'selectionMode', 'multiple')` took effect
 * immediately, confirmed via a round-trip get-set-get, and returned the
 * widget itself for chaining -- the standard widget-factory setter
 * contract). This is a real, generic, useful API surface -- richer than
 * the single confirmed method (`getContextByNode`, returns null with no
 * arguments) this project had found before. `getProperty`/`getOption` are
 * still confirmed NOT valid method names on this widget (throws "no such
 * method") -- `option` is the real one; do not add those two.
 *
 * `refresh()` is NOT duplicated here -- the generic `ApexRegion.refresh()`
 * (region.ts, direct `apex.region(id).refresh()`, not through widget() at
 * all) was already confirmed live against a chart region and is inherited
 * as-is.
 *
 * Runtime static id caveat (unchanged): the id passed to this class's
 * constructor must be the REAL runtime static id, which can differ from
 * the `.apx` export's region identifier -- see `ApexRegion.htmlDomId`
 * (packages/parser/src/ast.ts) for the now-diagnosed root cause
 * (`advanced { htmlDomId: ... }`, when set, predicts `<htmlDomId>_jet`;
 * when absent, the runtime id is an APEX-internal auto-generated numeric
 * id with no corresponding field in the static export at all).
 *
 * Initialization race, confirmed live: JET chart widgets attach `ojChart`
 * ASYNCHRONOUSLY, after `page.waitForLoadState('domcontentloaded')`
 * resolves -- calling getOption()/setOption() immediately after
 * navigation intermittently threw "did not expose an ojChart()
 * widget-factory method" in this project's own spike spec until a readiness
 * wait was added. Wait for the actual precondition before constructing
 * this class, e.g.:
 * ```ts
 * await page.waitForFunction((id) => {
 *   const region = (window as any).apex?.region?.(id);
 *   return typeof region?.widget?.()?.ojChart === 'function';
 * }, id);
 * ```
 * See spike/tests/chart-demo.spec.ts for the working pattern. `refresh()`
 * (inherited, generic `ApexRegion` path) was NOT observed to race the same
 * way in testing, but has not been stress-tested for it either.
 */
import type { Page } from '@playwright/test';
import { ApexRegion } from './region.js';
import { recordCoverageTouch } from '../fixtures/coverage.js';

async function callChartWidget<T>(page: Page, id: string, method: string, args: unknown[] = []): Promise<T> {
  recordCoverageTouch('region', id);
  return page.evaluate(
    ([id, method, args]: [string, string, unknown[]]) => {
      const region = (window as any).apex?.region?.(id);
      if (!region) {
        throw new Error(
          `apex.region('${id}') did not resolve -- not a recognized widget region. Chart's runtime static id ` +
            `can differ from its .apx export identifier -- see ApexRegion.htmlDomId and docs/quirks/26.1.json ` +
            `'region-id-not-static-id' before assuming '${id}' is wrong.`,
        );
      }
      const widget = region.widget?.();
      if (typeof widget?.ojChart !== 'function') {
        throw new Error(
          `apex.region('${id}').widget() did not expose an ojChart() widget-factory method -- is '${id}' really a Chart region's runtime static id?`,
        );
      }
      return widget.ojChart(method, ...args);
    },
    [id, method, args] as [string, string, unknown[]],
  );
}

export class ApexChartRegion extends ApexRegion {
  protected invokeWidget<T>(method: string, ...args: unknown[]): Promise<T> {
    return callChartWidget<T>(this.page, this.id, method, args);
  }

  /** Confirmed live: the full chart config object (type/series/groups/xAxis/legend/styleDefaults/...). */
  getOption(): Promise<Record<string, unknown>>;
  /** Confirmed live: a single chart config property, e.g. getOption('type') -> 'pie'. */
  getOption(key: string): Promise<unknown>;
  getOption(key?: string): Promise<unknown> {
    return key === undefined ? this.invokeWidget('option') : this.invokeWidget('option', key);
  }

  /**
   * Confirmed live, round-trip verified (get -> set -> get reflected the
   * new value immediately). Client-side only -- does not persist across a
   * page reload, does not write back to the server.
   */
  setOption(key: string, value: unknown): Promise<void> {
    return this.invokeWidget('option', key, value);
  }
}
