#!/usr/bin/env node
import { existsSync, writeFileSync } from 'node:fs';
import { computeDiff, formatDiffHuman, formatDiffStructured } from './diff.js';

const args = process.argv.slice(2);
const oldExportDir = args[0];
const newExportDir = args[1];
const jsonIdx = args.indexOf('--json');
const jsonOut = jsonIdx >= 0 ? args[jsonIdx + 1] : undefined;
const formatIdx = args.indexOf('--format');
const format = formatIdx >= 0 ? args[formatIdx + 1] : 'structured';

if (!oldExportDir || !newExportDir) {
  console.error('Usage: apx-diff <old-export-dir> <new-export-dir> [--json <report.json>] [--format structured|human]');
  console.error('  Pure AST-to-AST comparison -- no live app or browser needed.');
  console.error('  --format structured (default): the indented +/-/~ tree.');
  console.error('  --format human: prose sentences, one per changed/added/removed page.');
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
if (format !== 'structured' && format !== 'human') {
  console.error(`Unknown --format value: ${format} (expected "structured" or "human")`);
  process.exit(2);
}

const report = computeDiff(oldExportDir, newExportDir);

if (format === 'human') {
  console.log(formatDiffHuman(report));
} else {
  console.log(formatDiffStructured(report));
}

if (jsonOut) {
  writeFileSync(jsonOut, JSON.stringify(report, null, 2));
  console.log(`\nFull JSON report written to ${jsonOut}`);
}
