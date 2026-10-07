import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadApexlangExport, parseApp } from '../src/index.js';

describe('loadApexlangExport', () => {
  it('loads all .apx sources recursively plus manifest and deployment metadata deterministically', () => {
    const root = mkdtempSync(join(tmpdir(), 'apx-loader-'));
    try {
      mkdirSync(join(root, '.apex'));
      mkdirSync(join(root, 'pages'));
      mkdirSync(join(root, 'shared-components'));
      mkdirSync(join(root, 'deployments'));
      writeFileSync(join(root, '.apex', 'apexlang.json'), JSON.stringify({ mmdVersion: '26.1.0+3102' }));
      writeFileSync(join(root, 'pages', 'p00042-example.apx'), 'page example (\n  page: 42\n  name: Example\n  alias: EXAMPLE\n)\n');
      writeFileSync(join(root, 'shared-components', 'lists.apx'), 'list navigation (\n  name: Navigation\n)\n');
      writeFileSync(join(root, 'deployments', 'default.json'), JSON.stringify({ workspace: 'TEST' }));

      const loaded = loadApexlangExport(root);
      expect(Object.keys(loaded.sources)).toEqual(['pages/p00042-example.apx', 'shared-components/lists.apx']);
      expect(loaded.manifest).toEqual({ mmdVersion: '26.1.0+3102' });
      expect(loaded.metadata['deployments/default.json']).toEqual({ workspace: 'TEST' });
      expect(parseApp(loaded).ast.manifest).toEqual({ mmdVersion: '26.1.0+3102' });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects an export format outside the supported releases by default', () => {
    const root = mkdtempSync(join(tmpdir(), 'apx-loader-version-'));
    try {
      mkdirSync(join(root, '.apex'));
      writeFileSync(join(root, '.apex', 'apexlang.json'), JSON.stringify({ mmdVersion: '27.1.0' }));
      expect(() => loadApexlangExport(root)).toThrow(/supports only APEX 26\.1 and 26\.2 exports/);
      const warned = loadApexlangExport(root, { unsupportedVersion: 'warn' });
      expect(warned.warnings).toHaveLength(1);
      expect(parseApp(warned).warnings).toEqual([
        expect.objectContaining({ message: expect.stringMatching(/supports only APEX 26\.1 and 26\.2/), loc: { file: '.apex/apexlang.json', line: 1 } }),
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.each([
    ['26.1.0+3102', true],
    ['26.2.0+3479', true],
    ['26.2', true],
    ['26.0.0', false],
    ['26.3.0', false],
    ['26.10.0', false],
    ['25.2.0', false],
    ['26', false],
    ['v26.2.0', false],
  ])('mmdVersion %s is %s as a supported release', (mmdVersion, supported) => {
    const root = mkdtempSync(join(tmpdir(), 'apx-loader-matrix-'));
    try {
      mkdirSync(join(root, '.apex'));
      writeFileSync(join(root, '.apex', 'apexlang.json'), JSON.stringify({ mmdVersion }));
      if (supported) expect(loadApexlangExport(root).manifest).toEqual({ mmdVersion });
      else expect(() => loadApexlangExport(root)).toThrow(/supports only APEX/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('names a nested export directory when the manifest is not at the given root (SQLcl 26.2 layout)', () => {
    const root = mkdtempSync(join(tmpdir(), 'apx-loader-nested-'));
    try {
      mkdirSync(join(root, 'demo1', '.apex'), { recursive: true });
      writeFileSync(join(root, 'f106.sql'), '-- sqlcl script');
      writeFileSync(join(root, 'demo1', '.apex', 'apexlang.json'), JSON.stringify({ mmdVersion: '26.2.0+3479' }));
      writeFileSync(join(root, 'demo1', 'application.apx'), 'application demo1 (\n)\n');
      expect(() => loadApexlangExport(root)).toThrow(/Found an APEXlang export in subdirectory 'demo1'; pass that directory instead/);
      expect(loadApexlangExport(join(root, 'demo1')).manifest).toEqual({ mmdVersion: '26.2.0+3479' });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('looks two levels down for the documented SQLcl Projects layout f<appId>/<alias>/ and lists every candidate', () => {
    const root = mkdtempSync(join(tmpdir(), 'apx-loader-nested2-'));
    try {
      for (const app of ['f100/brookstrut', 'f200/shop']) {
        mkdirSync(join(root, app, '.apex'), { recursive: true });
        writeFileSync(join(root, app, '.apex', 'apexlang.json'), JSON.stringify({ mmdVersion: '26.2.0+3479' }));
      }
      writeFileSync(join(root, 'f100', 'f100.sql'), '-- sqlcl script');
      expect(() => loadApexlangExport(root)).toThrow(/subdirectory 'f100\/brookstrut', 'f200\/shop'; pass that directory instead/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('does not invent a hint when the export is nested deeper than the documented layout', () => {
    const root = mkdtempSync(join(tmpdir(), 'apx-loader-nohint-'));
    try {
      mkdirSync(join(root, 'a', 'b', 'c', '.apex'), { recursive: true });
      writeFileSync(join(root, 'a', 'b', 'c', '.apex', 'apexlang.json'), JSON.stringify({ mmdVersion: '26.2.0+3479' }));
      expect(() => loadApexlangExport(root)).toThrow(/is missing; cannot verify/);
      expect(() => loadApexlangExport(root)).not.toThrow(/Found an APEXlang export/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects a missing manifest by default and permits an explicit partial-input opt-out', () => {
    const root = mkdtempSync(join(tmpdir(), 'apx-loader-no-manifest-'));
    try {
      writeFileSync(join(root, 'page.apx'), '// synthetic partial source');
      expect(() => loadApexlangExport(root)).toThrow(/cannot verify that this is an APEX 26\.1\/26\.2 export/);
      const partial = loadApexlangExport(root, { allowMissingManifest: true });
      expect(partial.manifest).toBeNull();
      expect(Object.keys(partial.sources)).toEqual(['page.apx']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('uses locale-independent code-unit ordering for source paths', () => {
    const root = mkdtempSync(join(tmpdir(), 'apx-loader-order-'));
    try {
      writeFileSync(join(root, 'z.apx'), '// z');
      writeFileSync(join(root, 'B.apx'), '// B');
      writeFileSync(join(root, 'a.apx'), '// a');
      expect(Object.keys(loadApexlangExport(root, { allowMissingManifest: true }).sources)).toEqual(['B.apx', 'a.apx', 'z.apx']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('does not open irrelevant static or binary assets', () => {
    const root = mkdtempSync(join(tmpdir(), 'apx-loader-irrelevant-'));
    const irrelevant = join(root, 'large-static-asset.bin');
    try {
      writeFileSync(join(root, 'page.apx'), '// source');
      writeFileSync(irrelevant, Buffer.from([0, 255, 0, 255]));
      if (process.platform !== 'win32') chmodSync(irrelevant, 0o000);
      expect(() => loadApexlangExport(root, { allowMissingManifest: true })).not.toThrow();
      expect(Object.keys(loadApexlangExport(root, { allowMissingManifest: true }).sources)).toEqual(['page.apx']);
    } finally {
      if (process.platform !== 'win32') chmodSync(irrelevant, 0o600);
      rmSync(root, { recursive: true, force: true });
    }
  });
});
