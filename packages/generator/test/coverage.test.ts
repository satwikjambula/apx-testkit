import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ApexButton, ApexRegion } from '@apx/parser';
import { computeCoverage, summarizeButtons, summarizeRegions } from '../src/coverage.js';

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

function button(overrides: Partial<ApexButton>): ApexButton {
  return {
    identifier: 'b',
    label: null,
    action: null,
    target: null,
    url: null,
    htmlDomId: null,
    loc: { file: 'p1.apx', line: 1 },
    raw: {},
    ...overrides,
  };
}

/**
 * Regression test for the P0 item 4 fix (runtime-review): recording a
 * button touch keyed by LABEL alone silently collapsed two DIFFERENT
 * buttons sharing a label into indistinguishable coverage -- confirmed
 * on real exports this pass (UX Pattern Catalog p00120 "Dashboard
 * Advanced" has FIVE buttons all labeled "View Details"). `summarizeButtons`
 * matches by `(pageId, identifier)` when a touch carries full identity,
 * falling back to label-matching only for identity-free (degraded)
 * touches -- see coverage.ts's own module doc.
 */
describe('summarizeButtons', () => {
  it('two DIFFERENT same-labeled buttons on the same page are tracked SEPARATELY, not collapsed', () => {
    const buttons = [
      button({ identifier: 'save_employee', label: 'Save' }),
      button({ identifier: 'save_request', label: 'Save' }),
    ];
    // Only SAVE_EMPLOYEE was actually exercised.
    const touches = [{ kind: 'button' as const, identifier: 'save_employee', pageId: 3 }];
    const result = summarizeButtons(buttons, 3, touches);
    expect(result.touched).toBe(1);
    expect(result.untouched).toEqual(['save_request']);
    // The exact bug this replaces: label-based matching would have
    // reported BOTH as touched (or both untouched), never one of each.
  });

  it('does not match a touch recorded for the same identifier on a DIFFERENT page', () => {
    const buttons = [button({ identifier: 'save', label: 'Save' })];
    const touches = [{ kind: 'button' as const, identifier: 'save', pageId: 999 }]; // different page
    const result = summarizeButtons(buttons, 3, touches);
    expect(result.touched).toBe(0);
    expect(result.untouched).toEqual(['save']);
  });

  it('falls back to label-matching for identity-free (pageId: null) touches -- backward compatible with older hand-written specs', () => {
    const buttons = [button({ identifier: 'save_employee', label: 'Save' })];
    const touches = [{ kind: 'button' as const, identifier: 'Save', pageId: null }]; // degraded legacy touch without identity
    const result = summarizeButtons(buttons, 3, touches);
    expect(result.touched).toBe(1);
    expect(result.untouched).toEqual([]);
  });

  it('does not apply an ambiguous identity-free label touch when a global label count is provided', () => {
    const buttons = [button({ identifier: 'save_employee', label: 'Save' })];
    const touches = [{ kind: 'button' as const, identifier: 'Save', pageId: null }];
    const result = summarizeButtons(buttons, 3, touches, new Map([['Save', 2]]));
    expect(result.touched).toBe(0);
    expect(result.untouched).toEqual(['save_employee']);
  });

  it('excludes unlabeled buttons from total/touched (nothing safe to locate them by)', () => {
    const buttons = [button({ identifier: 'icon-only', label: null })];
    const result = summarizeButtons(buttons, 1, []);
    expect(result.total).toBe(0);
  });

  it('untouched lists the semantic identifier, never the label', () => {
    const buttons = [button({ identifier: 'SAVE_EMPLOYEE', label: 'Save' })];
    const result = summarizeButtons(buttons, 1, []);
    expect(result.untouched).toEqual(['SAVE_EMPLOYEE']);
  });
});

describe('computeCoverage touch identity validation', () => {
  function writeTestManifest(dir: string): void {
    mkdirSync(join(dir, '.apex'));
    writeFileSync(join(dir, '.apex', 'apexlang.json'), JSON.stringify({ mmdVersion: '26.1.0-test' }));
  }

  function withTwoPageExport(run: (exportDir: string, logPath: string) => void): void {
    const dir = mkdtempSync(join(tmpdir(), 'apx-coverage-scoping-'));
    const pages = join(dir, 'pages');
    const log = join(dir, 'touches.jsonl');
    writeTestManifest(dir);
    mkdirSync(pages);
    writeFileSync(join(pages, 'p00001-one.apx'), 'page 1 (\n page: 1\n name: One\n alias: ONE\n region shared (\n  type: cards\n )\n)\n');
    writeFileSync(join(pages, 'p00002-two.apx'), 'page 2 (\n page: 2\n name: Two\n alias: TWO\n region shared (\n  type: cards\n )\n)\n');
    try {
      run(dir, log);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it('does not let a page-scoped region touch cover the same identifier on another page', () => {
    withTwoPageExport((exportDir, logPath) => {
      writeFileSync(logPath, `${JSON.stringify({ kind: 'region', identifier: 'shared', pageId: 1 })}\n`);
      const report = computeCoverage(exportDir, logPath);
      expect(report.pages[0].regions.touched).toBe(1);
      expect(report.pages[1].regions.touched).toBe(0);
    });
  });

  it('does not apply an ambiguous legacy identity-free touch to either page', () => {
    withTwoPageExport((exportDir, logPath) => {
      writeFileSync(logPath, `${JSON.stringify({ kind: 'region', identifier: 'shared', pageId: null })}\n`);
      const report = computeCoverage(exportDir, logPath);
      expect(report.pages.map((page) => page.regions.touched)).toEqual([0, 0]);
    });
  });

  it('does not apply an ambiguous legacy button-label touch to either page', () => {
    const dir = mkdtempSync(join(tmpdir(), 'apx-coverage-button-scoping-'));
    const pages = join(dir, 'pages');
    const log = join(dir, 'touches.jsonl');
    writeTestManifest(dir);
    mkdirSync(pages);
    writeFileSync(
      join(pages, 'p00001-one.apx'),
      'page 1 (\n page: 1\n name: One\n alias: ONE\n region actions (\n  button save-one ( label: Save )\n )\n)\n',
    );
    writeFileSync(
      join(pages, 'p00002-two.apx'),
      'page 2 (\n page: 2\n name: Two\n alias: TWO\n region actions (\n  button save-two ( label: Save )\n )\n)\n',
    );
    try {
      writeFileSync(log, `${JSON.stringify({ kind: 'button', identifier: 'Save', pageId: null })}\n`);
      const report = computeCoverage(dir, log);
      expect(report.pages.map((page) => page.buttons.touched)).toEqual([0, 0]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('counts identical region identifier and htmlDomId as one component for legacy matching', () => {
    const dir = mkdtempSync(join(tmpdir(), 'apx-coverage-region-alias-'));
    const pages = join(dir, 'pages');
    const log = join(dir, 'touches.jsonl');
    writeTestManifest(dir);
    mkdirSync(pages);
    writeFileSync(
      join(pages, 'p00001-one.apx'),
      'page 1 (\n page: 1\n name: One\n alias: ONE\n region shared (\n  type: cards\n  advanced { htmlDomId: shared }\n )\n)\n',
    );
    try {
      writeFileSync(log, `${JSON.stringify({ kind: 'region', identifier: 'shared', pageId: null })}\n`);
      const report = computeCoverage(dir, log);
      expect(report.pages[0].regions.touched).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('credits a semantic region identity when the successful runtime id was a manual override', () => {
    const dir = mkdtempSync(join(tmpdir(), 'apx-coverage-region-override-'));
    const pages = join(dir, 'pages');
    const log = join(dir, 'touches.jsonl');
    writeTestManifest(dir);
    mkdirSync(pages);
    writeFileSync(
      join(pages, 'p00030-grid.apx'),
      'page grid (\n page: 30\n name: Grid\n alias: GRID\n region basic-editing (\n  type: interactiveGrid\n )\n)\n',
    );
    try {
      writeFileSync(
        log,
        `${JSON.stringify({
          kind: 'region',
          identifier: 'basic-editing',
          pageId: 30,
          runtimeLocator: { strategy: 'apex-region-id', value: 'emp' },
        })}\n`,
      );
      const report = computeCoverage(dir, log);
      expect(report.pages[0].regions.touched).toBe(1);
      expect(report.pages[0].regions.untouched).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('ignores a syntactically valid touch with an unknown kind instead of crashing', () => {
    withTwoPageExport((exportDir, logPath) => {
      writeFileSync(logPath, `${JSON.stringify({ kind: 'unknown', identifier: 'shared', pageId: 1 })}\n`);
      const report = computeCoverage(exportDir, logPath);
      expect(report.touchCount).toBe(0);
      expect(report.pages.map((page) => page.regions.touched)).toEqual([0, 0]);
    });
  });
});
