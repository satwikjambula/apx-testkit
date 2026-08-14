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
 * evidence citation in `FLOW_MECHANISM_EVIDENCE` below. All eight are
 * `'high'` (live-witnessed, real data, real line citations).
 *
 * CORRECTED IN PLACE (Fourteenth round, QA/Verification Engineer
 * release-gate pass, `docs/ecosystem-roadmap.md`): this paragraph
 * previously read "Seven are `'high'` ... Exactly one — `button.page` ... —
 * is `'medium'` ... a full sweep of every locally accessible real export
 * (this project's entire 46+ app corpus ...) found ZERO real occurrences of
 * either enum value." That claim was false — it was never actually checked
 * against the full corpus, only a single app (`ux-pattern-catalog`).
 * `concurrent-manager`, already on record in this project's own corpus list
 * before that claim shipped, contains 17 real `redirectThisApp`
 * occurrences (zero `redirectOtherApp`) across 12 distinct pages, with all
 * three of `ApexButtonTarget`'s fields (`page`, `items`, `clearCache`)
 * independently witnessed. `button.page` is now `'high'` — see
 * `FLOW_MECHANISM_EVIDENCE['button.page']` below and `ApexButtonTarget`'s
 * doc comment in `packages/parser/src/ast.ts` for the full corrected
 * evidence and the reasoning for why one real app at this occurrence depth
 * meets the same bar already used for `branch.url`/`button.url`'s `'high'`
 * entries (both also single-app-sourced).
 *
 * **Substitution-syntax audit (Runtime & Test Automation Engineer,
 * 2026-08-13)** — a full sweep of every field on all four Phase 1a
 * sources (not just `to`/`page`/`url`, which `FlowTarget`'s
 * `unresolvedPage` variant was already designed for) across every real,
 * locally accessible export (`ux-pattern-catalog`, `apextogo`,
 * `sample-cards`, `concurrent-manager`), cross-checked directly against
 * the official EBNF (`docs.oracle.com/.../apexlang.ebnf`, raw `curl`,
 * never a summarizing fetch, per ADR-004). Findings:
 *   - `to` (`page`/`url`): confirmed correctly classified on every real
 *     occurrence found, including a case NOT previously covered by any
 *     regression test — a button's `target.page` value that is itself a
 *     bare item name with no `&`/`.`/`#` sigils at all (`concurrent-manager`,
 *     `pages/p00090-request-details-log-viewer.apx:1762-1768`,
 *     `target: { page: P185_RUN_ID items: { P185_RUN_ID: &P90_REQUEST_ID. }
 *     clearCache: 185 }`) — correctly falls through to `unresolvedPage`
 *     (not numeric, not a real page alias), the same honest-non-guess
 *     behavior already proven for the `&LAST_VIEW.`-style sigil form. Now
 *     locked in as its own regression case in `test/flow.test.ts`.
 *   - `items`: confirmed passed through completely verbatim on every real
 *     occurrence checked (`&ITEM.`, `#ITEM#`, and even a raw
 *     backslash-escaped token straight from the exporter,
 *     `\&ROWID.\` — see `FlowEdge.items`'s own doc comment) — never
 *     resolved, matching this project's permanent, deliberate scope
 *     boundary (resolving these needs live session state, which this
 *     module will never have).
 *   - `condition` (branch-only field): zero real occurrences of
 *     substitution syntax in `whenButtonPressed`/`type`/`item`/`value`/
 *     `plsqlExpression` across the accessible corpus (15 real branches, 9
 *     with a condition) — `whenButtonPressed` is a component REFERENCE
 *     (`@identifier`, EBNF `<reference>`), a structurally different
 *     syntax from item-substitution, already correctly unwrapped by the
 *     parser's `refName()`, not something this module needs to change.
 *     Nothing to fix; nothing more to lock in without inventing an
 *     unwitnessed case.
 *   - `clearCache`: confirmed real data shows both a plain page number and
 *     a real item-substitution token (`#EDIT_PAGE#`, `strategic-planner`)
 *     on the three sources that type it — both pass through unmodified.
 *     BUT found one real, genuine gap: `ApexBranchTarget` never typed a
 *     `clearCache` field at all (unlike its three siblings), even though
 *     real branches DO carry one (`concurrent-manager`,
 *     `pages/p00351-lookup-manager1.apx:960-968`) — see `FlowEdge.clearCache`'s
 *     own doc comment (corrected in place there) for the full finding. This
 *     was, at the time, a `packages/parser` typed-field gap, not a
 *     `flow.ts` bug — filed to `/parser` via `docs/grammar-assumptions.md`'s
 *     "Still open" section, out of this module's ownership to fix directly.
 *     CORRECTED IN PLACE (2026-08-14): that parser-side gap is now closed
 *     (`ApexBranchTarget.clearCache` typed, Fifteenth round) and `flow.ts`'s
 *     own follow-up is done — `fromBranch()` now reads it; see
 *     `FlowEdge.clearCache`'s doc comment for the current, real behavior.
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
 * page-target vs. URL-redirect variant. `button.page`/`button.url` now
 * carry the same `'high'` confidence tier (corrected Fourteenth round --
 * they previously differed, `button.page` was `'medium'`), but the split
 * is kept for every source, `button` included, so `FLOW_MECHANISM_EVIDENCE`'s
 * citations stay precise and individually checkable -- each variant has its
 * own distinct real-data citation (see `ast.ts`'s doc comments) even when
 * the resulting tier happens to match.
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
   * construct's target object carries them; `null` otherwise. Values are
   * passed through completely verbatim from the AST -- never resolved,
   * never re-typed, never re-escaped -- including item-substitution tokens
   * (`&ITEM.`/`#ITEM#`) and even a raw backslash-escaped token exactly as
   * the exporter wrote it (`concurrent-manager`,
   * `pages/p00195-email-template-manager.apx:185`: `P196_ROWID: \&ROWID.\`
   * -- the literal backslashes are part of the export, not a parser
   * artifact, and this project's own `targetItems()` helper in
   * `packages/parser/src/parser.ts` never touches them). Resolving these
   * would require live session-state evaluation, permanently out of scope
   * for this static, no-live-app module -- see this file's own doc comment. */
  items: Record<string, string> | null;
  /**
   * Cache-clear directive, when the source construct's target object
   * carries one. `ApexRegionActionTarget`/`ApexColumnLinkTarget`/
   * `ApexButtonTarget` all type it (a bare string, verbatim -- real data
   * confirms both plain page numbers, e.g. `clearCache: 335`
   * (`concurrent-manager`, `pages/p00330-lookup-manager.apx:281`), and a
   * real item-substitution token, `clearCache: #EDIT_PAGE#`
   * (`strategic-planner`, `pages/p00003-project-details.apx:2154`, see
   * `docs/grammar-assumptions.md`) -- both pass through this field
   * unresolved and unmodified, matching `items`' own contract above).
   *
   * CORRECTED IN PLACE (Runtime & Test Automation Engineer, 2026-08-14):
   * this comment previously described `branch.*` edges as unconditionally
   * `null` here because `ApexBranchTarget` (`packages/parser/src/ast.ts`)
   * had no typed `clearCache` field at all -- a real, filed parser-level
   * gap (Fourteenth round's substitution-syntax audit,
   * `docs/grammar-assumptions.md`'s "Still open" section). That gap is now
   * closed: the Compiler/Parser Engineer added `ApexBranchTarget.clearCache:
   * string | null` (Fifteenth round), read by `projectBranchTarget()`
   * (`packages/parser/src/parser.ts`) the same way `projectPageTarget()`
   * already reads it for the three sibling target types. `fromBranch()`
   * below now reads `t.clearCache` directly instead of hardcoding `null`,
   * matching `fromRegionAction()`/`fromReportColumn()`/`fromButton()`'s own
   * pattern exactly -- no branch-specific shape invented. Real evidence,
   * re-confirmed live via `apx-flow` against `concurrent-manager` both
   * before and after this fix: `pages/p00351-lookup-manager1.apx:960-968`,
   * the "Redirect to all" branch (`behavior { target: { page: 350
   * clearCache: 350 action: resetPagination } }`) now produces a
   * `branch.page` edge with `clearCache: "350"` (coerced to `String(...)`,
   * matching the sibling sources' own coercion in `projectPageTarget()`);
   * its sibling "Redirect to new" branch on the same page (no `clearCache`
   * key in the source) still correctly produces `clearCache: null` --
   * both real shapes locked in `test/flow.test.ts`.
   */
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
    confidence: 'high',
    evidence:
      'ApexButtonTarget (`behavior.target`, action: redirectThisApp/redirectOtherApp) — typed from the FULL ' +
      '`button-behavior-property` EBNF production (apexlang.ebnf:2578-2589) plus the already-proven ' +
      'projectPageTarget() helper shared with branch/regionAction/reportColumnLink. Live-witnessed: ' +
      "concurrent-manager (this project's own corpus, docs/ecosystem-roadmap.md Fourteenth round) contains " +
      '17 real redirectThisApp occurrences (zero redirectOtherApp) across 12 distinct pages, e.g. ' +
      'pages/p00020-workday-calendar-manager.apx:207-210 (`action: redirectThisApp target: { page: 25 }`). ' +
      'All three ApexButtonTarget fields are independently witnessed in that same app: clearCache ' +
      '(p00120-request-set-builder.apx:379-383), items (p00330-lookup-manager.apx:274-280), and a page value ' +
      'that is itself an item-substitution token rather than a literal number ' +
      "(p00090-request-details-log-viewer.apx:1762-1768). CORRECTED from a prior `'medium'` tier whose evidence " +
      'string wrongly claimed a full corpus sweep found no real occurrences -- that sweep was only ever a ' +
      'single-app check (ux-pattern-catalog), never the full corpus it described — see ' +
      'packages/parser/src/ast.ts ApexButtonTarget doc comment for the full corrected evidence and the ' +
      "reasoning for treating one real app at this occurrence depth as 'high', matching the bar " +
      'already used for branch.url/button.url. redirectOtherApp specifically remains unwitnessed in real data.',
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
  return { pageRef: t.page, url: t.url, items: t.items, clearCache: t.clearCache };
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
