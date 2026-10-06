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
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const REGISTRY_DIR = path.join(REPO_ROOT, 'docs/verification');
const SUPPORT_MATRIX_PATH = path.join(REPO_ROOT, 'docs/support-matrix.md');

// 26.1 keeps its original marker text so its table stays byte-identical;
// every other release gets `support-matrix-table-<release>` markers.
function markersFor(release) {
  const name = release === '26.1' ? 'support-matrix-table' : `support-matrix-table-${release}`;
  return {
    begin: `<!-- GENERATED:BEGIN verification-registry ${name} -->`,
    end: `<!-- GENERATED:END verification-registry ${name} -->`,
  };
}

function renderTable(entries, markers) {
  const rows = entries
    .filter((e) => e.supportMatrixRow)
    .sort((a, b) => a.supportMatrixRow.order - b.supportMatrixRow.order);

  const header = ['| Component | Verified against | How |', '|---|---|---|'];
  const body = rows.map((e) => {
    const { component, verifiedAgainst, how } = e.supportMatrixRow;
    const howText = how.endsWith('.') ? how : `${how}.`;
    return `| ${component} | ${verifiedAgainst} | ${howText} |`;
  });
  return [markers.begin, ...header, ...body, markers.end].join('\n');
}

function main() {
  const isCheck = process.argv.includes('--check');

  if (!existsSync(SUPPORT_MATRIX_PATH)) {
    console.error(`docs/support-matrix.md not found at ${SUPPORT_MATRIX_PATH}`);
    process.exit(1);
  }
  const releases = readdirSync(REGISTRY_DIR)
    .filter((f) => /^\d+\.\d+\.json$/.test(f))
    .map((f) => f.replace(/\.json$/, ''))
    .sort();
  if (releases.length === 0) {
    console.error(`No <release>.json registry files found in ${REGISTRY_DIR}`);
    process.exit(1);
  }

  const current = readFileSync(SUPPORT_MATRIX_PATH, 'utf8');
  let next = current;
  for (const release of releases) {
    const registry = JSON.parse(readFileSync(path.join(REGISTRY_DIR, `${release}.json`), 'utf8'));
    const markers = markersFor(release);
    const beginIdx = next.indexOf(markers.begin);
    const endIdx = next.indexOf(markers.end);
    if (beginIdx === -1 || endIdx === -1 || endIdx < beginIdx) {
      console.error(
        `docs/support-matrix.md is missing the GENERATED:BEGIN/END markers (${markers.begin}) for release ${release} -- cannot regenerate.`,
      );
      process.exit(1);
    }
    next = `${next.slice(0, beginIdx)}${renderTable(registry.entries, markers)}${next.slice(endIdx + markers.end.length)}`;
  }

  if (isCheck) {
    if (next !== current) {
      console.error(
        'docs/support-matrix.md has drifted from what docs/verification/<release>.json would generate.\n' +
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
  console.log(`docs/support-matrix.md regenerated from docs/verification/{${releases.join(', ')}}.json.`);
}

main();
