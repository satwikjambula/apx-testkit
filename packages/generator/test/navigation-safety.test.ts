import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import ts from 'typescript';
import { generate, isNavigationUnsafe } from '../src/lib.js';
import { assessNavigationSafety } from '@apx/testkit';

/**
 * Regression coverage for the P0 item 2 fix (runtime-review): a page
 * with security.pageAccessProtection: argumentsMustHaveChecksum used to
 * always get a normal, bare-goto-based generated spec, even though a
 * bare page.goto() is CONFIRMED live to redirect an authenticated
 * session to /login (docs/quirks/26.1.json
 * `page-access-protection-blocks-bare-navigation`). The generator must
 * now classify such pages at generation time and emit an unconditional,
 * clearly-reasoned test.skip() instead of a guaranteed-to-fail test.
 *
 * The fixture (navigation-safety-fixture) covers all three cases the
 * predicate distinguishes: a non-public checksum-protected page (the
 * directly live-confirmed unsafe case), a public checksum-protected page
 * (the inferred-safe case, matching UX Pattern Catalog's own real
 * pages), and an ordinary non-public page with no checksum flag at all
 * (unaffected -- keeps the existing login-gated behavior).
 */
describe('generator navigation safety (P0 item 2)', () => {
  const fixtureDir = join(__dirname, 'fixtures', 'navigation-safety-fixture');
  let outDir: string;
  let unsafeSpec: string;
  let publicChecksumSpec: string;
  let authNoChecksumSpec: string;
  let noUrlAccessSpec: string;
  let noUrlAccessPageObject: string;

  beforeAll(() => {
    outDir = mkdtempSync(join(tmpdir(), 'apx-navigation-safety-'));
    const result = generate(fixtureDir, outDir);
    expect(result.warnings).toEqual([]);
    unsafeSpec = readFileSync(join(outDir, 'p00001-unsafe.spec.ts'), 'utf8');
    publicChecksumSpec = readFileSync(join(outDir, 'p00002-public-checksum.spec.ts'), 'utf8');
    authNoChecksumSpec = readFileSync(join(outDir, 'p00003-auth-no-checksum.spec.ts'), 'utf8');
    noUrlAccessSpec = readFileSync(join(outDir, 'p00004-no-url-access.spec.ts'), 'utf8');
    noUrlAccessPageObject = readFileSync(join(outDir, 'p00004-no-url-access.page.ts'), 'utf8');
  });

  afterAll(() => {
    rmSync(outDir, { recursive: true, force: true });
  });

  it('non-public + argumentsMustHaveChecksum: emits an unconditional test.skip(), never a normal goto-based test', () => {
    expect(unsafeSpec).toContain('NOT AUTO-ROUTABLE (navigation unsafe)');
    expect(unsafeSpec).toContain("test.describe('page 1: Unsafe [not auto-routable -- skipped]'");
    expect(unsafeSpec).toContain('test.skip(\n      true,');
    // No login() call -- the page never reaches a point where login matters.
    expect(unsafeSpec).not.toMatch(/\blogin\(/);
    expect(unsafeSpec).not.toContain("import { APP_BASE }");
  });

  it('public + argumentsMustHaveChecksum: treated as safe (inferred, per UX Pattern Catalog evidence) -- a normal test, no skip', () => {
    expect(publicChecksumSpec).not.toContain('NOT AUTO-ROUTABLE');
    expect(publicChecksumSpec).not.toContain('test.skip(');
    expect(publicChecksumSpec).toContain("test.describe('page 2: Public Checksum'");
  });

  it('non-public, no checksum flag: unaffected -- keeps the existing credential-gated login skip, not the navigation-unsafe skip', () => {
    expect(authNoChecksumSpec).not.toContain('NOT AUTO-ROUTABLE');
    expect(authNoChecksumSpec).toContain("test.describe('page 3: Auth No Checksum [requires auth]'");
    expect(authNoChecksumSpec).toContain('APX_LOGIN_TEST_USERNAME');
  });

  it('noUrlAccess is skipped by generated specs and guarded inside the generated PageObject', () => {
    expect(noUrlAccessSpec).toContain('NOT AUTO-ROUTABLE (navigation unsafe)');
    expect(noUrlAccessSpec).toContain('test.skip(');
    expect(noUrlAccessPageObject).toContain("pageAccessProtection: 'noUrlAccess'");
    expect(noUrlAccessPageObject).toContain('gotoApexPageAuto(');
    expect(noUrlAccessPageObject).not.toContain('return gotoApexPage(this.page');
  });
});

describe('isNavigationUnsafe (generator) stays in sync with @apx/testkit assessNavigationSafety', () => {
  // Same discipline as coverage-unsupported-sync.test.ts: the generator
  // deliberately does NOT import @apx/testkit at runtime (it's a
  // devDependency here, used only by this test), so its own local
  // predicate must be asserted to produce the IDENTICAL verdict as
  // testkit's real, shipped implementation across a representative
  // matrix -- catching drift immediately if either changes without the
  // other.
  const matrix: Array<{ pageAccessProtection: string | null; isPublic: boolean }> = [
    { pageAccessProtection: 'argumentsMustHaveChecksum', isPublic: false },
    { pageAccessProtection: 'argumentsMustHaveChecksum', isPublic: true },
    { pageAccessProtection: 'unrestricted', isPublic: false },
    { pageAccessProtection: 'noArgumentsSupported', isPublic: false },
    { pageAccessProtection: 'noUrlAccess', isPublic: false },
    { pageAccessProtection: 'noUrlAccess', isPublic: true },
    { pageAccessProtection: null, isPublic: false },
    { pageAccessProtection: null, isPublic: true },
    { pageAccessProtection: 'someOtherFutureValue', isPublic: false },
    { pageAccessProtection: 'someOtherFutureValue', isPublic: true },
  ];

  for (const { pageAccessProtection, isPublic } of matrix) {
    it(`pageAccessProtection=${JSON.stringify(pageAccessProtection)} isPublic=${isPublic}`, () => {
      const generatorVerdict = isNavigationUnsafe(pageAccessProtection, isPublic);
      const testkitVerdict = assessNavigationSafety({ pageAccessProtection, isPublic }).mode === 'ui-navigation';
      expect(generatorVerdict).toBe(testkitVerdict);
    });
  }
});

describe('application URL mode', () => {
  it('fails generation before writing output when friendly URLs are disabled', () => {
    const exportDir = mkdtempSync(join(tmpdir(), 'apx-friendly-false-export-'));
    const outDir = mkdtempSync(join(tmpdir(), 'apx-friendly-false-out-'));
    try {
      mkdirSync(join(exportDir, 'pages'));
      writeFileSync(
        join(exportDir, 'application.apx'),
        'app test (\n name: Test\n alias: TEST\n version: 1\n type: standard\n runtime {\n  friendlyUrls: false\n  compatibilityMode: "26.1"\n }\n)\n',
      );
      writeFileSync(join(exportDir, 'pages', 'p00001-home.apx'), 'page home (\n page: 1\n name: Home\n alias: HOME\n)\n');
      expect(() => generate(exportDir, outDir)).toThrow(/friendlyUrls: false.*no tests were generated/s);
    } finally {
      rmSync(exportDir, { recursive: true, force: true });
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it('emits syntactically valid TypeScript for decoded control characters and comment delimiters', () => {
    const exportDir = mkdtempSync(join(tmpdir(), 'apx-escaped-export-'));
    const outDir = mkdtempSync(join(tmpdir(), 'apx-escaped-out-'));
    try {
      writeFileSync(
        join(exportDir, 'application.apx'),
        'app test (\n runtime {\n  friendlyUrls: true\n  compatibilityMode: "26.1"\n }\n)\n',
      );
      mkdirSync(join(exportDir, 'pages'));
      writeFileSync(
        join(exportDir, 'pages', 'p00001-home.apx'),
        'page home (\n page: 1\n name: "Home\\n*/ injected"\n alias: HOME\n title: "Title\\nNow"\n security {\n  authentication: public\n }\n button save (\n  label: "Save\\n*/ now"\n )\n)\n',
      );
      generate(exportDir, outDir);
      for (const file of ['p00001-home.page.ts', 'p00001-home.spec.ts']) {
        const source = readFileSync(join(outDir, file), 'utf8');
        const result = ts.transpileModule(source, { reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ES2022 } });
        expect(result.diagnostics ?? []).toEqual([]);
        expect(source).not.toContain('Save\n*/ now');
      }
    } finally {
      rmSync(exportDir, { recursive: true, force: true });
      rmSync(outDir, { recursive: true, force: true });
    }
  });
});
