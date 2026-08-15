/**
 * apx-report — a single, self-contained HTML "CI dashboard" bundling three
 * already-real data sources into one artifact: coverage (`apx-coverage`,
 * PR #11), regression diff (`apx-diff --format human`, PR #10), and a
 * parser-warning summary (`@apx/parser`'s own `ParseResult.warnings`). See
 * GitHub issue #3 and `docs/ecosystem-roadmap.md` "Ninth round" ("A
 * scoped-down CI dashboard, from the larger item 16 pitch") for why this is
 * scoped to exactly these three inputs and not the larger
 * coverage/diff/screenshots/perf/failures/a11y/parser-warnings pitch:
 * screenshots, performance metrics, and accessibility results don't exist
 * anywhere in this project yet, so there is nothing real to compose them
 * from -- adding placeholder sections for them would misrepresent this as
 * having more coverage than it does.
 *
 * This module does NO new analysis of its own:
 *   - Coverage: `computeCoverage()` (`coverage.ts`, unchanged) computes the
 *     report; `renderCoverageHtmlFragment()` (`coverage-html.ts`, unchanged
 *     -- exported specifically for this reuse, see its own doc comment)
 *     renders it. Embedded verbatim.
 *   - Diff: `computeDiff()` (`diff.ts`, unchanged) computes the report;
 *     `formatDiffHuman()` (`diff.ts`, unchanged -- the exact function
 *     backing `apx-diff --format human`) renders it as prose. Embedded
 *     verbatim inside a `<pre>` block -- deliberately NOT re-implemented as
 *     a new HTML diff renderer here, so this can never drift from what
 *     `apx-diff --format human` itself prints.
 *   - Parser warnings: `@apx/parser`'s `parseApp()` already collects these
 *     (`ParseResult.warnings`, `ParseIssue { message, loc: { file, line } }`)
 *     -- the exact same array `apx-testgen`'s `generate()`/`inspect()`
 *     already surface (`lib.ts`) and print as `<file>:<line> <message>`.
 *     Formatted here as a plain list, same string shape, nothing new.
 *
 * Determinism: same three inputs (old export dir, new export dir, touch
 * log) -> byte-identical HTML, every time -- no timestamps, no
 * non-deterministic ordering beyond what `computeDiff()`/`computeCoverage()`/
 * `parseApp()` themselves already guarantee.
 */
import { resolve } from 'node:path';
import { parseApp, type ParseIssue } from '@apx/parser';
import { computeCoverage, type CoverageReport } from './coverage.js';
import { COVERAGE_HTML_STYLE, escapeHtml, renderCoverageHtmlFragment } from './coverage-html.js';
import { computeDiff, formatDiffHuman, type DiffReport } from './diff.js';
import { loadExport } from './lib.js';

export interface DashboardReport {
  oldExportDir: string;
  newExportDir: string;
  touchLogPath: string;
  diff: DiffReport;
  coverage: CoverageReport;
  /**
   * Parser warnings for `newExportDir` -- the export the coverage report
   * and the "new" side of the diff both already read from, so warnings
   * are reported against the same export a CI run would actually be
   * testing today, not the baseline it's being compared against.
   */
  parserWarnings: ParseIssue[];
}

/**
 * Assembles the three already-real reports this dashboard bundles. Each
 * sub-report is computed by its own existing, unmodified function --
 * this performs no analysis of its own, only composition.
 */
export function computeReport(oldExportDir: string, newExportDir: string, touchLogPath: string): DashboardReport {
  const diff = computeDiff(oldExportDir, newExportDir);
  const coverage = computeCoverage(newExportDir, touchLogPath);
  const parserWarnings = parseApp(loadExport(resolve(newExportDir))).warnings;
  return {
    oldExportDir: resolve(oldExportDir),
    newExportDir: resolve(newExportDir),
    touchLogPath: resolve(touchLogPath),
    diff,
    coverage,
    parserWarnings,
  };
}

const STYLE = `
.apx-report { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; color: #1a1a1a; background: #ffffff; padding: 1rem; color-scheme: light; }
.apx-report h1 { font-size: 1.6rem; margin: 0 0 0.25rem; }
.apx-report h2 { font-size: 1.2rem; margin: 1.75rem 0 0.5rem; border-bottom: 1px solid #ddd; padding-bottom: 0.25rem; }
.apx-report .apx-report-meta { color: #555; font-size: 0.85rem; margin: 0 0 1rem; }
.apx-report .apx-report-section { margin-bottom: 1rem; }
.apx-report .apx-report-diff-pre { background: #f6f8fa; border: 1px solid #ddd; border-radius: 6px; padding: 0.75rem 1rem; font-size: 0.8rem; line-height: 1.4; overflow-x: auto; white-space: pre-wrap; word-break: break-word; margin: 0.5rem 0 0; }
.apx-report ul.apx-report-warnings-list { font-size: 0.85rem; padding-left: 1.25rem; margin: 0.5rem 0 0; }
.apx-report ul.apx-report-warnings-list li { padding: 0.15rem 0; color: #7a3e00; }
.apx-report .apx-report-warnings-empty { color: #1a7f37; font-weight: 600; margin: 0.5rem 0 0; }
`.trim();

/**
 * The exact `<style>` contents `renderReportHtml()` embeds for this
 * module's OWN sections (diff/warnings/header) -- exported for the same
 * reason `COVERAGE_HTML_STYLE` is: a host page embedding
 * `renderReportHtmlFragment()` needs it too. Does not include
 * `COVERAGE_HTML_STYLE` itself; a consumer embedding the coverage section
 * must supply that separately (re-exported for convenience -- see below).
 */
export const REPORT_HTML_STYLE = STYLE;

function renderCoverageSection(report: CoverageReport): string {
  return `<div class="apx-report-section apx-report-section-coverage">
  <h2>Coverage</h2>
  ${renderCoverageHtmlFragment(report)}
</div>`;
}

function renderDiffSection(report: DiffReport): string {
  return `<div class="apx-report-section apx-report-section-diff">
  <h2>Regression diff</h2>
  <p class="apx-report-meta">old: ${escapeHtml(report.oldExportDir)}<br>new: ${escapeHtml(report.newExportDir)}</p>
  <pre class="apx-report-diff-pre">${escapeHtml(formatDiffHuman(report))}</pre>
</div>`;
}

function renderWarningsSection(warnings: readonly ParseIssue[]): string {
  if (warnings.length === 0) {
    return `<div class="apx-report-section apx-report-section-warnings">
  <h2>Parser warnings</h2>
  <p class="apx-report-warnings-empty">&#10003; No parser warnings.</p>
</div>`;
  }
  const items = warnings
    .map((w) => `<li>${escapeHtml(w.loc.file)}:${w.loc.line} ${escapeHtml(w.message)}</li>`)
    .join('');
  return `<div class="apx-report-section apx-report-section-warnings">
  <h2>Parser warnings (${warnings.length})</h2>
  <ul class="apx-report-warnings-list">${items}</ul>
</div>`;
}

/**
 * Renders the dashboard content only -- a single
 * `<section class="apx-report">`, safe to inline into a host page's own
 * DOM. The host page must supply both `REPORT_HTML_STYLE` (this module's
 * own diff/warnings/header rules) AND `COVERAGE_HTML_STYLE` (re-exported
 * below) -- this function emits no `<style>` tag itself, matching
 * `renderCoverageHtmlFragment()`'s own contract.
 */
export function renderReportHtmlFragment(report: DashboardReport): string {
  return `<section class="apx-report">
  <h1>APX CI Dashboard</h1>
  <p class="apx-report-meta">new export: ${escapeHtml(report.newExportDir)}<br>
  baseline export: ${escapeHtml(report.oldExportDir)}<br>
  touch log: ${escapeHtml(report.touchLogPath)}</p>

  ${renderCoverageSection(report.coverage)}
  ${renderDiffSection(report.diff)}
  ${renderWarningsSection(report.parserWarnings)}
</section>`;
}

/** Re-exported so a single import of `report.js` has everything needed to embed `renderReportHtmlFragment()`'s output (both this module's own styles and the coverage fragment's). */
export { COVERAGE_HTML_STYLE };

/**
 * Renders a complete, standalone HTML document -- own `<head>`/`<style>`
 * (this module's rules plus `COVERAGE_HTML_STYLE`), no external
 * stylesheets, fonts, or scripts. Safe to open directly from disk
 * (`file://`) or attach as a CI artifact -- the actual point of this CLI.
 */
export function renderReportHtml(report: DashboardReport): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>APX CI Dashboard</title>
<style>
${REPORT_HTML_STYLE}
${COVERAGE_HTML_STYLE}
</style>
</head>
<body style="margin: 0; background: #ffffff;">
${renderReportHtmlFragment(report)}
</body>
</html>
`;
}
