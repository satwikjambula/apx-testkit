#!/usr/bin/env node
import { existsSync, writeFileSync } from 'node:fs';
import { computeReport, renderReportHtml } from './report.js';

const args = process.argv.slice(2);
const oldExportDir = args[0];
const newExportDir = args[1];
const touchLogPath = args[2];
const outIdx = args.indexOf('--out');
const outPath = outIdx >= 0 ? args[outIdx + 1] : './apx-report.html';

if (!oldExportDir || !newExportDir || !touchLogPath) {
  console.error(
    'Usage: apx-report <old-export-dir> <new-export-dir> <touch-log-path> [--out <report.html>]',
  );
  console.error('  Bundles three already-real reports into one self-contained HTML dashboard:');
  console.error('    - coverage (same data as `apx-coverage --html`), computed against <new-export-dir>');
  console.error('      and <touch-log-path> -- see docs/tutorial.md 2.9 for how to record a touch log.');
  console.error('    - regression diff (same data as `apx-diff --format human`), between <old-export-dir>');
  console.error('      and <new-export-dir>.');
  console.error('    - a parser-warning summary for <new-export-dir> (@apx/parser\'s own ParseResult.warnings).');
  console.error('  --out defaults to ./apx-report.html.');
  process.exit(2);
}
if (outIdx >= 0 && !args[outIdx + 1]) {
  console.error('--out requires an output path, e.g. --out apx-report.html');
  process.exit(2);
}
if (!existsSync(oldExportDir)) {
  console.error(`Old export directory not found: ${oldExportDir}`);
  process.exit(2);
}
if (!existsSync(newExportDir)) {
  console.error(`New export directory not found: ${newExportDir}`);
  process.exit(2);
}
if (!existsSync(touchLogPath)) {
  console.error(
    `Warning: touch log ${touchLogPath} does not exist -- every item/region/button in the coverage ` +
      'section will show as untouched. Did you set APX_COVERAGE_LOG before running the suite? ' +
      '(See docs/tutorial.md 2.9.)',
  );
}

const report = computeReport(oldExportDir, newExportDir, touchLogPath);

if (report.parserWarnings.length > 0) {
  console.error(`Parser warnings (${report.parserWarnings.length}) -- dashboard still generated:`);
  for (const w of report.parserWarnings.slice(0, 20)) console.error(`  ${w.loc.file}:${w.loc.line} ${w.message}`);
}

writeFileSync(outPath, renderReportHtml(report));

const c = report.coverage.overall;
const pct = (touched: number, total: number): string => (total === 0 ? 'n/a' : `${Math.round((touched / total) * 100)}%`);
const s = report.diff.summary;

console.log(`CI dashboard written to ${outPath}`);
console.log(
  `  coverage -- items: ${c.items.touched}/${c.items.total} (${pct(c.items.touched, c.items.total)}), ` +
    `regions: ${c.regions.touched}/${c.regions.total} (${pct(c.regions.touched, c.regions.total)}), ` +
    `buttons: ${c.buttons.touched}/${c.buttons.total} (${pct(c.buttons.touched, c.buttons.total)})`,
);
console.log(
  `  diff     -- ${s.pagesAdded} added, ${s.pagesRemoved} removed, ${s.pagesChanged} changed, ${s.pagesUnchanged} unchanged`,
);
console.log(`  parser warnings -- ${report.parserWarnings.length}`);
