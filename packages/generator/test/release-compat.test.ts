import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { computeDiff } from '../src/diff.js';
import { generate } from '../src/lib.js';

/**
 * 26.2 exports omit `security.pageAccessProtection: argumentsMustHaveChecksum`
 * where 26.1 wrote it. Evidence and counts: docs/grammar-assumptions.md
 * "APEX 26.2 compatibility". Fixtures are small synthetic exports shaped like
 * the real oracle/apex 26.1/26.2 sample apps.
 */
let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'apx-release-compat-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function writeExport(name: string, mmdVersion: string, pages: Record<string, string>): string {
  const dir = join(root, name);
  mkdirSync(join(dir, '.apex'), { recursive: true });
  mkdirSync(join(dir, 'pages'), { recursive: true });
  writeFileSync(join(dir, '.apex', 'apexlang.json'), JSON.stringify({ mmdVersion }));
  writeFileSync(join(dir, 'application.apx'), 'application demo (\n    name: Demo\n    alias: DEMO\n)\n');
  for (const [file, text] of Object.entries(pages)) writeFileSync(join(dir, 'pages', file), text);
  return dir;
}

const page = (id: number, alias: string, securityBody: string): string =>
  `page ${id} (\n    name: ${alias}\n    alias: ${alias}\n    title: ${alias}\n    security {\n${securityBody}\n    }\n)\n`;

const AUTH_REQUIRED = '        authentication: required';
const AUTH_PUBLIC = '        authentication: public';
const EXPLICIT = `${AUTH_REQUIRED}\n        pageAccessProtection: argumentsMustHaveChecksum`;

function specsOf(outDir: string): string {
  return readdirSync(outDir)
    .filter((f) => f.endsWith('.spec.ts'))
    .map((f) => readFileSync(join(outDir, f), 'utf8'))
    .join('\n');
}

describe('generation from a 26.2 export that omits pageAccessProtection', () => {
  it('treats an authenticated page like the explicit 26.1 value: not auto-routable, reason says the value is a release default', () => {
    const dir = writeExport('r262', '26.2.0+3479', { 'p00001-home.apx': page(1, 'HOME', AUTH_REQUIRED) });
    const result = generate(dir, join(root, 'out262'));
    expect(result.pages[0]).toMatchObject({ pageId: 1, notAutoRoutable: true });
    const reason = result.pages[0]!.notAutoRoutableReasons.join(' ');
    expect(reason).toMatch(/argumentsMustHaveChecksum on a non-public page/);
    expect(reason).toMatch(/APEX 26\.2 omitted-value default/);
    expect(specsOf(join(root, 'out262'))).toMatch(/test\.skip/);
  });

  it('produces the same routing verdict as the explicit 26.1 export of the same page', () => {
    const explicit = generate(writeExport('r261x', '26.1.0+3102', { 'p00001-home.apx': page(1, 'HOME', EXPLICIT) }), join(root, 'o1'));
    const omitted = generate(writeExport('r262o', '26.2.0+3479', { 'p00001-home.apx': page(1, 'HOME', AUTH_REQUIRED) }), join(root, 'o2'));
    expect(omitted.pages[0]!.notAutoRoutable).toBe(explicit.pages[0]!.notAutoRoutable);
  });

  it('keeps a public page routable, matching how 26.1 treats public + argumentsMustHaveChecksum', () => {
    const dir = writeExport('r262p', '26.2.0+3479', { 'p00002-open.apx': page(2, 'OPEN', AUTH_PUBLIC) });
    expect(generate(dir, join(root, 'outp')).pages[0]).toMatchObject({ pageId: 2, notAutoRoutable: false });
  });
});

describe('26.1 behaviour is unchanged', () => {
  it('still refuses to assume anything for an omitted value (unrecognized => not auto-routable, no 26.2 wording)', () => {
    const dir = writeExport('r261', '26.1.0+3102', { 'p00001-home.apx': page(1, 'HOME', AUTH_REQUIRED) });
    const result = generate(dir, join(root, 'out261'));
    const reason = result.pages[0]!.notAutoRoutableReasons.join(' ');
    expect(result.pages[0]!.notAutoRoutable).toBe(true);
    expect(reason).toMatch(/unrecognized security\.pageAccessProtection: null/);
    expect(reason).not.toMatch(/26\.2/);
  });
});

describe('apx-diff across an APEX 26.1 -> 26.2 upgrade', () => {
  it('reports the manifest change but no phantom pageAccessProtection change on unchanged pages', () => {
    const before = writeExport('up1', '26.1.0+3102', {
      'p00001-home.apx': page(1, 'HOME', EXPLICIT),
      'p00002-list.apx': page(2, 'LIST', EXPLICIT),
    });
    const after = writeExport('up2', '26.2.0+3479', {
      'p00001-home.apx': page(1, 'HOME', AUTH_REQUIRED),
      'p00002-list.apx': page(2, 'LIST', AUTH_REQUIRED),
    });
    const report = computeDiff(before, after);
    expect(report.manifestChanges).toEqual(['mmdVersion: "26.1.0+3102" -> "26.2.0+3479"']);
    expect(report.summary).toMatchObject({ pagesAdded: 0, pagesRemoved: 0, pagesChanged: 0, pagesUnchanged: 2 });
  });
});
