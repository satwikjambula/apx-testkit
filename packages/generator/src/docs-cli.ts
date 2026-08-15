#!/usr/bin/env node
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { generateDocs } from './docs.js';

const args = process.argv.slice(2);
const dir = args[0];
const outIdx = args.indexOf('--out');
const out = outIdx >= 0 ? args[outIdx + 1] : './docs-out';

if (!dir) {
  console.error('Usage: apx-docs <export-dir> --out <docs-dir>');
  console.error('  <export-dir> must contain a pages/ subdirectory; application.apx is read when present.');
  console.error('  Writes one Markdown file per page plus an index.md summary into <docs-dir> --');
  console.error('  pure read of the already-typed AST, no live app or browser needed.');
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

const r = generateDocs(dir, out);
if (r.warnings.length > 0) {
  console.error(`Parser warnings (${r.warnings.length}) — documentation generation continues:`);
  for (const w of r.warnings.slice(0, 20)) console.error(`  ${w}`);
}
console.log(`Documented ${r.generated} page(s) into ${r.outDir} (${r.files.length} file(s) written, including ${r.indexFile})`);
