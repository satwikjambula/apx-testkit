#!/usr/bin/env node
import { existsSync, statSync, watch } from 'node:fs';
import { join } from 'node:path';
import { generate } from './lib.js';

const args = process.argv.slice(2);
const dir = args[0];
const outIdx = args.indexOf('--out');
const out = outIdx >= 0 ? args[outIdx + 1] : './generated-tests';
const watchMode = args.includes('--watch');

if (!dir) {
  console.error('Usage: apx-testgen <export-dir> --out <tests-dir> [--watch]');
  console.error('  <export-dir> must contain a pages/ subdirectory; application.apx is read when present.');
  console.error('  Generated code imports @apx/testkit and reads APP_BASE from the');
  console.error('  consuming project\'s own ../playwright.config.ts (see spike/ for the convention).');
  console.error('  --watch regenerates automatically whenever a .apx file under <export-dir> changes');
  console.error('  (e.g. after "Export to APEXlang" from VS Code/App Builder) -- Ctrl+C to stop.');
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

function runGenerate(): void {
  const r = generate(dir, out);
  if (r.warnings.length > 0) {
    console.error(`Parser warnings (${r.warnings.length}) — generation continues:`);
    for (const w of r.warnings.slice(0, 20)) console.error(`  ${w}`);
  }
  console.log(
    `Generated ${r.generated} page object(s) + spec(s) (${r.skippedAuth} marked skip: auth required) into ${r.outDir}`,
  );
  if (r.unmodeled.length > 0) console.log(`Component types seen but not yet asserted on: ${r.unmodeled.join(', ')}`);
}

runGenerate();

if (watchMode) {
  console.log(`\nWatching ${dir} for .apx changes (Ctrl+C to stop)...`);
  let pending: NodeJS.Timeout | undefined;
  watch(dir, { recursive: true }, (_eventType, filename) => {
    if (!filename || !filename.endsWith('.apx')) return;
    // Debounce: editors/exports often touch several files in one save/export burst.
    clearTimeout(pending);
    pending = setTimeout(() => {
      console.log(`\n[watch] ${filename} changed, regenerating...`);
      try {
        runGenerate();
      } catch (e) {
        console.error(`[watch] generate() failed, will retry on next change: ${e instanceof Error ? e.message : e}`);
      }
    }, 250);
  });
}
