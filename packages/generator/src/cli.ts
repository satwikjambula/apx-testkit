#!/usr/bin/env node
import { generate } from './lib.js';

const args = process.argv.slice(2);
const dir = args[0];
const outIdx = args.indexOf('--out');
const out = outIdx >= 0 ? args[outIdx + 1] : './generated-tests';
if (!dir) {
  console.error('Usage: apx-testgen <export-dir> --out <tests-dir>');
  process.exit(2);
}
const r = generate(dir, out);
if (r.warnings.length > 0) {
  console.error(`Parser warnings (${r.warnings.length}) — generation continues:`);
  for (const w of r.warnings.slice(0, 20)) console.error(`  ${w}`);
}
console.log(`Generated ${r.generated} specs (${r.skippedAuth} marked skip: auth required) into ${r.outDir}`);
if (r.unmodeled.length > 0) console.log(`Component types seen but not yet asserted on: ${r.unmodeled.join(', ')}`);
