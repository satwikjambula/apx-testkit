/**
 * Coverage recorder -- OPT-IN, zero overhead unless enabled. Set
 * APX_COVERAGE_LOG to a file path and every item/region/button primitive
 * used during a test run appends a line recording which `.apx` identifier
 * it touched. `@apx/testgen`'s `apx-coverage` CLI cross-references this log
 * against the AST to report which declared components a suite actually
 * exercises -- see packages/generator/src/coverage.ts.
 *
 * Design choices, and why:
 * - File-append (JSONL), not an in-memory Set: Playwright can run tests in
 *   multiple worker PROCESSES, each with its own module state. An in-memory
 *   recorder would silently lose touches from every worker but one. A
 *   shared append-only file survives that (each append is a single
 *   `fs.appendFileSync` call, small enough to not need explicit locking for
 *   this project's scale).
 * - Disabled by default (no env var set): recording has a real cost (a
 *   sync file write per touch) that most test runs shouldn't pay for.
 * - item/region touches: `identifier` IS already a stable semantic
 *   identifier (the `.apx` pageItem id / the region's resolved runtime
 *   id), not presentation text -- unchanged by the schema below.
 * - button touches: UPDATED (runtime-review P0 item 4) to carry semantic
 *   identity SEPARATELY from the runtime locator value. Recording only a
 *   button's LABEL used to silently collapse two DIFFERENT buttons that
 *   happen to share a label (e.g. `SAVE_EMPLOYEE` and `SAVE_REQUEST`,
 *   both labeled "Save") into a single coverage entry, losing identity --
 *   exactly the "persistent artifacts must reference stable semantic
 *   identifiers... never presentation text" guardrail in
 *   DESIGN_GUARDRAILS.md. `recordButtonCoverageTouch()` below records
 *   `{ pageId, identifier, runtimeLocator: { strategy: 'accessible-name',
 *   value: label } }` -- the label is kept, but demoted to being the
 *   runtime LOCATOR value, never the identity. See button.ts.
 */
import { appendFileSync } from 'node:fs';

export type CoverageKind = 'item' | 'region' | 'button';

/**
 * How a touch was actually located/dispatched at runtime -- kept
 * SEPARATE from `identifier` so presentation text (a button's visible
 * label) is never conflated with a stable identifier.
 */
export interface CoverageRuntimeLocator {
  strategy: 'accessible-name' | 'apex-item-id' | 'apex-region-id' | 'html-dom-id';
  value: string;
}

export interface CoverageTouch {
  kind: CoverageKind;
  /**
   * Stable `.apx` identifier. For item/region touches: the same value
   * already used to dispatch (the pageItem id / the region's resolved
   * runtime id) -- unchanged. For BUTTON touches: the button's semantic
   * `.apx` `identifier` field when known (e.g. `SAVE_EMPLOYEE`), NEVER
   * its display label -- falls back to the label itself only when no
   * richer identity was supplied to `recordButtonCoverageTouch()` (a
   * degraded case for callers that genuinely don't have it, not the
   * default for generated code, which always supplies it).
   */
  identifier: string;
  /**
   * Page id this touch occurred on, when known. Buttons are only
   * guaranteed unique BY IDENTIFIER within a single page (two different
   * pages can each independently declare their own `SAVE`-identified
   * button) -- `pageId` disambiguates that. `null` for item/region
   * touches (unchanged from before this schema existed) and for button
   * touches where the caller didn't supply identity.
   */
  pageId: number | null;
  /**
   * How this was actually located at runtime. `null` for item/region
   * touches (unchanged -- their `identifier` already doubles as the
   * dispatch value, so a separate locator field would be redundant);
   * always populated for button touches.
   */
  runtimeLocator: CoverageRuntimeLocator | null;
  ts: number;
}

export function coverageEnabled(): boolean {
  return !!process.env.APX_COVERAGE_LOG;
}

function appendTouch(entry: Omit<CoverageTouch, 'ts'>): void {
  const logPath = process.env.APX_COVERAGE_LOG;
  if (!logPath) return;
  const full: CoverageTouch = { ...entry, ts: Date.now() };
  appendFileSync(logPath, JSON.stringify(full) + '\n');
}

/**
 * Record an item/region touch -- unchanged shape/contract from before
 * this file's button-identity rework. `identifier` is already a stable
 * `.apx`-derived value for both kinds (never presentation text), so
 * there is no separate runtime-locator/pageId concern here.
 */
export function recordCoverageTouch(kind: 'item' | 'region', identifier: string): void {
  appendTouch({ kind, identifier, pageId: null, runtimeLocator: null });
}

export interface ButtonCoverageIdentity {
  /** The page this button belongs to. */
  pageId: number;
  /** The button's semantic `.apx` `identifier` field -- never its label. */
  identifier: string;
}

/**
 * Record a button touch with full semantic identity, separate from the
 * runtime locator actually used to find it. `identity` is optional ONLY
 * for backward compatibility with callers (e.g. older hand-written
 * specs) that don't have it on hand -- when omitted, this degrades to
 * `{ pageId: null, identifier: runtimeLocator.value }`, the same
 * collapsed behavior this function exists to move away from, so callers
 * that CAN supply identity (generated code always can) always should.
 */
export function recordButtonCoverageTouch(runtimeLocator: CoverageRuntimeLocator, identity?: ButtonCoverageIdentity): void {
  appendTouch({
    kind: 'button',
    pageId: identity?.pageId ?? null,
    identifier: identity?.identifier ?? runtimeLocator.value,
    runtimeLocator,
  });
}
