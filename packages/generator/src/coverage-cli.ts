#!/usr/bin/env node
import { existsSync, writeFileSync } from 'node:fs';
import { computeCoverage, type CategoryCoverage } from './coverage.js';

const args = process.argv.slice(2);
const exportDir = args[0];
const touchLogPath = args[1];
const jsonIdx = args.indexOf('--json');
const jsonOut = jsonIdx >= 0 ? args[jsonIdx + 1] : undefined;

if (!exportDir || !touchLogPath) {
  console.error('Usage: apx-coverage <export-dir> <touch-log-path> [--json <report.json>]');
  console.error('  <touch-log-path> is the file pointed to by APX_COVERAGE_LOG when the suite ran.');
  console.error('  Set APX_COVERAGE_LOG=<path> before running your Playwright suite to record touches;');
  console.error('  @apx/testkit only records when that env var is set (zero overhead otherwise).');
  process.exit(2);
}
if (!existsSync(exportDir)) {
  console.error(`Export directory not found: ${exportDir}`);
  process.exit(2);
}

function pct(c: CategoryCoverage): string {
  if (c.total === 0) return 'n/a';
  return `${Math.round((c.touched / c.total) * 100)}%`;
}

function line(label: string, c: CategoryCoverage): string {
  const base = `  ${label.padEnd(9)}${c.touched}/${c.total} (${pct(c)})`;
  return c.untouched.length > 0 ? `${base} -- untouched: ${c.untouched.join(', ')}` : base;
}

const report = computeCoverage(exportDir, touchLogPath);

if (!existsSync(touchLogPath)) {
  console.error(
    `Warning: touch log ${touchLogPath} does not exist -- every item/region/button below will show as untouched. ` +
      'Did you set APX_COVERAGE_LOG before running the suite?',
  );
}

console.log(`Coverage report`);
console.log(`  export:    ${report.exportDir}`);
console.log(`  touch log: ${report.touchLogPath} (${report.touchCount} touches recorded)`);
console.log('');

for (const p of report.pages) {
  console.log(`page ${p.id}: ${p.name ?? p.alias} (${p.alias})`);
  console.log(line('items:', p.items));
  console.log(line('regions:', p.regions));
  console.log(line('buttons:', p.buttons));
  console.log('');
}

console.log('Overall');
console.log(line('items:', report.overall.items));
console.log(line('regions:', report.overall.regions));
console.log(line('buttons:', report.overall.buttons));

if (jsonOut) {
  writeFileSync(jsonOut, JSON.stringify(report, null, 2));
  console.log(`\nFull JSON report written to ${jsonOut}`);
}
