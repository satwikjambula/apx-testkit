/**
 * Region wrapper. Two tiers, deliberately kept separate:
 *
 * 1. `probeRegions`/`refreshRegion` -- PARTIAL / OPEN. Per
 *    docs/grammar-assumptions.md "Still open", region IDENTIFIERS (the
 *    APEXlang identifier -> runtime region id mapping) matched no probed convention
 *    for at least one region type in the ground-truth app. Do not assume a
 *    region's DOM id equals its .apx identifier.
 *
 * 2. Public wrappers are capability-scoped: `ApexRegion` exposes only the
 *    cross-region `refresh()` contract; `ApexDataRegion` adds record/session
 *    operations verified on Interactive Report and Cards; and
 *    `ApexInteractiveReportRegion` adds IR-only `getViewName()`. The raw
 *    string method dispatcher is package-internal, so consumers cannot
 *    bypass the evidence boundary with an arbitrary method name.
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
import { expect, type Page } from '@playwright/test';
import {
  recordRegionCoverageTouch,
  type RegionCoverageIdentity,
} from '../fixtures/coverage.js';

export interface RegionProbe {
  id: string;
  /** True only if apex.region(id) resolved to a registered widget region. */
  isWidgetRegion: boolean;
}

export interface RegionProbeTarget {
  id: string;
  identity?: RegionCoverageIdentity;
}

/**
 * Probe whether apex.region(id) recognizes each id. Non-widget regions
 * (staticContent, form) are expected to report false -- that is not a
 * failure, it is the documented gap. Use this for diagnostics, not
 * pass/fail assertions, until the DOM convention is verified.
 */
export async function probeRegions(
  page: Page,
  targets: readonly (string | RegionProbeTarget)[],
  pageId?: number,
): Promise<RegionProbe[]> {
  const normalized = targets.map((target) =>
    typeof target === 'string' ? { id: target, identity: pageId === undefined ? undefined : { pageId, identifier: target } } : target,
  );
  const probes = await page.evaluate(
    (ids: readonly string[]) =>
      ids.map((id) => ({
        id,
        isWidgetRegion: typeof (window as any).apex?.region === 'function' && !!(window as any).apex.region(id),
      })),
    normalized.map((target) => target.id),
  );
  for (const [index, probe] of probes.entries()) {
    if (probe.isWidgetRegion) recordRegionCoverageTouch(probe.id, normalized[index]?.identity);
  }
  return probes;
}

/**
 * Assert that every given region id resolves as a real `apex.region()`
 * widget region. Unlike `probeRegions` above (diagnostics-only, because
 * the .apx-identifier-to-runtime-id mapping was an open question for
 * region types generally), this is a safe pass/fail assertion for
 * `interactiveReport`/`cards`/`facetedSearch` region types specifically
 * -- ALL THREE are confirmed live to resolve as widget regions
 * (region.ts module doc; faceted-search.ts's own "VERIFIED live" note).
 * Do NOT call this against `form`/`staticContent` regions -- those are
 * confirmed NOT to resolve as widget regions at all, by design, not a
 * gap.
 *
 * CRITICAL: the `ids` passed in must already be resolved per ADR-003's
 * layered strategy (`region.htmlDomId ?? region.identifier`) -- do NOT
 * assume the `.apx` export identifier is always safe to pass directly.
 * This was originally assumed true for these three region types "in
 * every app checked so far" and found WRONG: a real interactiveReport
 * region (sample-charts, export identifier `projects`) resolves at
 * runtime as `projects_report` (its `advanced { htmlDomId: ... }`
 * value), confirmed live -- `apex.region('projects')` is `false`,
 * `apex.region('projects_report')` is `true`. `htmlDomId` is a universal
 * mechanism across region types, not something gated to Chart/
 * Interactive Grid -- see ADR-003 and `docs/quirks/26.1.json`
 * `region-id-not-static-id` for the full correction. The generator
 * resolves this per-region before calling this function; hand-written
 * specs must do the same.
 */
export async function expectRegionsResolve(
  page: Page,
  targets: readonly (string | RegionProbeTarget)[],
  pageId?: number,
): Promise<void> {
  const probes = await probeRegions(page, targets, pageId);
  const unresolved = probes.filter((p) => !p.isWidgetRegion).map((p) => p.id);
  expect(unresolved, 'regions expected to resolve as apex.region() widget regions but did not').toEqual([]);
}

/**
 * Refresh a widget region via the documented apex.region() API. Throws a
 * clear error (rather than silently no-op'ing) if the id is not a
 * recognized widget region -- see the module doc for why this doesn't fall
 * back to a guessed selector.
 */
export async function refreshRegion(
  page: Page,
  id: string,
  identity?: RegionCoverageIdentity | number,
): Promise<void> {
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
  recordRegionCoverageTouch(
    id,
    typeof identity === 'number' ? { pageId: identity, identifier: id } : identity,
  );
}

/**
 * Low-level dispatcher shared by ApexRegion and its subclasses (cards.ts,
 * faceted-search.ts). Fails loudly with a specific reason -- region not
 * found vs. method not supported on this widget type -- never silently
 * returns undefined for a typo'd or unsupported method name.
 */
/** @internal Package-only dispatcher. Never export from the package barrel. */
export async function internalCallRegionMethod<T>(
  page: Page,
  id: string,
  method: string,
  args: unknown[] = [],
  identity?: RegionCoverageIdentity | number,
): Promise<T> {
  const result = await page.evaluate(
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
  recordRegionCoverageTouch(
    id,
    typeof identity === 'number' ? { pageId: identity, identifier: id } : identity,
  );
  return result;
}

/**
 * Generic region wrapper. Only refresh is exposed here because it is the
 * sole operation verified across the general widget-region types wrapped
 * by this package. Type-specific capabilities live on narrower classes.
 */
export class ApexRegion {
  protected readonly page: Page;
  public readonly id: string;
  public readonly pageId?: number;
  protected readonly coverageIdentity?: RegionCoverageIdentity;

  constructor(page: Page, id: string, identity?: RegionCoverageIdentity | number) {
    this.page = page;
    this.id = id;
    this.pageId = typeof identity === 'number' ? identity : identity?.pageId;
    this.coverageIdentity =
      typeof identity === 'number' ? { pageId: identity, identifier: id } : identity;
  }

  refresh(): Promise<void> {
    return internalCallRegionMethod<void>(this.page, this.id, 'refresh', [], this.coverageIdentity);
  }
}

/** Record/session operations verified on Interactive Report and Cards. */
export class ApexDataRegion extends ApexRegion {
  private invokeData<T>(method: string, ...args: unknown[]): Promise<T> {
    return internalCallRegionMethod<T>(this.page, this.id, method, args, this.coverageIdentity);
  }

  getSessionState(): Promise<unknown> {
    return this.invokeData('getSessionState');
  }

  getCurrentRecordId(): Promise<string | null> {
    return this.invokeData('getCurrentRecordId');
  }

  setCurrentRecordId(recordId: string): Promise<void> {
    return this.invokeData('setCurrentRecordId', recordId);
  }

  getRecordValues(): Promise<Record<string, unknown>> {
    return this.invokeData('getRecordValues');
  }

  setRecordValues(values: Record<string, unknown>): Promise<void> {
    return this.invokeData('setRecordValues', values);
  }

  getSelectedValues(): Promise<unknown[]> {
    return this.invokeData('getSelectedValues');
  }

  setSelectedValues(values: unknown[]): Promise<void> {
    return this.invokeData('setSelectedValues', values);
  }

  focus(): Promise<void> {
    return this.invokeData('focus');
  }
}

/** Interactive Report-only direct region APIs. */
export class ApexInteractiveReportRegion extends ApexDataRegion {
  getViewName(): Promise<string> {
    return internalCallRegionMethod<string>(this.page, this.id, 'getViewName', [], this.coverageIdentity);
  }
}
