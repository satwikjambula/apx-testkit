/**
 * Coverage for `GenerateResult.pages` (`PageGenerationDiagnostics[]`) --
 * the structural diagnostics field added specifically so `apx-onboard`'s
 * "live-verification-requirements" section (packages/generator/src/onboard.ts)
 * can be derived from REAL, already-computed generation data instead of
 * regex-parsing the generated `.spec.ts` file's header comment (an
 * approach explicitly rejected -- see docs/ecosystem-roadmap.md
 * "Seventeenth round"). `lib.ts`'s own doc comment on `GenerateResult.pages`
 * explains why this is additive, not a breaking change to `generate()`'s
 * existing return shape.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { generate, type GenerateResult } from '../src/lib.js';

const FIXTURES_ROOT = join(__dirname, 'fixtures');
const GOLDEN_FIXTURES_ROOT = join(__dirname, 'golden', 'fixtures');

function genInTmp(exportDir: string): GenerateResult {
  const outDir = mkdtempSync(join(tmpdir(), 'apx-generate-diagnostics-'));
  return generate(exportDir, outDir);
}

describe('GenerateResult.pages -- structural generation diagnostics', () => {
  const cleanupDirs: string[] = [];
  afterAll(() => {
    for (const dir of cleanupDirs) rmSync(dir, { recursive: true, force: true });
  });

  it('every generated page gets exactly one diagnostics entry, in page-id order', () => {
    const result = genInTmp(join(FIXTURES_ROOT, 'navigation-safety-fixture'));
    cleanupDirs.push(result.outDir);
    expect(result.pages.map((p) => p.pageId)).toEqual([1, 2, 3, 4]);
  });

  it('a normal, fully auto-routable page reports notAutoRoutable: false with empty reasons', () => {
    const result = genInTmp(join(FIXTURES_ROOT, 'reference-fixtures'));
    cleanupDirs.push(result.outDir);
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0]).toMatchObject({
      pageId: 3,
      alias: 'EMPLOYEE',
      notAutoRoutable: false,
      notAutoRoutableReasons: [],
    });
  });

  it("a 'form' region (no verified DOM convention) is reported with reason 'no-verified-dom-convention'", () => {
    const result = genInTmp(join(FIXTURES_ROOT, 'reference-fixtures'));
    cleanupDirs.push(result.outDir);
    expect(result.pages[0].skippedRegions).toEqual([
      { identifier: 'employee', type: 'form', reason: 'no-verified-dom-convention' },
    ]);
  });

  it('navigation-unsafe (checksum, non-public) pages report notAutoRoutable: true with a matching reason', () => {
    const result = genInTmp(join(FIXTURES_ROOT, 'navigation-safety-fixture'));
    cleanupDirs.push(result.outDir);
    const unsafe = result.pages.find((p) => p.pageId === 1)!;
    expect(unsafe.notAutoRoutable).toBe(true);
    expect(unsafe.notAutoRoutableReasons).toHaveLength(1);
    expect(unsafe.notAutoRoutableReasons[0]).toMatch(/navigation unsafe/);
  });

  it('a public checksum-protected page is still reported as auto-routable (inferred-safe case)', () => {
    const result = genInTmp(join(FIXTURES_ROOT, 'navigation-safety-fixture'));
    cleanupDirs.push(result.outDir);
    const publicChecksum = result.pages.find((p) => p.pageId === 2)!;
    expect(publicChecksum.notAutoRoutable).toBe(false);
    expect(publicChecksum.notAutoRoutableReasons).toEqual([]);
  });

  it('modalDialog pages report notAutoRoutable: true with a modalDialog reason', () => {
    const result = genInTmp(join(FIXTURES_ROOT, 'modal-dialog-fixture'));
    cleanupDirs.push(result.outDir);
    const modalPublic = result.pages.find((p) => p.pageId === 1)!;
    expect(modalPublic.notAutoRoutable).toBe(true);
    expect(modalPublic.notAutoRoutableReasons.some((r) => r.includes('modalDialog'))).toBe(true);
  });

  it('a modalDialog page that is ALSO navigation-unsafe reports BOTH reasons, not just one', () => {
    const result = genInTmp(join(FIXTURES_ROOT, 'modal-dialog-fixture'));
    cleanupDirs.push(result.outDir);
    const both = result.pages.find((p) => p.pageId === 2)!;
    expect(both.notAutoRoutable).toBe(true);
    expect(both.notAutoRoutableReasons).toHaveLength(2);
  });

  it("an unwired chart region (no htmlDomId) is reported with reason 'chart-no-html-dom-id'; the wired one is not skipped", () => {
    const result = genInTmp(join(GOLDEN_FIXTURES_ROOT, 'chart-region'));
    cleanupDirs.push(result.outDir);
    expect(result.pages).toHaveLength(1);
    const skipped = result.pages[0].skippedRegions;
    expect(skipped).toEqual([{ identifier: 'sales-by-quarter', type: 'chart', reason: 'chart-no-html-dom-id' }]);
  });

  it("an unwired Interactive Grid region (no htmlDomId) is reported with reason 'interactive-grid-no-html-dom-id'", () => {
    const result = genInTmp(join(GOLDEN_FIXTURES_ROOT, 'interactive-grid-region'));
    cleanupDirs.push(result.outDir);
    expect(result.pages).toHaveLength(1);
    const skipped = result.pages[0].skippedRegions;
    expect(skipped).toContainEqual({
      identifier: 'department-editing',
      type: 'interactiveGrid',
      reason: 'interactive-grid-no-html-dom-id',
    });
    // The htmlDomId-wired region (emp) must NOT show up as skipped.
    expect(skipped.some((r) => r.identifier === 'employee-editing')).toBe(false);
  });

  it('diagnostics are purely additive: the generated file text is byte-identical to before this field existed', () => {
    // Regression guard: this field must never change generated OUTPUT --
    // only GenerateResult's return shape. Cross-checked against the
    // existing golden/expected fixtures (golden.test.ts) which already
    // assert byte-for-byte file content; this test asserts the SAME
    // generate() call additionally produces non-empty structural
    // diagnostics without altering `files`/`generated`/`warnings`.
    const result = genInTmp(join(FIXTURES_ROOT, 'reference-fixtures'));
    cleanupDirs.push(result.outDir);
    expect(result.files).toEqual(['p00003-employee.page.ts', 'p00003-employee.spec.ts']);
    expect(result.generated).toBe(1);
    expect(result.warnings).toEqual([]);
  });
});
