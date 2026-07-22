/**
 * Coverage mapping: cross-references a recorded touch log (from
 * @apx/testkit's opt-in coverage recorder -- see
 * packages/testkit/src/fixtures/coverage.ts) against the .apx AST to report
 * which declared items/regions/buttons a test run actually exercised.
 *
 * "Coverage" here means something different from code-line coverage: the
 * AST already has stable identifiers (pageItem ids, region ids, button
 * labels), so this reports touched-vs-untouched per page against THAT
 * inventory, not instrumented source lines. Buttons are matched by LABEL,
 * not identifier -- there's no verified button-id convention yet (see
 * docs/grammar-assumptions.md), and buttonByLabel() is label-based by
 * design.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseApp } from '@apx/parser';
import { loadExport } from './lib.js';

interface RawTouch {
  kind: 'item' | 'region' | 'button';
  identifier: string;
}

export interface CategoryCoverage {
  total: number;
  touched: number;
  untouched: string[];
}

export interface PageCoverage {
  id: number;
  alias: string | null;
  name: string | null;
  items: CategoryCoverage;
  regions: CategoryCoverage;
  buttons: CategoryCoverage;
}

export interface CoverageReport {
  exportDir: string;
  touchLogPath: string;
  touchCount: number;
  pages: PageCoverage[];
  overall: { items: CategoryCoverage; regions: CategoryCoverage; buttons: CategoryCoverage };
}

function readTouches(touchLogPath: string): RawTouch[] {
  if (!existsSync(touchLogPath)) return [];
  const text = readFileSync(touchLogPath, 'utf8');
  const touches: RawTouch[] = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed.identifier === 'string' && typeof parsed.kind === 'string') {
        touches.push({ kind: parsed.kind, identifier: parsed.identifier });
      }
    } catch {
      /* malformed line -- ignore, don't crash the whole report over one bad append */
    }
  }
  return touches;
}

function summarize(declared: readonly string[], touched: ReadonlySet<string>): CategoryCoverage {
  const untouched = declared.filter((id) => !touched.has(id));
  return { total: declared.length, touched: declared.length - untouched.length, untouched };
}

function mergeCategory(into: CategoryCoverage, from: CategoryCoverage): void {
  into.total += from.total;
  into.touched += from.touched;
  into.untouched.push(...from.untouched);
}

export function computeCoverage(exportDir: string, touchLogPath: string): CoverageReport {
  const result = parseApp(loadExport(resolve(exportDir)));
  const touches = readTouches(touchLogPath);

  const touchedByKind: Record<RawTouch['kind'], Set<string>> = {
    item: new Set(),
    region: new Set(),
    button: new Set(),
  };
  for (const t of touches) touchedByKind[t.kind].add(t.identifier);

  const pages = [...result.ast.pages]
    .filter((p) => p.id !== 0 && p.alias)
    .sort((a, b) => a.id - b.id)
    .map((p): PageCoverage => {
      const itemIds = p.items.map((i) => i.identifier);
      const regionIds = p.regions.map((r) => r.identifier);
      const buttonLabels = p.buttons.filter((b) => b.label).map((b) => b.label!);
      return {
        id: p.id,
        alias: p.alias,
        name: p.name,
        items: summarize(itemIds, touchedByKind.item),
        regions: summarize(regionIds, touchedByKind.region),
        buttons: summarize(buttonLabels, touchedByKind.button),
      };
    });

  const overall = {
    items: { total: 0, touched: 0, untouched: [] as string[] },
    regions: { total: 0, touched: 0, untouched: [] as string[] },
    buttons: { total: 0, touched: 0, untouched: [] as string[] },
  };
  for (const p of pages) {
    mergeCategory(overall.items, p.items);
    mergeCategory(overall.regions, p.regions);
    mergeCategory(overall.buttons, p.buttons);
  }

  return {
    exportDir: resolve(exportDir),
    touchLogPath: resolve(touchLogPath),
    touchCount: touches.length,
    pages,
    overall,
  };
}
