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
 *
 * Regions get one extra distinction: a region whose TYPE has no
 * @apx/testkit component at all (tree, calendar, map -- see
 * packages/testkit/src/components/unsupported.ts, the same list of
 * region-shaped UnsupportedComponentError stubs, kept in sync with this
 * set so the two don't drift) can never show a real touch, no matter
 * how thoroughly it's actually tested by hand through some other means.
 * Counting it as "untouched" alongside a region that genuinely has no test
 * written for it would be dishonest -- it conflates "nobody tested this"
 * with "this can't be tracked yet." Untrackable regions are reported in
 * their own bucket and excluded from the touched/total percentage entirely.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseApp, type ApexRegion } from '@apx/parser';
import { loadExport } from './lib.js';

interface RawTouch {
  kind: 'item' | 'region' | 'button';
  identifier: string;
}

/**
 * Region types with no @apx/testkit component at all -- not "partial
 * support," genuinely zero. This must match the region-shaped stubs in
 * packages/testkit/src/components/unsupported.ts (TreeRegion, Calendar,
 * MapRegion) exactly -- extend this list only when a type gets a matching
 * UnsupportedComponentError stub there, not by assumption here alone.
 * Interactive Report/Cards/Faceted Search/Interactive Grid/Chart/form/
 * static are all trackable (via ApexRegion, ApexCardsRegion,
 * ApexFacetsRegion, ApexInteractiveGridRegion, or ApexChartRegion), even
 * where their coverage is partial in other respects.
 */
const UNTRACKABLE_REGION_TYPES = new Set(['tree', 'calendar', 'map']);

export interface CategoryCoverage {
  total: number;
  touched: number;
  untouched: string[];
}

export interface UntrackableRegion {
  identifier: string;
  type: string | null;
}

export interface RegionCoverage extends CategoryCoverage {
  /**
   * Regions whose type has no @apx/testkit component -- excluded from
   * total/touched/untouched above, listed here instead so they can never
   * be misread as "tested" or "failed to be tested."
   */
  untrackable: UntrackableRegion[];
}

export interface PageCoverage {
  id: number;
  alias: string | null;
  name: string | null;
  items: CategoryCoverage;
  regions: RegionCoverage;
  buttons: CategoryCoverage;
}

export interface CoverageReport {
  exportDir: string;
  touchLogPath: string;
  touchCount: number;
  pages: PageCoverage[];
  overall: { items: CategoryCoverage; regions: RegionCoverage; buttons: CategoryCoverage };
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

function summarizeRegions(declared: readonly ApexRegion[], touched: ReadonlySet<string>): RegionCoverage {
  const trackable = declared.filter((r) => !UNTRACKABLE_REGION_TYPES.has(r.type ?? ''));
  const untrackable = declared
    .filter((r) => UNTRACKABLE_REGION_TYPES.has(r.type ?? ''))
    .map((r): UntrackableRegion => ({ identifier: r.identifier, type: r.type }));
  const base = summarize(
    trackable.map((r) => r.identifier),
    touched,
  );
  return { ...base, untrackable };
}

function mergeCategory(into: CategoryCoverage, from: CategoryCoverage): void {
  into.total += from.total;
  into.touched += from.touched;
  into.untouched.push(...from.untouched);
}

function mergeRegionCoverage(into: RegionCoverage, from: RegionCoverage): void {
  mergeCategory(into, from);
  into.untrackable.push(...from.untrackable);
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
      const buttonLabels = p.buttons.filter((b) => b.label).map((b) => b.label!);
      return {
        id: p.id,
        alias: p.alias,
        name: p.name,
        items: summarize(itemIds, touchedByKind.item),
        regions: summarizeRegions(p.regions, touchedByKind.region),
        buttons: summarize(buttonLabels, touchedByKind.button),
      };
    });

  const overall = {
    items: { total: 0, touched: 0, untouched: [] as string[] },
    regions: { total: 0, touched: 0, untouched: [] as string[], untrackable: [] as UntrackableRegion[] },
    buttons: { total: 0, touched: 0, untouched: [] as string[] },
  };
  for (const p of pages) {
    mergeCategory(overall.items, p.items);
    mergeRegionCoverage(overall.regions, p.regions);
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
