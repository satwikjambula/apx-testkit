import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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

  beforeAll(() => {
    outDir = mkdtempSync(join(tmpdir(), 'apx-navigation-safety-'));
    const result = generate(fixtureDir, outDir);
    expect(result.warnings).toEqual([]);
    unsafeSpec = readFileSync(join(outDir, 'p00001-unsafe.spec.ts'), 'utf8');
    publicChecksumSpec = readFileSync(join(outDir, 'p00002-public-checksum.spec.ts'), 'utf8');
    authNoChecksumSpec = readFileSync(join(outDir, 'p00003-auth-no-checksum.spec.ts'), 'utf8');
  });

  afterAll(() => {
    rmSync(outDir, { recursive: true, force: true });
  });

  it('non-public + argumentsMustHaveChecksum: emits an unconditional test.skip(), never a normal goto-based test', () => {
    expect(unsafeSpec).toContain('NAVIGATION UNSAFE');
    expect(unsafeSpec).toContain("test.describe('page 1: Unsafe [navigation unsafe -- skipped]'");
    expect(unsafeSpec).toContain('test.skip(\n      true,');
    // No login() call -- the page never reaches a point where login matters.
    expect(unsafeSpec).not.toMatch(/\blogin\(/);
    expect(unsafeSpec).not.toContain("import { APP_BASE }");
  });

  it('public + argumentsMustHaveChecksum: treated as safe (inferred, per UX Pattern Catalog evidence) -- a normal test, no skip', () => {
    expect(publicChecksumSpec).not.toContain('NAVIGATION UNSAFE');
    expect(publicChecksumSpec).not.toContain('test.skip(');
    expect(publicChecksumSpec).toContain("test.describe('page 2: Public Checksum'");
  });

  it('non-public, no checksum flag: unaffected -- keeps the existing credential-gated login skip, not the navigation-unsafe skip', () => {
    expect(authNoChecksumSpec).not.toContain('NAVIGATION UNSAFE');
    expect(authNoChecksumSpec).toContain("test.describe('page 3: Auth No Checksum [requires auth]'");
    expect(authNoChecksumSpec).toContain('APX_LOGIN_TEST_USERNAME');
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
