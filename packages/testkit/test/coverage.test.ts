import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { recordButtonCoverageTouch, recordCoverageTouch } from '../src/fixtures/coverage.js';

/**
 * Regression coverage for the P0 item 4 fix (runtime-review):
 * `recordCoverageTouch('button', label)` used to collapse two DIFFERENT
 * buttons sharing a label (e.g. SAVE_EMPLOYEE and SAVE_REQUEST, both
 * labeled "Save") into the same coverage entry, losing identity --
 * exactly the "persistent artifacts must reference stable semantic
 * identifiers... never presentation text" guardrail in
 * DESIGN_GUARDRAILS.md. `recordButtonCoverageTouch()` now carries
 * `pageId`/`identifier` separately from the runtime locator actually
 * used (the label or, for `buttonByHtmlDomId()`, the static id).
 */
describe('coverage touch recording', () => {
  let logPath: string;
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'apx-coverage-test-'));
    logPath = join(dir, 'touches.jsonl');
    process.env.APX_COVERAGE_LOG = logPath;
  });

  afterEach(() => {
    delete process.env.APX_COVERAGE_LOG;
    rmSync(dir, { recursive: true, force: true });
  });

  function readTouches(): any[] {
    return readFileSync(logPath, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));
  }

  it('item/region touches carry page identity when supplied', () => {
    recordCoverageTouch('item', 'P3_ENAME', 3);
    recordCoverageTouch('region', 'projects_report', 3);
    const touches = readTouches();
    expect(touches).toEqual([
      { kind: 'item', identifier: 'P3_ENAME', pageId: 3, runtimeLocator: null, ts: expect.any(Number) },
      { kind: 'region', identifier: 'projects_report', pageId: 3, runtimeLocator: null, ts: expect.any(Number) },
    ]);
  });

  it('retains null pageId for backward-compatible identity-free callers', () => {
    recordCoverageTouch('region', 'legacy-region');
    expect(readTouches()[0]).toMatchObject({ identifier: 'legacy-region', pageId: null });
  });

  it('two DIFFERENT buttons sharing the SAME label produce DISTINCT touch entries when identity is supplied', () => {
    recordButtonCoverageTouch({ strategy: 'accessible-name', value: 'Save' }, { pageId: 3, identifier: 'SAVE_EMPLOYEE' });
    recordButtonCoverageTouch({ strategy: 'accessible-name', value: 'Save' }, { pageId: 4, identifier: 'SAVE_REQUEST' });
    const touches = readTouches();
    expect(touches).toHaveLength(2);
    expect(touches[0]).toMatchObject({ identifier: 'SAVE_EMPLOYEE', pageId: 3, runtimeLocator: { strategy: 'accessible-name', value: 'Save' } });
    expect(touches[1]).toMatchObject({ identifier: 'SAVE_REQUEST', pageId: 4, runtimeLocator: { strategy: 'accessible-name', value: 'Save' } });
    // The two touches are genuinely distinguishable -- this is the actual
    // bug fix: before this change, both would have collapsed to
    // identifier: 'Save' with no way to tell them apart.
    expect(touches[0].identifier).not.toBe(touches[1].identifier);
  });

  it('degrades to label-as-identifier when identity is omitted (backward compatible, not the default for generated code)', () => {
    recordButtonCoverageTouch({ strategy: 'accessible-name', value: 'Cancel' });
    const [touch] = readTouches();
    expect(touch).toMatchObject({ identifier: 'Cancel', pageId: null, runtimeLocator: { strategy: 'accessible-name', value: 'Cancel' } });
  });

  it('records a distinct runtimeLocator.strategy for html-dom-id-based lookups', () => {
    recordButtonCoverageTouch({ strategy: 'html-dom-id', value: 'save-button' }, { pageId: 57, identifier: 'save' });
    const [touch] = readTouches();
    expect(touch.runtimeLocator).toEqual({ strategy: 'html-dom-id', value: 'save-button' });
    expect(touch.identifier).toBe('save');
  });

  it('is a no-op when APX_COVERAGE_LOG is unset', () => {
    delete process.env.APX_COVERAGE_LOG;
    recordButtonCoverageTouch({ strategy: 'accessible-name', value: 'Save' }, { pageId: 1, identifier: 'SAVE' });
    // No file was ever created at logPath.
    expect(() => readFileSync(logPath, 'utf8')).toThrow();
  });
});
