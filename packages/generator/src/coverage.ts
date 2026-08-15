/**
 * Coverage mapping: cross-references a recorded touch log (from
 * @apx/testkit's opt-in coverage recorder -- see
 * packages/testkit/src/fixtures/coverage.ts) against the .apx AST to report
 * which declared items/regions/buttons a test run actually exercised.
 *
 * "Coverage" here means something different from code-line coverage: the
 * AST already has stable identifiers (pageItem ids, region ids), so this
 * reports touched-vs-untouched per page against THAT inventory, not
 * instrumented source lines.
 *
 * BUTTONS (runtime-review P0 item 4): matched by `pageId` + the button's
 * semantic `.apx` `identifier` -- NEVER by label alone. Matching by label
 * used to silently collapse two DIFFERENT buttons sharing a label (e.g.
 * `SAVE_EMPLOYEE`/`SAVE_REQUEST`, both labeled "Save") into indistinguishable
 * coverage -- a real bug: `declared` would contain "Save" twice, and if
 * EITHER button's click was ever recorded, BOTH would be reported touched,
 * even the one that was never actually exercised. Touches recorded WITH
 * identity (`pageId` set -- always true for generated code, see
 * page-object.ts) are matched by the `(pageId, identifier)` pair. Touches
 * recorded WITHOUT identity (`pageId: null` -- a degraded case, only
 * possible from a hand-written spec calling `buttonByLabel()` without its
 * optional third argument) fall back to matching by LABEL, exactly as
 * before this fix, so existing hand-written specs are not penalized for
 * not yet having been updated to pass identity.
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
import { parseApp, type ApexButton, type ApexRegion } from '@apx/parser';
import { loadExport } from './lib.js';

interface RawTouch {
  kind: 'item' | 'region' | 'button';
  identifier: string;
  /** Non-null only for button touches recorded with full semantic identity (see module doc). */
  pageId: number | null;
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
export const UNTRACKABLE_REGION_TYPES = new Set(['tree', 'calendar', 'map']);

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
        touches.push({
          kind: parsed.kind,
          identifier: parsed.identifier,
          pageId: typeof parsed.pageId === 'number' ? parsed.pageId : null,
        });
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

/**
 * A recorded region touch is keyed by the RUNTIME id actually tried (see
 * fixtures/coverage.ts / testkit's resolveRegion(), which records a
 * coverage touch for every ADR-003 candidate it evaluates against
 * apex.region() -- not just the one that ultimately resolved). Matching
 * only against `r.htmlDomId ?? r.identifier` (a single, statically-chosen
 * value) silently under-reports coverage in two real cases: (1) any
 * region with an `htmlDomId` override that a generated or hand-written
 * spec genuinely exercised (confirmed on real Chart/Interactive
 * Grid/Interactive Report regions) -- covered by matching `htmlDomId`
 * directly; (2) the rarer case where `resolveRegion()` had to fall back
 * PAST a stale/wrong `htmlDomId` to the export identifier at runtime --
 * in that case the touch is recorded against the identifier that
 * actually worked, not the AST's static `htmlDomId` field, so matching
 * only the static field would wrongly report "untouched" despite a real,
 * successful exercise. Checking BOTH candidates the AST implies (whichever
 * one the resolver actually used) is strictly more correct than matching
 * either alone. The report still DISPLAYS the export identifier (what's
 * declared in the .apx source, consistent with every other category
 * here) -- only the touch-matching lookup considers both candidates.
 */
export function summarizeRegions(declared: readonly ApexRegion[], touched: ReadonlySet<string>): RegionCoverage {
  const trackable = declared.filter((r) => !UNTRACKABLE_REGION_TYPES.has(r.type ?? ''));
  const untrackable = declared
    .filter((r) => UNTRACKABLE_REGION_TYPES.has(r.type ?? ''))
    .map((r): UntrackableRegion => ({ identifier: r.identifier, type: r.type }));
  const wasTouched = (r: ApexRegion): boolean => (r.htmlDomId !== null && touched.has(r.htmlDomId)) || touched.has(r.identifier);
  const untouched = trackable.filter((r) => !wasTouched(r)).map((r) => r.identifier);
  return { total: trackable.length, touched: trackable.length - untouched.length, untouched, untrackable };
}

/**
 * See module doc's "BUTTONS" section. `touches` here is the FULL list of
 * button-kind touches across every page (not pre-scoped) -- this function
 * scopes the identity match to `pageId` itself, and separately supports
 * the degraded, identity-free (`pageId: null`) label-matching fallback.
 */
export function summarizeButtons(declared: readonly ApexButton[], pageId: number, touches: readonly RawTouch[]): CategoryCoverage {
  const labeled = declared.filter((b) => b.label !== null);
  const identifiedTouches = new Set(touches.filter((t) => t.pageId === pageId).map((t) => t.identifier));
  const degradedLabelTouches = new Set(touches.filter((t) => t.pageId === null).map((t) => t.identifier));
  const wasTouched = (b: ApexButton): boolean => identifiedTouches.has(b.identifier) || degradedLabelTouches.has(b.label!);
  const untouched = labeled.filter((b) => !wasTouched(b)).map((b) => b.identifier);
  return { total: labeled.length, touched: labeled.length - untouched.length, untouched };
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

  const touchedByKind: Record<'item' | 'region', Set<string>> = {
    item: new Set(),
    region: new Set(),
  };
  const buttonTouches: RawTouch[] = [];
  for (const t of touches) {
    if (t.kind === 'button') buttonTouches.push(t);
    else touchedByKind[t.kind].add(t.identifier);
  }

  const pages = [...result.ast.pages]
    .filter((p) => p.id !== 0 && p.alias)
    .sort((a, b) => a.id - b.id)
    .map((p): PageCoverage => {
      const itemIds = p.items.map((i) => i.identifier);
      return {
        id: p.id,
        alias: p.alias,
        name: p.name,
        items: summarize(itemIds, touchedByKind.item),
        regions: summarizeRegions(p.regions, touchedByKind.region),
        buttons: summarizeButtons(p.buttons, p.id, buttonTouches),
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
