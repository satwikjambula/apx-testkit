#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tag = process.argv[2];
if (!tag || !/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(tag)) {
  console.error(`Expected a semver release tag such as v0.1.0; received '${tag ?? ''}'.`);
  process.exit(1);
}

const expected = tag.slice(1);
const packages = ['parser', 'testkit', 'generator', 'mcp'];
const mismatches = packages.flatMap((name) => {
  const pkg = JSON.parse(readFileSync(join(repoRoot, 'packages', name, 'package.json'), 'utf8'));
  return pkg.version === expected ? [] : [`${pkg.name}: package version ${pkg.version} does not match tag ${tag}`];
});
if (mismatches.length) {
  console.error(mismatches.join('\n'));
  process.exit(1);
}
console.log(`Release tag ${tag} matches all workspace package versions.`);
