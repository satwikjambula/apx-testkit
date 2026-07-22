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
 * - Records the LABEL for buttons, not a static id -- buttonByLabel's own
 *   contract is label-based (see button.ts); the coverage report cross-
 *   references by label against the AST's button.label field, not identifier.
 */
import { appendFileSync } from 'node:fs';

export type CoverageKind = 'item' | 'region' | 'button';

export interface CoverageTouch {
  kind: CoverageKind;
  /** pageItem/region identifier, or button label (see module doc). */
  identifier: string;
  ts: number;
}

export function coverageEnabled(): boolean {
  return !!process.env.APX_COVERAGE_LOG;
}

export function recordCoverageTouch(kind: CoverageKind, identifier: string): void {
  const logPath = process.env.APX_COVERAGE_LOG;
  if (!logPath) return;
  const entry: CoverageTouch = { kind, identifier, ts: Date.now() };
  appendFileSync(logPath, JSON.stringify(entry) + '\n');
}
