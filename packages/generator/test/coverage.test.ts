import { describe, expect, it } from 'vitest';
import type { ApexRegion } from '@apx/parser';
import { summarizeRegions } from '../src/coverage.js';

/**
 * Regression test for a real bug: `recordCoverageTouch('region', id)` logs
 * the RUNTIME id (per ADR-003, `region.htmlDomId ?? region.identifier`),
 * but `summarizeRegions` used to match touches only against
 * `region.identifier` -- silently under-reporting coverage for any region
 * with an `htmlDomId` override, confirmed on real Chart/Interactive Grid/
 * Interactive Report regions. Confirmed live against real touch logs
 * captured this session (spike/tests/chart-demo.spec.ts,
 * interactive-grid-demo.spec.ts) before this fix; see
 * docs/grammar-assumptions.md for the full story.
 *
 * UPDATE (runtime-review P0 item 1, region resolution): now that
 * `@apx/testkit`'s `resolveRegion()` (packages/testkit/src/components/
 * resolve-region.ts) resolves a region's runtime id LIVE, trying htmlDomId
 * then the export identifier in order, a touch can legitimately be
 * recorded under EITHER candidate -- not just whichever one the AST's
 * static `htmlDomId ?? identifier` field would statically predict. This
 * matters when `htmlDomId` is set but does not actually resolve at
 * runtime (e.g. stale metadata) and resolveRegion() genuinely falls back
 * to the export identifier -- that is a real, successful exercise of the
 * region, and must count as touched. `summarizeRegions` was corrected in
 * place to check both candidates a region's AST implies (see its own doc
 * comment), superseding the narrower "does NOT match... once htmlDomId is
 * set" test below, which is now split into two: the still-true "wrong key
 * entirely" case, and the new "genuine live fallback" case.
 */

function region(overrides: Partial<ApexRegion>): ApexRegion {
  return {
    identifier: 'r',
    name: null,
    type: 'chart',
    source: null,
    calendarSettings: null,
    chartSettings: null,
    htmlDomId: null,
    items: [],
    buttons: [],
    loc: { file: 'p1.apx', line: 1 },
    raw: {},
    ...overrides,
  };
}

describe('summarizeRegions', () => {
  it('matches a touch recorded under htmlDomId back to the export identifier', () => {
    const regions = [region({ identifier: 'pie-chart', htmlDomId: 'pie1' })];
    // Recorded exactly as @apx/testkit's ApexChartRegion would -- keyed by
    // the runtime id ('pie1'), not the export identifier ('pie-chart').
    const touched = new Set(['pie1']);
    const result = summarizeRegions(regions, touched);
    expect(result.touched).toBe(1);
    expect(result.untouched).toEqual([]);
  });

  it('reports untouched (export identifier) when htmlDomId is set but never touched', () => {
    const regions = [region({ identifier: 'pie-chart', htmlDomId: 'pie1' })];
    const touched = new Set<string>(); // nothing touched
    const result = summarizeRegions(regions, touched);
    expect(result.touched).toBe(0);
    expect(result.untouched).toEqual(['pie-chart']);
  });

  it('falls back to the export identifier when htmlDomId is absent', () => {
    const regions = [region({ identifier: 'projects', htmlDomId: null })];
    const touched = new Set(['projects']);
    const result = summarizeRegions(regions, touched);
    expect(result.touched).toBe(1);
    expect(result.untouched).toEqual([]);
  });

  it('does NOT match a touch recorded under a completely unrelated key', () => {
    // A touch keyed by neither the htmlDomId nor the export identifier is
    // never a match, regardless of which candidates the region has.
    const regions = [region({ identifier: 'projects', htmlDomId: 'projects_report' })];
    const touched = new Set(['some-other-region-entirely']);
    const result = summarizeRegions(regions, touched);
    expect(result.touched).toBe(0);
    expect(result.untouched).toEqual(['projects']);
  });

  it('DOES match a touch recorded under the export identifier even when htmlDomId is set (resolveRegion live fallback)', () => {
    // CORRECTED: an earlier version of this test asserted the opposite --
    // that an export-identifier touch must NOT count once htmlDomId is
    // set. That was true under the OLD static single-candidate scheme,
    // but resolveRegion() (item 1 of the runtime-review pass) can
    // genuinely fall back to the export identifier live, if the AST's
    // htmlDomId candidate does not actually resolve against apex.region()
    // at runtime (e.g. stale metadata) -- a real, successful exercise of
    // the region that must count as touched, not be misreported as
    // untouched just because it didn't match the statically-preferred
    // candidate.
    const regions = [region({ identifier: 'projects', htmlDomId: 'projects_report' })];
    const touched = new Set(['projects']); // the export identifier -- the fallback candidate actually resolved
    const result = summarizeRegions(regions, touched);
    expect(result.touched).toBe(1);
    expect(result.untouched).toEqual([]);
  });

  it('keeps untrackable region types (tree/calendar/map) out of the touched/total count', () => {
    const regions = [region({ identifier: 'nav-tree', type: 'tree', htmlDomId: null })];
    const result = summarizeRegions(regions, new Set());
    expect(result.total).toBe(0);
    expect(result.untrackable).toEqual([{ identifier: 'nav-tree', type: 'tree' }]);
  });
});
