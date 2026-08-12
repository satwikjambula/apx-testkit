/**
 * Tests for apx-report (packages/generator/src/report.ts) — GitHub issue
 * #3, docs/ecosystem-roadmap.md "Ninth round" ("A scoped-down CI
 * dashboard"). Two concerns, matching the split already established by
 * coverage-html.test.ts (synthetic-fixture rendering tests) and
 * docs.test.ts (a real-export integration test against the committed
 * reference fixture):
 *
 *   1. Rendering — hand-built `DashboardReport` fixtures (no filesystem),
 *      exercising `renderReportHtml`/`renderReportHtmlFragment` directly,
 *      the same way `coverage-html.test.ts` drives `CoverageReport`
 *      fixtures and `diff-human.test.ts` drives `DiffReport` fixtures —
 *      this module does no new analysis, so there's nothing to test here
 *      except "does it render what's already computed, correctly and
 *      deterministically."
 *   2. Wiring — `computeReport()` against the real committed
 *      `fixtures/reference-fixtures` export (the same fixture
 *      `docs.test.ts`'s own real-export tests use), confirming it actually
 *      calls `computeDiff`/`computeCoverage`/`parseApp` and assembles their
 *      results, not just that the pure rendering functions work in
 *      isolation.
 */
import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ParseIssue } from '@apx/parser';
import type { CoverageReport } from '../src/coverage.js';
import type { DiffReport } from '../src/diff.js';
import {
  COVERAGE_HTML_STYLE,
  REPORT_HTML_STYLE,
  computeReport,
  renderReportHtml,
  renderReportHtmlFragment,
  type DashboardReport,
} from '../src/report.js';

function coverageFixture(overrides: Partial<CoverageReport> = {}): CoverageReport {
  return {
    exportDir: '/tmp/export',
    touchLogPath: '/tmp/coverage.jsonl',
    touchCount: 0,
    pages: [],
    overall: {
      items: { total: 0, touched: 0, untouched: [] },
      regions: { total: 0, touched: 0, untouched: [], untrackable: [] },
      buttons: { total: 0, touched: 0, untouched: [] },
    },
    ...overrides,
  };
}

function diffFixture(overrides: Partial<DiffReport> = {}): DiffReport {
  return {
    oldExportDir: '/tmp/old-export',
    newExportDir: '/tmp/new-export',
    pages: [],
    summary: { pagesAdded: 0, pagesRemoved: 0, pagesChanged: 0, pagesUnchanged: 3 },
    ...overrides,
  };
}

function reportFixture(overrides: Partial<DashboardReport> = {}): DashboardReport {
  return {
    oldExportDir: '/tmp/old-export',
    newExportDir: '/tmp/new-export',
    touchLogPath: '/tmp/coverage.jsonl',
    diff: diffFixture(),
    coverage: coverageFixture(),
    parserWarnings: [],
    ...overrides,
  };
}

describe('renderReportHtml / renderReportHtmlFragment — rendering', () => {
  it('is deterministic -- same report renders byte-identical HTML every call', () => {
    const r = reportFixture();
    expect(renderReportHtml(r)).toBe(renderReportHtml(r));
    expect(renderReportHtmlFragment(r)).toBe(renderReportHtmlFragment(r));
  });

  it('renderReportHtml wraps a full standalone document; the fragment does not', () => {
    const r = reportFixture();
    const full = renderReportHtml(r);
    const fragment = renderReportHtmlFragment(r);

    expect(full).toContain('<!doctype html>');
    expect(full).toContain('<style>');
    expect(full).toContain(fragment);

    expect(fragment).not.toContain('<!doctype html>');
    expect(fragment).not.toContain('<html');
    expect(fragment).not.toContain('<style>');
    expect(fragment.startsWith('<section class="apx-report">')).toBe(true);
  });

  it('the full document embeds both this module\'s own style and the reused coverage style, unmodified', () => {
    const full = renderReportHtml(reportFixture());
    expect(full).toContain(REPORT_HTML_STYLE);
    expect(full).toContain(COVERAGE_HTML_STYLE);
  });

  it('embeds the coverage section via renderCoverageHtmlFragment verbatim (byte-for-byte, not re-derived)', async () => {
    const { renderCoverageHtmlFragment } = await import('../src/coverage-html.js');
    const coverage = coverageFixture({ touchCount: 5, exportDir: '/tmp/my-export' });
    const html = renderReportHtmlFragment(reportFixture({ coverage }));
    expect(html).toContain(renderCoverageHtmlFragment(coverage));
  });

  it('embeds the diff section via formatDiffHuman verbatim (byte-for-byte, not re-derived)', async () => {
    const { formatDiffHuman } = await import('../src/diff.js');
    const diff = diffFixture({ summary: { pagesAdded: 2, pagesRemoved: 0, pagesChanged: 1, pagesUnchanged: 4 } });
    const html = renderReportHtmlFragment(reportFixture({ diff }));
    const escaped = formatDiffHuman(diff)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    expect(html).toContain(escaped);
  });

  it('reports "no parser warnings" positively when the array is empty', () => {
    const html = renderReportHtmlFragment(reportFixture({ parserWarnings: [] }));
    expect(html).toContain('No parser warnings.');
    expect(html).not.toContain('apx-report-warnings-list');
  });

  it('lists every parser warning as file:line message, with a count in the heading', () => {
    const warnings: ParseIssue[] = [
      { message: 'Unrecognized line: "foo"', loc: { file: 'pages/p00003-employee.apx', line: 12 } },
      { message: 'Unterminated block \'region\'', loc: { file: 'application.apx', line: 4 } },
    ];
    const html = renderReportHtmlFragment(reportFixture({ parserWarnings: warnings }));
    expect(html).toContain('Parser warnings (2)');
    expect(html).toContain('pages/p00003-employee.apx:12 Unrecognized line: &quot;foo&quot;');
    expect(html).toContain('application.apx:4 Unterminated block &#39;region&#39;');
    expect(html).not.toContain('No parser warnings.');
  });

  it('escapes HTML-significant characters in export dir paths and warning messages', () => {
    const html = renderReportHtmlFragment(
      reportFixture({
        newExportDir: '/tmp/<new> & "export"',
        parserWarnings: [{ message: 'bad <tag> & stuff', loc: { file: 'p.apx', line: 1 } }],
      }),
    );
    expect(html).toContain('/tmp/&lt;new&gt; &amp; &quot;export&quot;');
    expect(html).toContain('bad &lt;tag&gt; &amp; stuff');
    expect(html).not.toContain('/tmp/<new> & "export"');
    expect(html).not.toContain('bad <tag> & stuff');
  });

  it('includes the touch log path and the old/new export dirs in the header meta', () => {
    const html = renderReportHtmlFragment(
      reportFixture({ oldExportDir: '/tmp/old', newExportDir: '/tmp/new', touchLogPath: '/tmp/touch.jsonl' }),
    );
    expect(html).toContain('/tmp/old');
    expect(html).toContain('/tmp/new');
    expect(html).toContain('/tmp/touch.jsonl');
  });

  it('does NOT contain any screenshot/performance/accessibility section -- explicitly out of scope', () => {
    const html = renderReportHtml(reportFixture());
    for (const term of ['screenshot', 'performance', 'accessibility', 'a11y']) {
      expect(html.toLowerCase()).not.toContain(term);
    }
  });
});

describe('computeReport — against the real committed reference fixture', () => {
  const exportDir = join(__dirname, 'fixtures', 'reference-fixtures');

  it('assembles diff (self-diff, zero changes), coverage, and parser warnings from the real export', () => {
    const touchLogDir = mkdtempSync(join(tmpdir(), 'apx-report-test-'));
    const touchLogPath = join(touchLogDir, 'coverage.jsonl');
    writeFileSync(touchLogPath, '');
    try {
      const report = computeReport(exportDir, exportDir, touchLogPath);

      // Diff: comparing the export against itself -> zero changes.
      expect(report.diff.summary).toEqual({ pagesAdded: 0, pagesRemoved: 0, pagesChanged: 0, pagesUnchanged: 1 });
      expect(report.diff.pages).toEqual([]);

      // Coverage: real declared items/regions/buttons from the fixture, nothing touched (empty log).
      expect(report.coverage.overall.items.total).toBeGreaterThan(0);
      expect(report.coverage.overall.items.touched).toBe(0);

      // Parser warnings: the committed fixture is known-clean (regression sweep requires this).
      expect(report.parserWarnings).toEqual([]);

      expect(report.oldExportDir).toContain('reference-fixtures');
      expect(report.newExportDir).toContain('reference-fixtures');
    } finally {
      rmSync(touchLogDir, { recursive: true, force: true });
    }
  });

  it('renderReportHtml(computeReport(...)) is deterministic end-to-end -- byte-identical across two independent runs', () => {
    const touchLogDir = mkdtempSync(join(tmpdir(), 'apx-report-test-'));
    const touchLogPath = join(touchLogDir, 'coverage.jsonl');
    writeFileSync(touchLogPath, '{"kind":"item","identifier":"P3_ENAME"}\n');
    try {
      const html1 = renderReportHtml(computeReport(exportDir, exportDir, touchLogPath));
      const html2 = renderReportHtml(computeReport(exportDir, exportDir, touchLogPath));
      expect(html1).toBe(html2);
    } finally {
      rmSync(touchLogDir, { recursive: true, force: true });
    }
  });
});
