#!/usr/bin/env node
/**
 * Renders docs/support-matrix.md's "Component | Verified against | How"
 * table FROM docs/verification/26.1.json -- the registry entries carrying
 * a `supportMatrixRow` block are the single source of truth for that
 * table's content; this script assembles it mechanically, never hand-authors
 * prose. Everything outside the `<!-- GENERATED:BEGIN ... -->` /
 * `<!-- GENERATED:END ... -->` markers in docs/support-matrix.md is
 * hand-written and left untouched.
 *
 * Usage:
 *   node scripts/generate-support-matrix.mjs          -- regenerate and write the file
 *   node scripts/generate-support-matrix.mjs --check   -- regenerate in memory and diff
 *                                                          against the committed file;
 *                                                          exits non-zero on drift
 *                                                          (part of the regression sweep)
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const REGISTRY_PATH = path.join(REPO_ROOT, 'docs/verification/26.1.json');
const SUPPORT_MATRIX_PATH = path.join(REPO_ROOT, 'docs/support-matrix.md');

const BEGIN_MARKER = '<!-- GENERATED:BEGIN verification-registry support-matrix-table -->';
const END_MARKER = '<!-- GENERATED:END verification-registry support-matrix-table -->';

function renderTable(entries) {
  const rows = entries
    .filter((e) => e.supportMatrixRow)
    .sort((a, b) => a.supportMatrixRow.order - b.supportMatrixRow.order);

  const header = ['| Component | Verified against | How |', '|---|---|---|'];
  const body = rows.map((e) => {
    const { component, verifiedAgainst, how } = e.supportMatrixRow;
    const howText = how.endsWith('.') ? how : `${how}.`;
    return `| ${component} | ${verifiedAgainst} | ${howText} |`;
  });
  return [BEGIN_MARKER, ...header, ...body, END_MARKER].join('\n');
}

function main() {
  const isCheck = process.argv.includes('--check');

  if (!existsSync(REGISTRY_PATH)) {
    console.error(`Registry not found at ${REGISTRY_PATH}`);
    process.exit(1);
  }
  if (!existsSync(SUPPORT_MATRIX_PATH)) {
    console.error(`docs/support-matrix.md not found at ${SUPPORT_MATRIX_PATH}`);
    process.exit(1);
  }

  const registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));
  const current = readFileSync(SUPPORT_MATRIX_PATH, 'utf8');

  const beginIdx = current.indexOf(BEGIN_MARKER);
  const endIdx = current.indexOf(END_MARKER);
  if (beginIdx === -1 || endIdx === -1 || endIdx < beginIdx) {
    console.error(
      `docs/support-matrix.md is missing the GENERATED:BEGIN/END markers for the support-matrix-table region -- cannot regenerate.`,
    );
    process.exit(1);
  }

  const generatedBlock = renderTable(registry.entries);
  const before = current.slice(0, beginIdx);
  const after = current.slice(endIdx + END_MARKER.length);
  const next = `${before}${generatedBlock}${after}`;

  if (isCheck) {
    if (next !== current) {
      console.error(
        'docs/support-matrix.md has drifted from what docs/verification/26.1.json would generate.\n' +
          'Run `node scripts/generate-support-matrix.mjs` (no --check) to regenerate it, then commit the result.',
      );
      process.exit(1);
    }
    console.log('docs/support-matrix.md matches the verification registry -- no drift.');
    return;
  }

  if (next === current) {
    console.log('docs/support-matrix.md already matches the verification registry -- nothing to do.');
    return;
  }
  writeFileSync(SUPPORT_MATRIX_PATH, next, 'utf8');
  console.log('docs/support-matrix.md regenerated from docs/verification/26.1.json.');
}

main();
