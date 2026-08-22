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

  it('rejects an export format outside the verified 26.1 line by default', () => {
    const root = mkdtempSync(join(tmpdir(), 'apx-loader-version-'));
    try {
      mkdirSync(join(root, '.apex'));
      writeFileSync(join(root, '.apex', 'apexlang.json'), JSON.stringify({ mmdVersion: '27.1.0' }));
      expect(() => loadApexlangExport(root)).toThrow(/verified only for APEX 26\.1/);
      const warned = loadApexlangExport(root, { unsupportedVersion: 'warn' });
      expect(warned.warnings).toHaveLength(1);
      expect(parseApp(warned).warnings).toEqual([
        expect.objectContaining({ message: expect.stringMatching(/verified only for APEX 26\.1/), loc: { file: '.apex/apexlang.json', line: 1 } }),
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects a missing manifest by default and permits an explicit partial-input opt-out', () => {
    const root = mkdtempSync(join(tmpdir(), 'apx-loader-no-manifest-'));
    try {
      writeFileSync(join(root, 'page.apx'), '// synthetic partial source');
      expect(() => loadApexlangExport(root)).toThrow(/cannot verify that this is an APEX 26\.1 export/);
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
