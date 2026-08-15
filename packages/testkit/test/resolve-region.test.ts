import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { regionCandidatesFromAst, resolveRegion, type RegionCandidate } from '../src/components/resolve-region.js';

/**
 * resolveRegion() dispatches through page.evaluate(fn, id), which runs
 * `fn` against a real browser's `window` in production. These tests
 * fake that boundary with a minimal Page stand-in whose evaluate()
 * invokes `fn` directly against a Node-side `window` stand-in -- this
 * exercises resolveRegion()'s own control flow (candidate order, which
 * strategy wins, the hard-failure message) without needing a live
 * browser. The live apex.region() semantics themselves are already
 * evidence-backed by docs/quirks/26.1.json `region-id-not-static-id`
 * (see ADR-003) -- this suite is regression coverage for the NEW
 * resolver logic added on top of that evidence, not a re-verification
 * of the underlying Oracle behavior.
 */
function fakePage(resolvableIds: readonly string[]) {
  const evaluated: string[] = [];
  return {
    evaluate: async (fn: (id: string) => boolean, id: string) => {
      evaluated.push(id);
      (globalThis as any).window = {
        apex: { region: (candidateId: string) => (resolvableIds.includes(candidateId) ? { id: candidateId } : null) },
      };
      try {
        return fn(id);
      } finally {
        delete (globalThis as any).window;
      }
    },
    evaluated,
  };
}

describe('resolveRegion', () => {
  afterEach(() => {
    delete (globalThis as any).window;
    delete process.env.APX_COVERAGE_LOG;
  });

  it('resolves the first candidate that succeeds and reports its strategy (htmlDomId)', async () => {
    const page = fakePage(['emp']);
    const candidates: RegionCandidate[] = [
      { value: 'emp', strategy: 'htmlDomId' },
      { value: 'basic-editing', strategy: 'export-identifier' },
    ];
    const result = await resolveRegion(page as any, candidates);
    expect(result).toEqual({ runtimeId: 'emp', strategy: 'htmlDomId' });
    // Only the winning candidate should have been evaluated -- resolveRegion
    // must not keep probing once it finds a match.
    expect(page.evaluated).toEqual(['emp']);
  });

  it('falls back to export-identifier when htmlDomId does not resolve', async () => {
    const page = fakePage(['projects_report']);
    const candidates: RegionCandidate[] = [
      { value: 'stale-html-dom-id', strategy: 'htmlDomId' },
      { value: 'projects_report', strategy: 'export-identifier' },
    ];
    const result = await resolveRegion(page as any, candidates);
    expect(result).toEqual({ runtimeId: 'projects_report', strategy: 'export-identifier' });
    expect(page.evaluated).toEqual(['stale-html-dom-id', 'projects_report']);
  });

  it('records only the successful candidate, with page identity', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'apx-resolve-coverage-'));
    const log = join(dir, 'touches.jsonl');
    process.env.APX_COVERAGE_LOG = log;
    try {
      await resolveRegion(
        fakePage(['actual']) as any,
        [
          { value: 'stale', strategy: 'htmlDomId' },
          { value: 'actual', strategy: 'export-identifier' },
        ],
        42,
      );
      const touches = readFileSync(log, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
      expect(touches).toHaveLength(1);
      expect(touches[0]).toMatchObject({ kind: 'region', identifier: 'actual', pageId: 42 });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not record coverage when no candidate resolves', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'apx-resolve-coverage-fail-'));
    const log = join(dir, 'touches.jsonl');
    process.env.APX_COVERAGE_LOG = log;
    try {
      await expect(resolveRegion(fakePage([]) as any, [{ value: 'missing', strategy: 'export-identifier' }], 42)).rejects.toThrow();
      expect(() => readFileSync(log, 'utf8')).toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('tries an explicit override candidate as a last resort', async () => {
    const page = fakePage(['emp']);
    const candidates: RegionCandidate[] = [
      { value: 'basic-editing', strategy: 'export-identifier' },
      { value: 'emp', strategy: 'override' },
    ];
    const result = await resolveRegion(page as any, candidates);
    expect(result).toEqual({ runtimeId: 'emp', strategy: 'override' });
  });

  it('throws a specific, actionable error naming every candidate tried when none resolve', async () => {
    const page = fakePage([]);
    const candidates: RegionCandidate[] = [
      { value: 'area-chart-color-javascript-code-customization', strategy: 'export-identifier' },
    ];
    await expect(resolveRegion(page as any, candidates)).rejects.toThrow(
      /none of the candidate ids resolved.*'area-chart-color-javascript-code-customization' \(export-identifier\)/s,
    );
  });

  it('throws immediately if given zero candidates, without touching the page at all', async () => {
    const page = fakePage(['emp']);
    await expect(resolveRegion(page as any, [])).rejects.toThrow(/no candidates supplied/);
    expect(page.evaluated).toEqual([]);
  });

  it('never falls back to a DOM-heuristic guess -- only the exact candidates supplied are ever tried', async () => {
    const page = fakePage(['emp_ig', 'emp']);
    // Only 'wrong-guess' supplied -- resolveRegion must not try 'emp' or
    // 'emp_ig' on its own initiative even though they'd resolve.
    await expect(resolveRegion(page as any, [{ value: 'wrong-guess', strategy: 'export-identifier' }])).rejects.toThrow();
    expect(page.evaluated).toEqual(['wrong-guess']);
  });
});

describe('regionCandidatesFromAst', () => {
  it('puts htmlDomId first when set, per ADR-003 layer 1', () => {
    expect(regionCandidatesFromAst({ identifier: 'basic-editing', htmlDomId: 'emp' })).toEqual([
      { value: 'emp', strategy: 'htmlDomId' },
      { value: 'basic-editing', strategy: 'export-identifier' },
    ]);
  });

  it('falls back to only the export identifier when htmlDomId is null, per ADR-003 layer 2', () => {
    expect(regionCandidatesFromAst({ identifier: 'projects', htmlDomId: null })).toEqual([
      { value: 'projects', strategy: 'export-identifier' },
    ]);
  });
});
