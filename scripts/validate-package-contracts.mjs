#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workspaces = ['parser', 'testkit', 'generator', 'mcp'];
const errors = [];

for (const workspace of workspaces) {
  const dir = join(repoRoot, 'packages', workspace);
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  const packed = JSON.parse(
    execFileSync('npm', ['pack', '--dry-run', '--json', '--cache', join(tmpdir(), 'apx-testkit-package-cache')], {
      cwd: dir,
      encoding: 'utf8',
    }),
  )[0];
  const packedFiles = new Set(packed.files.map((file) => file.path));
  const targets = new Set([pkg.main, pkg.types]);
  for (const target of Object.values(pkg.exports ?? {})) {
    if (typeof target === 'string') targets.add(target);
  }

  for (const target of targets) {
    if (!target) continue;
    const normalized = target.replace(/^\.\//, '');
    if (!packedFiles.has(normalized)) errors.push(`${pkg.name}: declared entry '${target}' is absent from the packed artifact`);
  }

  const rootTarget = typeof pkg.exports?.['.'] === 'string' ? pkg.exports['.'] : pkg.main;
  if (rootTarget?.endsWith('.js')) {
    try {
      await import(pathToFileURL(join(dir, rootTarget)).href);
    } catch (error) {
      errors.push(`${pkg.name}: root import failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

if (errors.length) {
  console.error(`Package contract validation failed:\n${errors.map((error) => `  - ${error}`).join('\n')}`);
  process.exit(1);
}

console.log('All package entry points exist in packed artifacts and root imports are side-effect free.');
