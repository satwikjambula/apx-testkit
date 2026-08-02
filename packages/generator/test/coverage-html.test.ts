import { describe, expect, it } from 'vitest';
import type { CoverageReport, PageCoverage } from '../src/coverage.js';
import { COVERAGE_HTML_STYLE, renderCoverageHtml, renderCoverageHtmlFragment } from '../src/coverage-html.js';

/**
 * Pure, hand-built CoverageReport fixtures -- this module does no new
 * analysis over `coverage.ts`'s output, so these tests exercise the
 * rendering layer directly against representative shapes of that already-
 * computed data, the same way coverage.test.ts drives `summarizeRegions`
 * directly rather than round-tripping through a real .apx export.
 */

function page(overrides: Partial<PageCoverage>): PageCoverage {
  return {
    id: 1,
    alias: 'page-one',
    name: 'Page One',
    items: { total: 2, touched: 1, untouched: ['P1_B'] },
    regions: { total: 1, touched: 1, untouched: [], untrackable: [] },
    buttons: { total: 1, touched: 0, untouched: ['save'] },
    ...overrides,
  };
}

function report(overrides: Partial<CoverageReport> = {}): CoverageReport {
  const pages = overrides.pages ?? [page({})];
  const overall = overrides.overall ?? {
    items: { total: 2, touched: 1, untouched: ['P1_B'] },
    regions: { total: 1, touched: 1, untouched: [], untrackable: [] },
    buttons: { total: 1, touched: 0, untouched: ['save'] },
  };
  return {
    exportDir: '/tmp/my-export',
    touchLogPath: '/tmp/coverage.jsonl',
    touchCount: 3,
    ...overrides,
    pages,
    overall,
  };
}

describe('renderCoverageHtml / renderCoverageHtmlFragment', () => {
  it('is deterministic -- same report renders byte-identical HTML every call', () => {
    const r = report();
    expect(renderCoverageHtml(r)).toBe(renderCoverageHtml(r));
    expect(renderCoverageHtmlFragment(r)).toBe(renderCoverageHtmlFragment(r));
  });

  it('renderCoverageHtml wraps a full standalone document; the fragment does not', () => {
    const r = report();
    const full = renderCoverageHtml(r);
    const fragment = renderCoverageHtmlFragment(r);

    expect(full).toContain('<!doctype html>');
    expect(full).toContain('<style>');
    expect(full).toContain(fragment);

    expect(fragment).not.toContain('<!doctype html>');
    expect(fragment).not.toContain('<html');
    expect(fragment).not.toContain('<style>');
    expect(fragment.startsWith('<section class="apx-coverage-report">')).toBe(true);
  });

  it('the exported style matches exactly what renderCoverageHtml embeds -- no drift for fragment consumers', () => {
    const r = report();
    const full = renderCoverageHtml(r);
    expect(full).toContain(`<style>\n${COVERAGE_HTML_STYLE}\n</style>`);
  });

  it('includes export dir, touch log path, and touch count from the report', () => {
    const html = renderCoverageHtmlFragment(report());
    expect(html).toContain('/tmp/my-export');
    expect(html).toContain('/tmp/coverage.jsonl');
    expect(html).toContain('3 touches recorded');
  });

  it('renders per-page touched/total and percentage for each category', () => {
    const html = renderCoverageHtmlFragment(
      report({
        pages: [
          page({
            id: 7,
            alias: 'reports',
            name: 'Reports',
            items: { total: 4, touched: 2, untouched: ['P7_A', 'P7_B'] },
          }),
        ],
      }),
    );
    expect(html).toContain('page 7: Reports (reports)');
    expect(html).toContain('2/4');
    expect(html).toContain('50%');
  });

  it('lists untouched identifiers by name, and summarizes touched as a count (no fabricated identifiers)', () => {
    const html = renderCoverageHtmlFragment(
      report({
        pages: [page({ items: { total: 3, touched: 2, untouched: ['P1_C'] } })],
      }),
    );
    expect(html).toContain('&#10007; P1_C');
    expect(html).toContain('2 touched');
  });

  it('renders untrackable regions in their own checklist, distinct from untouched', () => {
    const html = renderCoverageHtmlFragment(
      report({
        pages: [
          page({
            regions: {
              total: 1,
              touched: 1,
              untouched: [],
              untrackable: [{ identifier: 'nav-tree', type: 'tree' }],
            },
          }),
        ],
      }),
    );
    expect(html).toContain('untrackable (no @apx/testkit component for this type)');
    expect(html).toContain('nav-tree');
    expect(html).toContain('(tree)');
  });

  it('handles a category with zero declared items (n/a, not a crash or a bogus 0%)', () => {
    const html = renderCoverageHtmlFragment(
      report({
        pages: [page({ buttons: { total: 0, touched: 0, untouched: [] } })],
      }),
    );
    expect(html).toContain('n/a');
    expect(html).toContain('no buttons declared');
  });

  it('escapes HTML-significant characters in identifiers and page names', () => {
    const html = renderCoverageHtmlFragment(
      report({
        pages: [
          page({
            name: 'A & B <Page>',
            items: { total: 1, touched: 0, untouched: ['P1_<X>&"Y"'] },
          }),
        ],
      }),
    );
    expect(html).toContain('A &amp; B &lt;Page&gt;');
    expect(html).toContain('P1_&lt;X&gt;&amp;&quot;Y&quot;');
    // The raw, unescaped identifier must never appear verbatim.
    expect(html).not.toContain('P1_<X>&"Y"');
  });

  it('color-codes 100% coverage differently from 0% coverage (heat classes present and distinct)', () => {
    const fullyTouched = renderCoverageHtmlFragment(
      report({
        pages: [page({ buttons: { total: 1, touched: 1, untouched: [] } })],
      }),
    );
    const untouched = renderCoverageHtmlFragment(
      report({
        pages: [page({ buttons: { total: 1, touched: 0, untouched: ['save'] } })],
      }),
    );
    expect(fullyTouched).toContain('apx-cov-100');
    expect(untouched).toContain('apx-cov-0');
  });
});
