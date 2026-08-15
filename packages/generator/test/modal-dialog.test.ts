import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generate, isModalDialogUnroutable } from '../src/lib.js';

/**
 * Regression coverage for the P0 item 3 fix (runtime-review):
 * `pageMode: modalDialog` pages are confirmed live to return HTTP 400 on
 * a plain GET (docs/quirks/26.1.json `drawer-modal-pages-400`), but the
 * generator kept emitting a normal, guaranteed-to-fail test for them.
 * The generator must now classify such pages at generation time and
 * emit an unconditional, clearly-reasoned test.skip() instead.
 *
 * The fixture (modal-dialog-fixture) covers four cases: a PUBLIC modal
 * page (mirrors UX Pattern Catalog's real p00420 exactly -- modalDialog
 * + public + no checksum protection, proving the modal-page failure mode
 * is orthogonal to authentication), a modal page that is ALSO
 * navigation-unsafe (item 2's condition) -- confirmed to occur together
 * on 22 real pages across this project's local corpus -- a modal page
 * with neither checksum nor public auth, and an ordinary non-modal page
 * (the control, unaffected).
 */
describe('generator modal-dialog classification (P0 item 3)', () => {
  const fixtureDir = join(__dirname, 'fixtures', 'modal-dialog-fixture');
  let outDir: string;
  let modalPublicSpec: string;
  let modalAuthChecksumSpec: string;
  let modalAuthNoChecksumSpec: string;
  let normalSpec: string;

  beforeAll(() => {
    outDir = mkdtempSync(join(tmpdir(), 'apx-modal-dialog-'));
    const result = generate(fixtureDir, outDir);
    expect(result.warnings).toEqual([]);
    modalPublicSpec = readFileSync(join(outDir, 'p00001-modal-public.spec.ts'), 'utf8');
    modalAuthChecksumSpec = readFileSync(join(outDir, 'p00002-modal-auth-checksum.spec.ts'), 'utf8');
    modalAuthNoChecksumSpec = readFileSync(join(outDir, 'p00003-modal-auth-no-checksum.spec.ts'), 'utf8');
    normalSpec = readFileSync(join(outDir, 'p00004-normal.spec.ts'), 'utf8');
  });

  afterAll(() => {
    rmSync(outDir, { recursive: true, force: true });
  });

  it('a PUBLIC modal page is still skipped -- the modalDialog failure mode is orthogonal to authentication (mirrors real p00420)', () => {
    expect(modalPublicSpec).toContain('NOT AUTO-ROUTABLE (modalDialog)');
    expect(modalPublicSpec).toContain('drawer-modal-pages-400');
    expect(modalPublicSpec).toContain("test.describe('page 1: Modal Public [not auto-routable -- skipped]'");
    expect(modalPublicSpec).toContain('test.skip(\n      true,');
    // No login machinery at all -- this page is public, so it must not
    // pull in login()/APP_BASE just because it happens to be unroutable.
    expect(modalPublicSpec).not.toMatch(/\blogin\(/);
  });

  it('a modal page that is ALSO navigation-unsafe: ONE describe block, ONE skip, BOTH reasons present (confirmed real overlap, 22 pages in the local corpus)', () => {
    expect(modalAuthChecksumSpec).toContain('NOT AUTO-ROUTABLE (modalDialog)');
    expect(modalAuthChecksumSpec).toContain('NOT AUTO-ROUTABLE (navigation unsafe)');
    // Exactly one test.describe / one test.skip -- not two separate blocks.
    expect(modalAuthChecksumSpec.match(/test\.describe\(/g)).toHaveLength(1);
    expect(modalAuthChecksumSpec.match(/test\.skip\(/g)).toHaveLength(1);
    // The single skip message combines both reasons.
    expect(modalAuthChecksumSpec).toMatch(/modalDialog requires parent-page navigation.*navigation unsafe/s);
  });

  it('a modal page with neither checksum nor public auth: still skipped for the modalDialog reason alone', () => {
    expect(modalAuthNoChecksumSpec).toContain('NOT AUTO-ROUTABLE (modalDialog)');
    expect(modalAuthNoChecksumSpec).not.toContain('NOT AUTO-ROUTABLE (navigation unsafe)');
    expect(modalAuthNoChecksumSpec).toContain("[not auto-routable -- skipped]'");
  });

  it('an ordinary non-modal page: completely unaffected -- normal test, no skip at all', () => {
    expect(normalSpec).not.toContain('NOT AUTO-ROUTABLE');
    expect(normalSpec).not.toContain('test.skip(');
    expect(normalSpec).toContain("test.describe('page 4: Normal'");
  });
});

describe('isModalDialogUnroutable', () => {
  it('flags the directly-confirmed modalDialog value', () => {
    expect(isModalDialogUnroutable('modalDialog')).toBe(true);
  });

  it('does NOT flag nonModalDialog -- a real, distinct EBNF value with zero corpus ground truth either way', () => {
    expect(isModalDialogUnroutable('nonModalDialog')).toBe(false);
  });

  it('does not flag the normal/absent case', () => {
    expect(isModalDialogUnroutable('normal')).toBe(false);
    expect(isModalDialogUnroutable(null)).toBe(false);
  });
});
