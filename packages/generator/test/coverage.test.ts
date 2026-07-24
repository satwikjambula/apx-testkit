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

  it('does NOT match a touch recorded under the export identifier when htmlDomId diverges', () => {
    // The exact bug shape: a stale/wrong touch keyed by the export
    // identifier must not count as a match once htmlDomId is set --
    // matching must be against the resolved runtime id specifically.
    const regions = [region({ identifier: 'projects', htmlDomId: 'projects_report' })];
    const touched = new Set(['projects']); // wrong key -- not the runtime id
    const result = summarizeRegions(regions, touched);
    expect(result.touched).toBe(0);
    expect(result.untouched).toEqual(['projects']);
  });

  it('keeps untrackable region types (tree/calendar/map) out of the touched/total count', () => {
    const regions = [region({ identifier: 'nav-tree', type: 'tree', htmlDomId: null })];
    const result = summarizeRegions(regions, new Set());
    expect(result.total).toBe(0);
    expect(result.untrackable).toEqual([{ identifier: 'nav-tree', type: 'tree' }]);
  });
});
