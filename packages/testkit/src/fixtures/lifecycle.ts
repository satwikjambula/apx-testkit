/**
 * Lifecycle-aware waits tied to APEX's own client events -- VERIFIED live,
 * replacing polling/waitForTimeout for region operations that fire one.
 *
 * Concrete motivating case (see docs/grammar-assumptions.md): calling
 * ApexFacetsRegion.fetchCounts() and immediately reading
 * getTotalResourceCount() is unreliable -- the count can still be null.
 * Confirmed live: `fetchCounts()` fires `apexbeforerefresh` then
 * `apexafterrefresh` DIRECTLY on the region's own DOM element (id equals
 * the region id) once the underlying AJAX round-trip completes. Waiting
 * for that event before reading resolved the flakiness deterministically
 * (~400ms observed, no polling loop needed).
 *
 * IMPORTANT: these are jQuery custom events, not native DOM CustomEvents --
 * confirmed live that `element.addEventListener('apexafterrefresh', ...)`
 * does NOT fire, only jQuery's own `.on()`/`.trigger()` system sees them.
 * This uses `apex.jQuery` (Oracle's documented stable reference), never a
 * bare global `$`/`jQuery`, to avoid noConflict issues.
 *
 * This is NOT a general replacement for every wait in this project. The
 * one `page.waitForTimeout(1000)` in generated "clean console" specs (via
 * gotoApexPage's callers) exists to let LATE, unpredictable async console
 * errors surface -- there is no single "nothing more will ever happen"
 * event to wait for instead, so that timeout stays. Event-based waits apply
 * specifically to "did operation X finish" questions, which is what
 * region method calls are.
 */
import type { Page } from '@playwright/test';
import { recordRegionCoverageTouch, type RegionCoverageIdentity } from './coverage.js';

/**
 * Call `apex.region(regionId)[method](...args)` and resolve once
 * `eventName` fires on that region's own DOM element (default:
 * `apexafterrefresh`, confirmed to fire for at least `refresh` and
 * `fetchCounts`). Throws if the region/method doesn't exist, or if the
 * event never fires within `timeoutMs` -- never silently resolves early.
 */
async function callKnownRegionMethodAndWaitForEvent(
  page: Page,
  regionId: string,
  method: string,
  options: { eventName?: string; args?: unknown[]; timeoutMs?: number } = {},
): Promise<void> {
  const { eventName = 'apexafterrefresh', args = [], timeoutMs = 10_000 } = options;
  await page.evaluate(
    ([regionId, method, eventName, args, timeoutMs]: [string, string, string, unknown[], number]) =>
      new Promise<void>((resolve, reject) => {
        const $ = (window as any).apex?.jQuery;
        const region = (window as any).apex?.region?.(regionId);
        if (!region) {
          reject(new Error(`region lifecycle operation: apex.region('${regionId}') did not resolve.`));
          return;
        }
        if (!$) {
          reject(new Error('region lifecycle operation: apex.jQuery is not available.'));
          return;
        }
        if (typeof region[method] !== 'function') {
          reject(new Error(`region lifecycle operation: apex.region('${regionId}').${method} is not a function.`));
          return;
        }
        const el = $(document.getElementById(regionId));
        let done = false;
        const timer = setTimeout(() => {
          if (done) return;
          done = true;
          el.off(eventName, onEvent);
          reject(
            new Error(
              `region lifecycle operation: '${eventName}' did not fire on region '${regionId}' ` +
                `within ${timeoutMs}ms after calling ${method}().`,
            ),
          );
        }, timeoutMs);
        function onEvent() {
          if (done) return;
          done = true;
          clearTimeout(timer);
          el.off(eventName, onEvent);
          resolve();
        }
        el.on(eventName, onEvent);
        region[method](...args);
      }),
    [regionId, method, eventName, args, timeoutMs] as [string, string, string, unknown[], number],
  );
}

/** Refresh a verified widget region and wait for its documented completion event. */
export async function refreshRegionAndWait(
  page: Page,
  regionId: string,
  timeoutMs = 10_000,
  identity?: RegionCoverageIdentity,
): Promise<void> {
  await callKnownRegionMethodAndWaitForEvent(page, regionId, 'refresh', {
    eventName: 'apexafterrefresh',
    timeoutMs,
  });
  recordRegionCoverageTouch(regionId, identity);
}

/** Fetch Faceted Search counts and wait for the verified completion event. */
export async function fetchFacetCountsAndWait(
  page: Page,
  regionId: string,
  timeoutMs = 10_000,
  identity?: RegionCoverageIdentity,
): Promise<void> {
  await callKnownRegionMethodAndWaitForEvent(page, regionId, 'fetchCounts', {
    eventName: 'apexafterrefresh',
    timeoutMs,
  });
  recordRegionCoverageTouch(regionId, identity);
}

/**
 * Wait for `eventName` to fire on a region's own DOM element, without
 * triggering anything yourself (e.g. the refresh was triggered by a button
 * click elsewhere). Call this BEFORE the action that will trigger the
 * event -- it attaches the listener first, then returns a promise that
 * resolves when the event fires, to avoid the race of the event firing
 * before you start listening.
 */
export async function waitForRegionEvent(
  page: Page,
  regionId: string,
  eventName: string = 'apexafterrefresh',
  timeoutMs = 10_000,
  identity?: RegionCoverageIdentity,
): Promise<void> {
  await page.evaluate(
    ([regionId, eventName, timeoutMs]: [string, string, number]) =>
      new Promise<void>((resolve, reject) => {
        const $ = (window as any).apex?.jQuery;
        if (!$) {
          reject(new Error('waitForRegionEvent: apex.jQuery is not available.'));
          return;
        }
        const el = $(document.getElementById(regionId));
        let done = false;
        const timer = setTimeout(() => {
          if (done) return;
          done = true;
          el.off(eventName, onEvent);
          reject(new Error(`waitForRegionEvent: '${eventName}' did not fire on region '${regionId}' within ${timeoutMs}ms.`));
        }, timeoutMs);
        function onEvent() {
          if (done) return;
          done = true;
          clearTimeout(timer);
          el.off(eventName, onEvent);
          resolve();
        }
        el.on(eventName, onEvent);
      }),
    [regionId, eventName, timeoutMs] as [string, string, number],
  );
  recordRegionCoverageTouch(regionId, identity);
}
