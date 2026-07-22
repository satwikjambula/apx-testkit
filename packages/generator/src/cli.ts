#!/usr/bin/env node
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { generate } from './lib.js';

const args = process.argv.slice(2);
const dir = args[0];
const outIdx = args.indexOf('--out');
const out = outIdx >= 0 ? args[outIdx + 1] : './generated-tests';
if (!dir) {
  console.error('Usage: apx-testgen <export-dir> --out <tests-dir>');
  console.error('  <export-dir> must contain application.apx and a pages/ subdirectory.');
  console.error('  Generated code imports @apx/testkit and reads APP_BASE from the');
  console.error('  consuming project\'s own ../playwright.config.ts (see spike/ for the convention).');
  process.exit(2);
}
if (!existsSync(dir) || !statSync(dir).isDirectory()) {
  console.error(`Export directory not found: ${dir}`);
  process.exit(2);
}
if (!existsSync(join(dir, 'pages'))) {
  console.error(`No pages/ subdirectory in ${dir} — is this an unzipped APEXlang export root?`);
  process.exit(2);
}

const r = generate(dir, out);
if (r.warnings.length > 0) {
  console.error(`Parser warnings (${r.warnings.length}) — generation continues:`);
  for (const w of r.warnings.slice(0, 20)) console.error(`  ${w}`);
}
console.log(
  `Generated ${r.generated} page object(s) + spec(s) (${r.skippedAuth} marked skip: auth required) into ${r.outDir}`,
);
if (r.unmodeled.length > 0) console.log(`Component types seen but not yet asserted on: ${r.unmodeled.join(', ')}`);
