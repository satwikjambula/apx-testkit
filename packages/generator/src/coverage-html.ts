/**
 * Presentation layer over `coverage.ts`'s already-computed `CoverageReport`
 * -- a heatmap-plus-checklist HTML view. This module does NO new analysis;
 * it only formats data `computeCoverage()` already produced. See
 * docs/ecosystem-roadmap.md "Ninth round" for why this is scoped as a thin
 * rendering layer, not a new coverage engine.
 *
 * Two entry points, deliberately split for reuse -- `report.ts`'s scoped
 * CI dashboard (`apx-report`, GitHub issue #3) embeds `renderCoverageHtmlFragment()`
 * directly rather than shelling out and re-parsing text, exactly as
 * anticipated when this split was introduced:
 *
 * - `renderCoverageHtmlFragment()` -- the report content only, as a single
 *   `<section class="apx-coverage-report">`, with all styling scoped under
 *   that class. Safe to inline into a larger host page; the host supplies
 *   (or reuses, via `COVERAGE_HTML_STYLE`) the `<style>` block.
 * - `renderCoverageHtml()` -- wraps the fragment in a standalone
 *   `<!doctype html>` document (own `<head>`/`<style>`) for direct
 *   double-click-and-view use from the CLI's `--html` flag.
 *
 * Determinism: like every other generator artifact, the same
 * `CoverageReport` must always produce byte-identical HTML -- no
 * timestamps, no non-deterministic ordering. Ordering follows the same
 * order `CoverageReport` itself already provides (pages sorted by id,
 * untouched/untrackable lists in AST declaration order) -- this module
 * never re-sorts or re-derives anything.
 */
import type { CategoryCoverage, CoverageReport, PageCoverage, RegionCoverage } from './coverage.js';

/**
 * Exported (not just an internal helper) so `report.ts` -- the CI
 * dashboard that composes this module's fragment alongside a diff section
 * and a parser-warnings section -- can escape its own text content with
 * the exact same rules, rather than re-implementing an equivalent
 * function. No behavior change for this module's own use below.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Percentage touched, or `null` when `total === 0` (n/a -- not zero). */
function percent(c: CategoryCoverage): number | null {
  if (c.total === 0) return null;
  return Math.round((c.touched / c.total) * 100);
}

/**
 * Discrete heat bucket for a percentage. Discrete (not a continuous
 * gradient) so the same percentage always maps to the same bucket/color
 * regardless of floating-point rendering differences, and so the legend
 * has a fixed, finite set of colors to document.
 */
function heatClass(pct: number | null): string {
  if (pct === null) return 'apx-cov-na';
  if (pct === 100) return 'apx-cov-100';
  if (pct >= 80) return 'apx-cov-80';
  if (pct >= 50) return 'apx-cov-50';
  if (pct > 0) return 'apx-cov-low';
  return 'apx-cov-0';
}

function pctLabel(pct: number | null): string {
  return pct === null ? 'n/a' : `${pct}%`;
}

function heatCell(label: string, c: CategoryCoverage): string {
  const pct = percent(c);
  return (
    `<td class="apx-cov-cell ${heatClass(pct)}" title="${escapeHtml(label)}: ${c.touched}/${c.total}">` +
    `${c.touched}/${c.total}<br><span class="apx-cov-pct">${pctLabel(pct)}</span></td>`
  );
}

function checklist(category: string, c: CategoryCoverage, touchedLabelPrefix = ''): string {
  const touchedCount = c.touched;
  const untouchedSet = new Set(c.untouched);
  // The report only stores the untouched list, not the full declared list,
  // so a synthetic "touched" placeholder count is shown as a single
  // summary line rather than fabricating identifiers that were never
  // recorded anywhere in CoverageReport.
  const items: string[] = [];
  if (touchedCount > 0) {
    items.push(
      `<li class="apx-cov-touched">&#10003; ${touchedCount} ${escapeHtml(touchedLabelPrefix)}touched (not itemized -- only untouched identifiers are tracked by name)</li>`,
    );
  }
  for (const id of c.untouched) {
    if (!untouchedSet.has(id)) continue;
    items.push(`<li class="apx-cov-untouched">&#10007; ${escapeHtml(id)}</li>`);
  }
  if (items.length === 0) {
    return `<p class="apx-cov-empty">no ${escapeHtml(category)} declared</p>`;
  }
  return `<ul class="apx-cov-checklist">${items.join('')}</ul>`;
}

function untrackableChecklist(regions: RegionCoverage): string {
  if (regions.untrackable.length === 0) return '';
  const items = regions.untrackable
    .map(
      (r) =>
        `<li class="apx-cov-untrackable">&#8213; ${escapeHtml(r.identifier)} <span class="apx-cov-type">(${escapeHtml(r.type ?? 'unknown type')})</span></li>`,
    )
    .join('');
  return (
    `<p class="apx-cov-untrackable-label">untrackable (no @apx/testkit component for this type):</p>` +
    `<ul class="apx-cov-checklist">${items}</ul>`
  );
}

function renderPage(p: PageCoverage): string {
  const title = `page ${p.id}: ${escapeHtml(p.name ?? p.alias ?? '')} (${escapeHtml(p.alias ?? '')})`;
  return `
<details class="apx-cov-page">
  <summary>
    ${title}
    <table class="apx-cov-heatrow"><tr>
      ${heatCell('items', p.items)}
      ${heatCell('regions', p.regions)}
      ${heatCell('buttons', p.buttons)}
    </tr></table>
  </summary>
  <div class="apx-cov-detail">
    <h4>Items</h4>
    ${checklist('items', p.items)}
    <h4>Regions</h4>
    ${checklist('regions', p.regions)}
    ${untrackableChecklist(p.regions)}
    <h4>Buttons</h4>
    ${checklist('buttons', p.buttons)}
  </div>
</details>`;
}

const STYLE = `
.apx-coverage-report { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; color: #1a1a1a; background: #ffffff; padding: 1rem; color-scheme: light; }
.apx-coverage-report h1 { font-size: 1.4rem; margin: 0 0 0.25rem; }
.apx-coverage-report h4 { margin: 0.75rem 0 0.25rem; font-size: 0.9rem; }
.apx-coverage-report .apx-cov-meta { color: #555; font-size: 0.85rem; margin: 0 0 1rem; }
.apx-coverage-report .apx-cov-summary { display: flex; gap: 0.75rem; margin-bottom: 1.5rem; flex-wrap: wrap; }
.apx-coverage-report .apx-cov-summary-card { border-radius: 6px; padding: 0.75rem 1rem; min-width: 8rem; }
.apx-coverage-report .apx-cov-summary-card .apx-cov-label { display: block; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.03em; opacity: 0.8; }
.apx-coverage-report .apx-cov-summary-card .apx-cov-value { display: block; font-size: 1.3rem; font-weight: 600; }
.apx-coverage-report table.apx-cov-heatrow { display: inline-table; border-collapse: collapse; margin-left: 0.75rem; vertical-align: middle; }
.apx-coverage-report td.apx-cov-cell { border-radius: 4px; padding: 0.2rem 0.5rem; font-size: 0.75rem; text-align: center; }
.apx-coverage-report .apx-cov-pct { font-size: 0.65rem; opacity: 0.85; }
.apx-coverage-report .apx-cov-page { border: 1px solid #ddd; border-radius: 6px; margin-bottom: 0.5rem; padding: 0.5rem 0.75rem; }
.apx-coverage-report .apx-cov-page summary { cursor: pointer; font-weight: 600; display: flex; align-items: center; flex-wrap: wrap; gap: 0.25rem; }
.apx-coverage-report .apx-cov-detail { margin-top: 0.5rem; }
.apx-coverage-report ul.apx-cov-checklist { list-style: none; margin: 0.25rem 0; padding: 0; font-size: 0.85rem; }
.apx-coverage-report ul.apx-cov-checklist li { padding: 0.1rem 0; }
.apx-coverage-report .apx-cov-touched { color: #1a7f37; }
.apx-coverage-report .apx-cov-untouched { color: #cf222e; }
.apx-coverage-report .apx-cov-untrackable { color: #6e7781; }
.apx-coverage-report .apx-cov-untrackable-label { font-size: 0.8rem; color: #6e7781; margin: 0.5rem 0 0; }
.apx-coverage-report .apx-cov-type { font-style: italic; }
.apx-coverage-report .apx-cov-empty { color: #6e7781; font-size: 0.85rem; font-style: italic; margin: 0.25rem 0; }
.apx-coverage-report .apx-cov-100, .apx-coverage-report .apx-cov-80 { background: #d4f4dd; color: #0f5c26; }
.apx-coverage-report .apx-cov-50 { background: #fff3c4; color: #6b5200; }
.apx-coverage-report .apx-cov-low { background: #ffddb0; color: #7a3e00; }
.apx-coverage-report .apx-cov-0 { background: #ffd6d6; color: #7a0000; }
.apx-coverage-report .apx-cov-na { background: #e8e8e8; color: #555; }
`.trim();

function summaryCard(label: string, c: CategoryCoverage): string {
  const pct = percent(c);
  return (
    `<div class="apx-cov-summary-card ${heatClass(pct)}">` +
    `<span class="apx-cov-label">${escapeHtml(label)}</span>` +
    `<span class="apx-cov-value">${c.touched}/${c.total} (${pctLabel(pct)})</span>` +
    `</div>`
  );
}

/**
 * Renders the report content only -- a single `<section
 * class="apx-coverage-report">`, with all rules scoped under that class so
 * it is safe to inline into a host page's own DOM (the intended use for a
 * future CI dashboard). The host page must supply its own `<style>` (see
 * `COVERAGE_HTML_STYLE`, exported below, to reuse this module's exact
 * styling) -- this function does not emit a `<style>` tag itself.
 */
export function renderCoverageHtmlFragment(report: CoverageReport): string {
  const overallUntrackable = report.overall.regions.untrackable.length;
  return `<section class="apx-coverage-report">
  <h1>APX Coverage Report</h1>
  <p class="apx-cov-meta">export: ${escapeHtml(report.exportDir)}<br>
  touch log: ${escapeHtml(report.touchLogPath)} (${report.touchCount} touches recorded)${
    overallUntrackable > 0 ? `<br>${overallUntrackable} untrackable region(s) across all pages (excluded from percentages -- see below)` : ''
  }</p>

  <div class="apx-cov-summary">
    ${summaryCard('Items', report.overall.items)}
    ${summaryCard('Regions', report.overall.regions)}
    ${summaryCard('Buttons', report.overall.buttons)}
  </div>

  ${report.pages.map(renderPage).join('\n')}
</section>`;
}

/**
 * The exact `<style>` contents `renderCoverageHtml()` embeds -- exported
 * so a host page/CI dashboard that only wants `renderCoverageHtmlFragment`
 * can reuse the same look without duplicating it.
 */
export const COVERAGE_HTML_STYLE = STYLE;

/**
 * Renders a complete, standalone HTML document -- own `<head>`/`<style>`,
 * no external stylesheets, fonts, or scripts. Safe to open directly from
 * disk (`file://`) or attach as a CI artifact.
 */
export function renderCoverageHtml(report: CoverageReport): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>APX Coverage Report</title>
<style>
${COVERAGE_HTML_STYLE}
</style>
</head>
<body style="margin: 0; background: #ffffff;">
${renderCoverageHtmlFragment(report)}
</body>
</html>
`;
}
