/**
 * Runtime region-id resolution -- the actual implementation of ADR-003's
 * layered strategy (`.ai/ADR/003-region-resolution-layered-strategy.md`),
 * not a static `htmlDomId ?? identifier` guess baked in at generation
 * time.
 *
 * Why this exists: `@apx/testgen` (and hand-written specs) used to embed
 * a SINGLE, statically-chosen candidate id (`region.htmlDomId ??
 * region.identifier`) directly into generated code, with no live
 * confirmation that the chosen candidate actually resolves. That is a
 * guess with no fallback and no way to know, from a generated test's
 * failure alone, whether the wrong LAYER was picked (e.g. `htmlDomId`
 * present but stale/wrong) versus the region genuinely not existing.
 * `resolveRegion()` instead tries each evidence-backed candidate, IN
 * ORDER, against the real `apex.region()` call live, and reports which
 * one actually worked.
 *
 * Candidate order, per ADR-003:
 *   1. `htmlDomId` -- confirmed live to deterministically predict the
 *      runtime id when set (Interactive Grid, Chart, Interactive Report
 *      all directly confirmed -- see docs/quirks/26.1.json
 *      `region-id-not-static-id`).
 *   2. The `.apx` export identifier -- true for the large majority of
 *      regions (~93% of IR/Cards/Faceted Search in this project's local
 *      corpus), but a fallback assumption, not a guarantee.
 *   3. An explicit override -- NOT emitted by the generator (it has no
 *      evidence-backed source for one). This is for HAND-WRITTEN specs
 *      only, when a human has already discovered the real runtime id via
 *      live DOM inspection (ADR-003 layer 3, e.g. Interactive Grid's
 *      `basic-editing` -> `emp`) and wants it tried as a last resort
 *      candidate, still going through the same live-confirmation path
 *      (never assumed correct without being checked).
 *
 * Deliberately NOT built: any DOM-heuristic or CSS-selector-guessing
 * fallback. Every candidate this function is given must already be an
 * evidence-backed identifier (a real `.apx` field or a human-verified
 * override) -- see DESIGN_GUARDRAILS.md "Never generate code from DOM
 * heuristics when verified metadata or a documented API already exists."
 * If none of the supplied candidates resolve, this throws a specific,
 * actionable error rather than falling back to a guess.
 */
import type { Page } from '@playwright/test';
import { recordCoverageTouch } from '../fixtures/coverage.js';

/** Which ADR-003 layer a candidate represents. */
export type RegionResolutionStrategy = 'htmlDomId' | 'export-identifier' | 'override';

export interface RegionCandidate {
  /** The id to try against apex.region(). */
  value: string;
  /** Which ADR-003 layer this candidate represents -- carried through to the result, never inferred after the fact. */
  strategy: RegionResolutionStrategy;
}

export interface ResolvedRegion {
  /** The real runtime id apex.region() resolved -- confirmed live, not assumed. */
  runtimeId: string;
  /** Which candidate/layer actually worked. */
  strategy: RegionResolutionStrategy;
}

/**
 * Build the standard, evidence-backed candidate list for a region from
 * parsed `.apx` AST data -- `htmlDomId` first (when set), then the export
 * identifier. This is the single source of truth `@apx/testgen` uses to
 * emit candidate literals, so hand-written specs constructing the same
 * list get byte-for-byte the same ordering/strategy labels.
 */
export function regionCandidatesFromAst(region: { readonly identifier: string; readonly htmlDomId: string | null }): RegionCandidate[] {
  const candidates: RegionCandidate[] = [];
  if (region.htmlDomId) candidates.push({ value: region.htmlDomId, strategy: 'htmlDomId' });
  candidates.push({ value: region.identifier, strategy: 'export-identifier' });
  return candidates;
}

/**
 * Resolve a region's actual runtime id by calling `apex.region(candidate)`
 * live, trying each candidate in order, and returning the first one that
 * resolves to a real widget region -- never the first one that merely
 * LOOKS right. Records a page-scoped coverage touch only for the candidate
 * that actually resolves; failed probes never inflate coverage.
 *
 * Hard failure (not a silent fallback, not a guess) if NO candidate
 * resolves -- the error names every candidate tried and its strategy, so
 * the next person debugging it knows exactly what was attempted.
 */
export async function resolveRegion(
  page: Page,
  candidates: readonly RegionCandidate[],
  pageId?: number,
): Promise<ResolvedRegion> {
  if (candidates.length === 0) {
    throw new Error(
      'resolveRegion(): no candidates supplied -- at minimum the .apx export identifier is required. ' +
        'See regionCandidatesFromAst() for the standard ADR-003 candidate order.',
    );
  }
  for (const candidate of candidates) {
    const resolved = await page.evaluate((id: string) => {
      const region = (window as any).apex?.region?.(id);
      return !!region;
    }, candidate.value);
    if (resolved) {
      recordCoverageTouch('region', candidate.value, pageId);
      return { runtimeId: candidate.value, strategy: candidate.strategy };
    }
  }
  const tried = candidates.map((c) => `'${c.value}' (${c.strategy})`).join(', ');
  throw new Error(
    `resolveRegion(): none of the candidate ids resolved via apex.region() -- tried ${tried}. ` +
      'This region may need a live-discovered override candidate (ADR-003 layer 3 -- e.g. Interactive ' +
      "Grid's export 'basic-editing' resolving at runtime as 'emp'), or it may be a form/staticContent " +
      'region, which is confirmed NOT to resolve via apex.region() at all, by design -- see ' +
      'docs/grammar-assumptions.md "Still open" and docs/quirks/26.1.json `region-id-not-static-id` ' +
      'before assuming this is a bug.',
  );
}
