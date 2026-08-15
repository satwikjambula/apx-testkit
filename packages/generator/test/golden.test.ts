import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generate } from '../src/lib.js';

/**
 * Golden generator fixtures (runtime-review P0 item 5) -- the existing
 * determinism check (regenerate `reference-fixtures`, diff twice) only
 * proves the generator is internally SELF-CONSISTENT, not that its
 * output is CORRECT. A template regression that's reproducibly wrong on
 * every run would pass that check every time. This suite adds a
 * CORRECTNESS gate: generate each fixture below, diff byte-for-byte
 * against a committed `expected/` directory, and fail loudly on any
 * drift -- template changes must update `expected/` deliberately, the
 * same discipline `examples/employee-page` already enforces for the
 * single `reference-fixtures` case, extended to cover every component
 * type/generation-decision this project currently supports.
 *
 * Coverage, one named fixture per case the task called out:
 * - `public-page-with-region-items` -- a public form page with
 *   region-owned items + two buttons (a second, independent example
 *   alongside the canonical `examples/employee-page`/`reference-fixtures`
 *   pair, which already covers this exact category and remains the
 *   primary release-gate check -- see `.ai/checklists/release.md`).
 * - `authenticated-page-plain` -- a non-public page with NO checksum
 *   protection (the plain credential-gated case). SYNTHETIC: a full
 *   sweep of every accessible real corpus app this pass (apextogo,
 *   sample-cards, concurrent-manager, sample-application-search -- 126
 *   real non-global pages) found ZERO pages matching this exact shape --
 *   every real non-public page in that set also sets
 *   `pageAccessProtection: argumentsMustHaveChecksum`. A real example may
 *   not exist to find; flagged here rather than silently substituted.
 * - `modal-dialog-page` -- mirrors UX Pattern Catalog's real p00420
 *   (`pageMode: modalDialog`, `authentication: public`,
 *   `pageAccessProtection: argumentsMustHaveChecksum`) structurally --
 *   the raw `.apx` content itself is NOT committed (Oracle sample-gallery
 *   redistribution terms are unresolved -- see `docs/license-check.md`
 *   and `examples/verified-apps/README.md`, which already establishes
 *   this project's practice of never committing raw Oracle exports, only
 *   derived output). This fixture is written BY HAND, matching the real
 *   structural pattern this project has already documented in
 *   `docs/quirks/26.1.json`, not copied from any export file.
 * - `duplicate-button-labels` -- mirrors UX Pattern Catalog's real
 *   p00120 (multiple buttons sharing "View Details"), same
 *   hand-written-not-copied approach.
 * - `interactive-report-htmldomid` -- mirrors Sample Charts' real
 *   `projects`/`projects_report` pair (docs/quirks/26.1.json
 *   `region-id-not-static-id`).
 * - `cards-region` -- a `type: cards` region (Sample Cards app pattern).
 * - `faceted-search-region` -- a `type: facetedSearch` region
 *   co-occurring with a `cards` region on the same page (mirrors UX
 *   Pattern Catalog's real p00210 structure).
 * - `chart-region` -- mirrors Sample Charts' real `htmlDomId`-wired
 *   (`pie1`-shaped) and unwired chart regions together.
 * - `interactive-grid-region` -- mirrors Sample Interactive Grids' real
 *   `basic-editing` -> `emp` htmlDomId pair, PLUS an unwired IG region,
 *   PLUS navigation-unsafe (checksum, non-public) -- the actual, common,
 *   real-world combination (confirmed: every real IG-bearing page this
 *   pass found also sets checksum protection).
 * - `dynamic-actions-page` -- mirrors the exact structure already
 *   confirmed parseable in `packages/parser/test/parser.test.ts`
 *   (itself reproduced from Oracle's real "Sample Dynamic Actions" app).
 *   Proves dynamic actions don't affect generated output at all (no
 *   runtime trigger capability exists yet -- typed metadata only).
 * - `branches-page` -- mirrors the exact structure already confirmed
 *   parseable in `packages/parser/test/parser.test.ts` (itself
 *   reproduced from Oracle's real `customers` starter app, `oracle/apex`
 *   26.1 branch, UPL-1.0). Proves branches don't affect generated output.
 *
 * CI shape (this file): generate(input) -> diff against expected/ (fails
 * loudly on template drift) -> generate AGAIN -> diff against the first
 * generation (the existing self-consistency check, kept, not replaced).
 */
const FIXTURES_DIR = join(__dirname, 'golden', 'fixtures');
const EXPECTED_DIR = join(__dirname, 'golden', 'expected');

const fixtureNames = readdirSync(FIXTURES_DIR).sort();

describe('golden generator fixtures (P0 item 5)', () => {
  it('every fixture directory under golden/fixtures has a matching golden/expected directory', () => {
    const expectedNames = readdirSync(EXPECTED_DIR).sort();
    expect(fixtureNames).toEqual(expectedNames);
  });

  for (const name of fixtureNames) {
    describe(name, () => {
      let outDir1: string;
      let outDir2: string;

      beforeAll(() => {
        outDir1 = mkdtempSync(join(tmpdir(), `apx-golden-${name}-1-`));
        outDir2 = mkdtempSync(join(tmpdir(), `apx-golden-${name}-2-`));
        const r1 = generate(join(FIXTURES_DIR, name), outDir1);
        const r2 = generate(join(FIXTURES_DIR, name), outDir2);
        expect(r1.warnings, `${name}: must parse with zero warnings`).toEqual([]);
        expect(r2.warnings).toEqual([]);
      });

      afterAll(() => {
        rmSync(outDir1, { recursive: true, force: true });
        rmSync(outDir2, { recursive: true, force: true });
      });

      it('generates byte-identical output on two independent runs (self-consistency)', () => {
        const expectedFiles = readdirSync(join(EXPECTED_DIR, name)).sort();
        for (const file of expectedFiles) {
          const a = readFileSync(join(outDir1, file), 'utf8');
          const b = readFileSync(join(outDir2, file), 'utf8');
          expect(b, `${name}/${file}: two independent generate() runs produced different output`).toBe(a);
        }
      });

      it('matches the committed golden/expected/ output byte-for-byte (correctness gate)', () => {
        const expectedFiles = readdirSync(join(EXPECTED_DIR, name)).sort();
        expect(expectedFiles.length).toBeGreaterThan(0);
        for (const file of expectedFiles) {
          const actual = readFileSync(join(outDir1, file), 'utf8');
          const expected = readFileSync(join(EXPECTED_DIR, name, file), 'utf8');
          expect(
            actual,
            `${name}/${file}: generated output drifted from golden/expected/ -- if this is an ` +
              'INTENTIONAL template change, update the file under golden/expected/ deliberately ' +
              'and explain why in the commit message, the same discipline examples/employee-page ' +
              'already requires (see .ai/checklists/release.md).',
          ).toBe(expected);
        }
      });
    });
  }
});

describe('regeneration cleanup', () => {
  it('removes obsolete generated tests while preserving similarly named hand-written files', () => {
    const out = mkdtempSync(join(tmpdir(), 'apx-regeneration-cleanup-'));
    try {
      generate(join(FIXTURES_DIR, 'public-page-with-region-items'), out);
      const stale = 'p00010-registration.spec.ts';
      expect(existsSync(join(out, stale))).toBe(true);
      const handWritten = 'p99999-hand-written.spec.ts';
      writeFileSync(join(out, handWritten), '// maintained by a human\n');

      generate(join(FIXTURES_DIR, 'cards-region'), out);
      expect(existsSync(join(out, stale))).toBe(false);
      expect(readFileSync(join(out, handWritten), 'utf8')).toBe('// maintained by a human\n');
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });
});
