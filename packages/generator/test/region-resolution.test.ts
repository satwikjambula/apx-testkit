import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generate } from '../src/lib.js';

/**
 * Regression coverage for the ADR-003 fix (P0 item 1, runtime-review):
 * the generator used to bake a single static `htmlDomId ?? identifier`
 * guess directly into generated spec text. It must now emit a call to
 * @apx/testkit's resolveRegion() instead, with the full evidence-backed
 * candidate list (htmlDomId first when set, then the export identifier
 * for interactiveReport/cards/facetedSearch; htmlDomId ONLY for
 * Chart/Interactive Grid, since the export identifier is confirmed NOT to
 * work as a fallback for those two -- see docs/quirks/26.1.json
 * `region-id-not-static-id`).
 *
 * The fixture (region-resolution-fixture) uses real, EBNF-valid `.apx`
 * syntax patterns already established as parseable by
 * packages/parser/test/parser.test.ts's own htmlDomId suite -- an
 * interactiveReport region with htmlDomId set (mirrors the real
 * sample-charts `projects` -> `projects_report` case), one without, a
 * wired and an unwired chart region, and a wired and unwired Interactive
 * Grid region (mirrors the real sample-interactive-grids `basic-editing`
 * -> `emp` case).
 */
describe('generator region resolution (ADR-003 runtime resolveRegion wiring)', () => {
  const fixtureDir = join(__dirname, 'fixtures', 'region-resolution-fixture');
  let specText: string;
  let outDir: string;

  beforeAll(() => {
    outDir = mkdtempSync(join(tmpdir(), 'apx-region-resolution-'));
    const result = generate(fixtureDir, outDir);
    expect(result.warnings).toEqual([]);
    specText = readFileSync(join(outDir, 'p00001-region-resolution.spec.ts'), 'utf8');
  });

  afterAll(() => {
    rmSync(outDir, { recursive: true, force: true });
  });

  it('never bakes a static htmlDomId ?? identifier id -- imports and calls resolveRegion instead', () => {
    expect(specText).toMatch(/import \{[^}]*\bresolveRegion\b[^}]*\} from '@apx\/testkit';/);
    expect(specText).not.toMatch(/expectRegionsResolve/);
  });

  it('interactiveReport with htmlDomId set: candidates try htmlDomId first, THEN the export identifier', () => {
    expect(specText).toContain(
      "[{ value: 'projects_report', strategy: 'htmlDomId' as const }, { value: 'projects', strategy: 'export-identifier' as const }]",
    );
  });

  it('interactiveReport with no htmlDomId: falls back to a single export-identifier candidate', () => {
    expect(specText).toContain("[{ value: 'plain-report', strategy: 'export-identifier' as const }]");
  });

  it('Chart with htmlDomId set: candidate list is htmlDomId ONLY -- export identifier is not a confirmed fallback for this type', () => {
    expect(specText).toContain("candidates: [{ value: 'pie1', strategy: 'htmlDomId' as const }], declaredType: 'pie'");
    // the .apx export identifier ('pie-chart') must never appear as a
    // candidate value -- it's fine for it to appear elsewhere (e.g. the
    // header's "Regions present in metadata" listing).
    expect(specText).not.toContain("value: 'pie-chart'");
  });

  it('Chart with no htmlDomId: correctly SKIPPED, not silently wired with a guessed id', () => {
    expect(specText).toContain('1 chart region(s) SKIPPED');
    expect(specText).toContain('unwired-chart');
    expect(specText).not.toContain("declaredType: 'area'");
  });

  it('Interactive Grid with htmlDomId set: candidate list is htmlDomId ONLY, resolved live before constructing the wrapper', () => {
    expect(specText).toContain("[{ value: 'emp', strategy: 'htmlDomId' as const }]");
    expect(specText).toContain('const { runtimeId } = await resolveRegion(page, candidates, 1);');
    expect(specText).toContain('new ApexInteractiveGridRegion(page, runtimeId, 1)');
  });

  it('Interactive Grid with no htmlDomId: correctly SKIPPED, not silently wired with the export identifier', () => {
    expect(specText).toContain('1 Interactive Grid region(s) SKIPPED');
    expect(specText).toContain('unwired-grid');
    expect(specText).not.toContain("value: 'basic-editing'");
    expect(specText).not.toContain("value: 'unwired-grid'");
  });

  it('Chart resolves its runtime id live before waiting for the ojChart widget-factory precondition', () => {
    const resolveIdx = specText.indexOf('const { runtimeId } = await resolveRegion(page, candidates, 1);');
    const waitIdx = specText.indexOf('await page.waitForFunction((regionId)');
    expect(resolveIdx).toBeGreaterThan(-1);
    expect(waitIdx).toBeGreaterThan(resolveIdx);
  });
});
