/**
 * apx-flow — Flow Map: a deterministic navigation graph built directly from
 * the already-typed AST (`@apx/parser`). Same shape as `diff.ts`/
 * `coverage.ts`/`docs.ts` — typed-AST-in, deterministic-JSON-artifact-out,
 * no live app or browser involved. See `docs/ecosystem-roadmap.md`'s
 * Thirteenth round ("Flow Map: data model + CLI now, UI deferred") for the
 * full scoping decision chain this module implements: Product Architect
 * scoped Phase 1a's exact boundary, Software Architect confirmed this file
 * belongs in `packages/generator` (no new `packages/flow/`), Compiler/
 * Parser Engineer shipped the two prerequisite typed-field additions this
 * depends on (`ApexColumnLinkTarget.url`, `ApexButton.target`/`.url`).
 *
 * **Exactly four navigation sources, Phase 1a scope, no more**:
 *   1. `ApexPage.branches` (`ApexBranch.target`) — page-processing redirects.
 *   2. `ApexRegion.actions` (`ApexRegionAction.target`/`.url`) — Cards/List
 *      row-level actions, including `type: fullCard`.
 *   3. `ApexRegion.columns[].linkTarget` (`ApexColumnLinkTarget`) —
 *      report/Interactive Report/Interactive Grid column links, both the
 *      in-app page-redirect and external-URL-redirect variants.
 *   4. `ApexPage.buttons[].target`/`.url` (`ApexButtonTarget`) — button
 *      page/app redirects and external-URL redirects.
 *
 * **Explicitly OUT OF SCOPE for this pass** (Thirteenth round, Decision 2):
 * breadcrumbs and navigation lists (shared-component parser support needed
 * first, deferred to Phase 1b), dialog-page detection (needs a new
 * `ApexPage.pageMode` field plus cross-page joins, deferred to Phase 1b),
 * Dynamic Action redirects (no declarative metadata found as far as could
 * be confirmed — Eleventh round), `apex.navigation` JS API (Phase 2+, not
 * static export metadata at all). Do not fold any of these in here.
 *
 * **Condition preservation — do NOT flatten.** A branch (or any other
 * source) with multiple real entries producing the same or different
 * targets under different conditions gets one edge PER source-construct
 * instance, never merged. This falls out of the implementation by
 * construction: every extractor below iterates the AST's own array
 * (`page.branches`, `region.actions`, `region.columns`, `page.buttons`)
 * and builds one edge per element that has real navigation data — it never
 * groups/dedupes by `(from, to)`. See `buildFlowMap`'s own per-source loops
 * and `test/flow.test.ts`'s condition-preservation cases.
 *
 * **Confidence tiering — carries real, source-and-variant-specific evidence
 * through to every edge, not a blanket "high."** Eight fine-grained
 * mechanisms (`FlowEdgeMechanism`), each with its own confidence + literal
 * evidence citation in `FLOW_MECHANISM_EVIDENCE` below. Seven are `'high'`
 * (live-witnessed, real data, real line citations). Exactly one —
 * `button.page` (the `redirectThisApp`/`redirectOtherApp` button variant)
 * — is `'medium'`: typed from the full EBNF production plus the
 * already-proven `projectPageTarget()` pattern, but a full sweep of every
 * locally accessible real export (this project's entire 46+ app corpus,
 * per `docs/ecosystem-roadmap.md`'s Eleventh/Thirteenth rounds) found ZERO
 * real occurrences of either enum value. This mirrors `ApexButtonTarget`'s
 * own doc comment in `packages/parser/src/ast.ts` exactly — this module
 * must never blur that distinction into an unqualified "confirmed."
 *
 * **Determinism contract**, identical to every other module in this
 * package: same `ApexAppAst` in -> byte-identical `FlowMap` out. No
 * timestamps, no absolute paths inside the artifact (an exportDir would
 * make the JSON differ across checkouts/machines for the identical AST —
 * deliberately kept out of `FlowMap` itself; `computeFlowMap()`'s own
 * return value is still just a `FlowMap`, path-free), fields render in the
 * AST's own stable source order (pages sorted by id, per-page/per-region
 * arrays in their own declared order).
 */
import type {
  ApexAppAst,
  ApexBranch,
  ApexButton,
  ApexPage,
  ApexRegionAction,
  ApexReportColumn,
  ApexServerSideCondition,
} from '@apx/parser';
import { parseApp } from '@apx/parser';
import { resolve } from 'node:path';
import { loadExport } from './lib.js';

export type FlowNodeId = `page:${number}`;

export interface FlowNode {
  id: FlowNodeId;
  pageId: number;
  alias: string;
  name: string | null;
}

/**
 * The resolved shape of an edge's destination. `page` is a target this
 * project's typed AST could resolve to one of the app's own real,
 * generated pages (see `resolvePageRef` below — the same page filter
 * `docs.ts`/`coverage.ts`/`page-object.ts` already apply: `id !== 0 &&
 * alias` — for consistency). `unresolvedPage` is a real page reference
 * (`ApexBranchTarget.page`/etc.) this project could NOT resolve locally —
 * a different app's page number (`redirectOtherApp`), an alias/page-0
 * target excluded by the same filter, or an item-substitution token (e.g.
 * `&LAST_VIEW.`) that cannot be resolved without runtime evaluation. `url`
 * is an external-URL redirect (`ApexBranchTarget.url`/
 * `ApexColumnLinkTarget.url`/`ApexButton.url`/`ApexRegionAction.url`) —
 * never a page node, by construction (real substitution tokens like `#`
 * literal placeholders or `&ITEM.` references are kept verbatim, exactly
 * as the AST carries them, never resolved further).
 */
export type FlowTarget =
  | { kind: 'page'; nodeId: FlowNodeId; pageId: number }
  | { kind: 'unresolvedPage'; ref: number | string }
  | { kind: 'url'; url: string };

export type FlowEdgeSource = 'branch' | 'regionAction' | 'reportColumnLink' | 'button';

/**
 * Fine-grained mechanism per edge -- one of the four sources, split by
 * page-target vs. URL-redirect variant, since (per `ast.ts`'s own doc
 * comments) those two variants of the SAME source carry genuinely
 * different evidence tiers for `button` specifically (see this module's
 * own doc comment above). Kept fine-grained for every source, not just
 * `button`, so `FLOW_MECHANISM_EVIDENCE`'s citations stay precise and
 * individually checkable rather than lumped per source.
 */
export type FlowEdgeMechanism =
  | 'branch.page'
  | 'branch.url'
  | 'regionAction.page'
  | 'regionAction.url'
  | 'reportColumnLink.page'
  | 'reportColumnLink.url'
  | 'button.page'
  | 'button.url';

export type FlowConfidence = 'high' | 'medium';

export interface FlowEdge {
  /** Deterministic, unique within one `FlowMap` -- see `edgeId()`. */
  id: string;
  from: FlowNodeId;
  to: FlowTarget;
  mechanism: FlowEdgeMechanism;
  source: FlowEdgeSource;
  /**
   * The originating construct's own identifier. `null` only ever occurs
   * for `branch` -- `ApexBranch.identifier` is confirmed ALWAYS `null`
   * across every real branch in this project's full corpus (see `ast.ts`'s
   * `ApexBranch.identifier` doc comment) -- typed `string | null` here
   * rather than assumed absent, honestly matching the AST field itself.
   */
  sourceIdentifier: string | null;
  /**
   * A human label for the edge -- `branch.name`, region action `label`,
   * report column `heading`, or button `label`, whichever the source
   * construct carries. `null` when genuinely absent (not coerced to the
   * identifier -- that distinction stays visible in `sourceIdentifier`).
   */
  label: string | null;
  /** The owning region's identifier, for `regionAction`/`reportColumnLink`
   * edges only -- `null` for `branch`/`button` (page-level constructs, no
   * owning region). */
  regionIdentifier: string | null;
  /** Only `branch` edges carry a typed condition (`ApexBranch.condition`)
   * -- `null` for every other source; not invented for sources whose AST
   * shape has no condition field at all (`ApexRegionAction`/
   * `ApexReportColumn`/`ApexButton`). */
  condition: ApexServerSideCondition | null;
  /** `ITEM: value` pairs carried across the redirect, when the source
   * construct's target object carries them; `null` otherwise. */
  items: Record<string, string> | null;
  /** Cache-clear directive, when the source construct's target object
   * carries one (`ApexRegionActionTarget`/`ApexColumnLinkTarget`/
   * `ApexButtonTarget` all have it; `ApexBranchTarget` does NOT -- always
   * `null` for `branch.*` edges, an honest reflection of that real,
   * confirmed AST shape difference, not an oversight). */
  clearCache: string | null;
  confidence: FlowConfidence;
  /** Literal, checkable evidence citation for this edge's `confidence` --
   * see `FLOW_MECHANISM_EVIDENCE`. Never a blanket restatement of
   * "confirmed" -- carries the real source/variant-specific evidence tier
   * through to the edge itself, per this module's own doc comment. */
  evidence: string;
}

/**
 * Pages with zero incoming edges from any of the four typed sources in
 * this `FlowMap` -- pure computation over the already-built edge list, no
 * new data source or live-verification question, which is why this is
 * in-scope for Phase 1a per the maintainer's own "cheap and in-scope"
 * bar. Explicitly NOT a claim that the page is truly unreachable in the
 * running app -- breadcrumbs, navigation lists, `apex.navigation` calls,
 * and Dynamic Action redirects are all out of Phase 1a scope (see this
 * module's own doc comment), so a page could easily be reached through one
 * of those and still show up here. A finding, not a bug claim -- matching
 * this project's `docs/quirks/26.1.json` discipline of "findings with
 * evidence," never an automatic defect.
 */
export interface FlowReachabilitySummary {
  pagesWithNoIncomingEdges: number[];
}

export interface FlowMap {
  /** Bumped on any breaking shape change to this artifact, mirroring
   * `ApexAppAst.astVersion`'s own discipline. */
  flowMapVersion: '0.1.0';
  nodes: FlowNode[];
  edges: FlowEdge[];
  reachability: FlowReachabilitySummary;
}

interface MechanismEvidence {
  confidence: FlowConfidence;
  evidence: string;
}

/**
 * Single source of truth for confidence + evidence per fine-grained
 * mechanism -- see this module's own doc comment for the tiering rule.
 * `test/flow.test.ts` asserts every mechanism value an edge can actually
 * carry appears here with the expected confidence, so a future
 * mechanism/evidence drift can't go unnoticed.
 */
export const FLOW_MECHANISM_EVIDENCE: Record<FlowEdgeMechanism, MechanismEvidence> = {
  'branch.page': {
    confidence: 'high',
    evidence:
      "ApexBranchTarget.page — live-witnessed across the corpus: Oracle's own `customers` starter app " +
      '(an unconditional `&LAST_VIEW.`-target branch, no serverSideCondition at all) and `opportunities` ' +
      'starter app (literal page-number targets). See packages/parser/src/ast.ts ApexBranchTarget doc comment.',
  },
  'branch.url': {
    confidence: 'high',
    evidence:
      "ApexBranchTarget.url — live-witnessed: apextogo's sign-out branch (`url: &LOGOUT_URL.`). " +
      'See packages/parser/src/ast.ts ApexBranchTarget doc comment.',
  },
  'regionAction.page': {
    confidence: 'high',
    evidence:
      "ApexRegionActionTarget.page — live-witnessed: Oracle's own sample-cards gallery app, " +
      'p00002-blob-column.apx:118 (`action action ( type: fullCard behavior { target: { page: 14 ' +
      'items: { P14_EMPNO: &EMPNO. } clearCache: 14 } } )`). See packages/parser/src/ast.ts ' +
      'ApexRegionActionTarget doc comment.',
  },
  'regionAction.url': {
    confidence: 'high',
    evidence:
      "ApexRegionAction.url — live-witnessed: apextogo's home page, p00004-home.apx:151 " +
      '(`behavior { type: redirectUrl targetUrl: #action$open-search?category=&NAME. } }`), independently ' +
      're-confirmed against 10 real region actions in this project\'s own ux-pattern-catalog export ' +
      '(p00210-faceted-search-cards.apx, p00110-dashboard-simple.apx). See packages/parser/src/ast.ts ' +
      'ApexRegionActionTarget doc comment.',
  },
  'reportColumnLink.page': {
    confidence: 'high',
    evidence:
      "ApexColumnLinkTarget.page — live-witnessed: Oracle's own opportunities starter app, " +
      'p00002-accounts.apx:748 (`link { target: { page: 94 items: { P94_ID: #ID# } clearCache: 94 ' +
      'action: resetPagination } linkText: #CUSTOMER_NAME# } }`). See packages/parser/src/ast.ts ' +
      'ApexColumnLinkTarget doc comment.',
  },
  'reportColumnLink.url': {
    confidence: 'high',
    evidence:
      'ApexColumnLinkTarget.url — live-witnessed: ux-pattern-catalog, ' +
      'pages/p00320-item-detail-full.apx:459-464, column CHILD_RECORD_NAME ' +
      '(`link { target: { type: url url: # } linkText: #CHILD_RECORD_NAME# } }`), independently ' +
      're-confirmed against this project\'s own copy of the same export. See packages/parser/src/ast.ts ' +
      'ApexColumnLinkTarget doc comment (Eleventh round bug fix).',
  },
  'button.url': {
    confidence: 'high',
    evidence:
      'ApexButton.url (`behavior.action: redirectUrl`, `behavior.targetUrl`) — live-witnessed: 17 real ' +
      'buttons, ux-pattern-catalog (e.g. pages/p00110-dashboard-simple.apx:1136-1139, button view-details, ' +
      '`behavior { action: redirectUrl targetUrl: # }`). See packages/parser/src/ast.ts ApexButton.url doc comment.',
  },
  'button.page': {
    confidence: 'medium',
    evidence:
      'ApexButtonTarget (`behavior.target`, action: redirectThisApp/redirectOtherApp) — typed from the FULL ' +
      '`button-behavior-property` EBNF production (apexlang.ebnf:2578-2589) plus the already-proven ' +
      'projectPageTarget() helper shared with branch/regionAction/reportColumnLink, but NOT live-witnessed: ' +
      "a full sweep of this project's entire 46+ app real corpus (docs/ecosystem-roadmap.md Eleventh/" +
      'Thirteenth rounds) found ZERO real redirectThisApp/redirectOtherApp buttons. Structured and typed, ' +
      'not yet confirmed live for this specific variant — see packages/parser/src/ast.ts ApexButtonTarget ' +
      'doc comment for the full honest evidence-tier accounting this edge preserves.',
  },
};

/** Same page filter `docs.ts`/`coverage.ts`/`page-object.ts` already apply
 * -- page 0 is the parser's placeholder for unassigned/global constructs,
 * not a real navigable page; an alias-less page is never generated either.
 * Applied identically to both the node list AND target resolution (see
 * `resolvePageRef`) so a target referencing page 0 or an alias-less page
 * consistently falls to `unresolvedPage` rather than silently resolving
 * against a page this project doesn't otherwise treat as real. */
function realPages(ast: ApexAppAst): ApexPage[] {
  return [...ast.pages].filter((p) => p.id !== 0 && p.alias !== null).sort((a, b) => a.id - b.id);
}

function resolvePageRef(
  ref: number | string,
  pagesById: ReadonlyMap<number, ApexPage>,
  pagesByAlias: ReadonlyMap<string, ApexPage>,
): ApexPage | null {
  if (typeof ref === 'number') return pagesById.get(ref) ?? null;
  const trimmed = ref.trim();
  if (/^\d+$/.test(trimmed)) return pagesById.get(Number(trimmed)) ?? null;
  return pagesByAlias.get(trimmed.toUpperCase()) ?? null;
}

function buildTarget(
  pageRef: number | string | null,
  url: string | null,
  pagesById: ReadonlyMap<number, ApexPage>,
  pagesByAlias: ReadonlyMap<string, ApexPage>,
): FlowTarget | null {
  if (url !== null) return { kind: 'url', url };
  if (pageRef === null) return null;
  const resolved = resolvePageRef(pageRef, pagesById, pagesByAlias);
  if (resolved) return { kind: 'page', nodeId: `page:${resolved.id}`, pageId: resolved.id };
  return { kind: 'unresolvedPage', ref: pageRef };
}

/** Raw, source-normalized navigation data before it's turned into an edge
 * -- the common shape every one of the four sources' target objects
 * reduces to, so the edge-building loop below is written once, not four
 * times. `null` fields are honest absence, never invented defaults. */
interface RawTargetData {
  pageRef: number | string | null;
  url: string | null;
  items: Record<string, string> | null;
  clearCache: string | null;
}

function fromBranch(b: ApexBranch): RawTargetData | null {
  const t = b.target;
  if (!t) return null;
  if (t.page === null && t.url === null) return null;
  return { pageRef: t.page, url: t.url, items: t.items, clearCache: null };
}

function fromRegionAction(a: ApexRegionAction): RawTargetData | null {
  const t = a.target;
  if (a.url === null && (!t || t.page === null)) return null;
  return { pageRef: t?.page ?? null, url: a.url, items: t?.items ?? null, clearCache: t?.clearCache ?? null };
}

function fromReportColumn(c: ApexReportColumn): RawTargetData | null {
  const t = c.linkTarget;
  if (!t) return null;
  if (t.page === null && t.url === null) return null;
  return { pageRef: t.page, url: t.url, items: t.items, clearCache: t.clearCache };
}

function fromButton(btn: ApexButton): RawTargetData | null {
  const t = btn.target;
  if (btn.url === null && (!t || t.page === null)) return null;
  return { pageRef: t?.page ?? null, url: btn.url, items: t?.items ?? null, clearCache: t?.clearCache ?? null };
}

/** `.page`/`.url` mechanism variant is chosen by which field is actually
 * populated -- `url` wins when both would somehow be set (not observed in
 * real data for any of the four sources; each is a mutually-exclusive
 * `behavior.action`/`type` enum choice in practice, per every source
 * type's own `ast.ts` doc comment), matching `FlowTarget`'s own
 * `url`-takes-precedence construction in `buildTarget` above. */
function mechanismFor(source: FlowEdgeSource, data: RawTargetData): FlowEdgeMechanism {
  const variant = data.url !== null ? 'url' : 'page';
  return `${source}.${variant}` as FlowEdgeMechanism;
}

function edgeId(source: FlowEdgeSource, pageId: number, regionIdentifier: string | null, ordinal: number): string {
  const regionPart = regionIdentifier !== null ? `${regionIdentifier}:` : '';
  return `${source}:page${pageId}:${regionPart}${ordinal}`;
}

function makeEdge(
  from: FlowNodeId,
  data: RawTargetData,
  mechanism: FlowEdgeMechanism,
  source: FlowEdgeSource,
  id: string,
  sourceIdentifier: string | null,
  label: string | null,
  regionIdentifier: string | null,
  condition: ApexServerSideCondition | null,
  pagesById: ReadonlyMap<number, ApexPage>,
  pagesByAlias: ReadonlyMap<string, ApexPage>,
): FlowEdge | null {
  const to = buildTarget(data.pageRef, data.url, pagesById, pagesByAlias);
  if (!to) return null;
  const { confidence, evidence } = FLOW_MECHANISM_EVIDENCE[mechanism];
  return {
    id,
    from,
    to,
    mechanism,
    source,
    sourceIdentifier,
    label,
    regionIdentifier,
    condition,
    items: data.items,
    clearCache: data.clearCache,
    confidence,
    evidence,
  };
}

/**
 * Pure, testable core -- consumes the already-typed `ApexAppAst` and
 * nothing else (same input contract as `diffPageContents`/`pageDocs`).
 * `computeFlowMap` below is the IO wrapper that parses a real export
 * directory and calls this.
 */
export function buildFlowMap(ast: ApexAppAst): FlowMap {
  const pages = realPages(ast);
  const pagesById = new Map(pages.map((p) => [p.id, p]));
  const pagesByAlias = new Map(pages.map((p) => [p.alias!.toUpperCase(), p]));

  const nodes: FlowNode[] = pages.map((p) => ({
    id: `page:${p.id}`,
    pageId: p.id,
    alias: p.alias!,
    name: p.name,
  }));

  const edges: FlowEdge[] = [];

  for (const page of pages) {
    const from: FlowNodeId = `page:${page.id}`;

    // Source 1: page branches.
    page.branches.forEach((b, idx) => {
      const data = fromBranch(b);
      if (!data) return;
      const mechanism = mechanismFor('branch', data);
      const edge = makeEdge(
        from,
        data,
        mechanism,
        'branch',
        edgeId('branch', page.id, null, idx),
        b.identifier,
        b.name,
        null,
        b.condition,
        pagesById,
        pagesByAlias,
      );
      if (edge) edges.push(edge);
    });

    // Source 2: Cards/List region actions.
    for (const region of page.regions) {
      region.actions.forEach((a, idx) => {
        const data = fromRegionAction(a);
        if (!data) return;
        const mechanism = mechanismFor('regionAction', data);
        const edge = makeEdge(
          from,
          data,
          mechanism,
          'regionAction',
          edgeId('regionAction', page.id, region.identifier, idx),
          a.identifier,
          a.label,
          region.identifier,
          null,
          pagesById,
          pagesByAlias,
        );
        if (edge) edges.push(edge);
      });

      // Source 3: report/IR/IG column links.
      region.columns.forEach((c, idx) => {
        const data = fromReportColumn(c);
        if (!data) return;
        const mechanism = mechanismFor('reportColumnLink', data);
        const edge = makeEdge(
          from,
          data,
          mechanism,
          'reportColumnLink',
          edgeId('reportColumnLink', page.id, region.identifier, idx),
          c.identifier,
          c.heading,
          region.identifier,
          null,
          pagesById,
          pagesByAlias,
        );
        if (edge) edges.push(edge);
      });
    }

    // Source 4: buttons (page-level flat list -- includes region-owned
    // buttons too, same single-source-of-truth list `docs.ts`/`diff.ts`
    // already rely on; NOT also iterated per-region, which would double
    // an edge for every region-owned button).
    page.buttons.forEach((btn, idx) => {
      const data = fromButton(btn);
      if (!data) return;
      const mechanism = mechanismFor('button', data);
      const edge = makeEdge(
        from,
        data,
        mechanism,
        'button',
        edgeId('button', page.id, null, idx),
        btn.identifier,
        btn.label,
        null,
        null,
        pagesById,
        pagesByAlias,
      );
      if (edge) edges.push(edge);
    });
  }

  const hasIncoming = new Set<number>();
  for (const e of edges) {
    if (e.to.kind === 'page') hasIncoming.add(e.to.pageId);
  }
  const pagesWithNoIncomingEdges = nodes.map((n) => n.pageId).filter((id) => !hasIncoming.has(id));

  return {
    flowMapVersion: '0.1.0',
    nodes,
    edges,
    reachability: { pagesWithNoIncomingEdges },
  };
}

/** IO wrapper -- parses a real export directory and builds the Flow Map.
 * Mirrors `computeDiff`/`computeCoverage`/`generateDocs`'s own
 * `loadExport()`+`parseApp()` pipeline exactly. */
export function computeFlowMap(exportDir: string): FlowMap {
  const result = parseApp(loadExport(resolve(exportDir)));
  return buildFlowMap(result.ast);
}
