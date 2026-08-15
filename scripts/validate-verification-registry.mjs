#!/usr/bin/env node
/**
 * Validates docs/verification/26.1.json (the verification registry):
 *   1. Every entry has all required fields, with the right shape/enum.
 *   2. Every `id` is unique.
 *   3. Every `citation` path resolves to a real file in this repo -- and
 *      when it points at docs/quirks/26.1.json with a `#<id>` fragment,
 *      that id must actually exist in quirks.json's `quirks` array (an
 *      orphaned citation -- pointing at evidence that doesn't exist, or no
 *      longer exists -- is exactly the kind of drift this registry exists
 *      to prevent, not just replicate).
 *   4. Every `#L<n>-L<n>` line-range fragment against a source file is
 *      within that file's actual line count (a weak but real check that
 *      the citation hasn't rotted after a later edit).
 *
 * Run: node scripts/validate-verification-registry.mjs
 * Exit code is non-zero on any failure -- this is meant to be part of the
 * regression sweep (.ai/checklists/release.md), not just run by hand.
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const REGISTRY_PATH = path.join(REPO_ROOT, 'docs/verification/26.1.json');

const REQUIRED_FIELDS = [
  'id',
  'component',
  'capability',
  'status',
  'outcome',
  'apexVersion',
  'applications',
  'runs',
  'confidence',
  'publicApi',
  'runtimeStrategy',
  'evidenceSource',
  'ebnfProduction',
  'citation',
  'lastVerified',
  'correctedFrom',
  'notes',
  'supportMatrixRow',
];

const VALID_STATUS = new Set(['verified', 'documented', 'observed', 'unverified', 'unsupported']);
const VALID_OUTCOME = new Set(['works', 'broken', 'partial', 'not-applicable', 'n/a']);
const VALID_CONFIDENCE = new Set(['high', 'medium', 'low', 'n/a']);
const VALID_RUNTIME_STRATEGY = new Set([
  'widget-factory',
  'direct-method',
  'ui-locator',
  'dom-locator',
  'parser-only',
  'n/a',
]);
const VALID_EVIDENCE_SOURCE = new Set([
  'live-browser',
  'real-export',
  'ebnf',
  'live-browser+real-export',
  'real-export+ebnf',
  'live-browser+ebnf',
  'live-browser+real-export+ebnf',
  'none',
]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const LINE_RANGE_FRAGMENT_RE = /#L(\d+)(?:-L(\d+))?$/;

function fail(errors, msg) {
  errors.push(msg);
}

function loadQuirksIds() {
  const quirksPath = path.join(REPO_ROOT, 'docs/quirks/26.1.json');
  if (!existsSync(quirksPath)) return new Set();
  const data = JSON.parse(readFileSync(quirksPath, 'utf8'));
  return new Set((data.quirks ?? []).map((q) => q.id));
}

function lineCount(filePath) {
  const text = readFileSync(filePath, 'utf8');
  return text.split('\n').length;
}

function validateCitation(entry, errors) {
  const citation = entry.citation;
  if (typeof citation !== 'string' || citation.length === 0) {
    fail(errors, `${entry.id}: citation must be a non-empty string`);
    return;
  }
  const [rawPath, fragment] = citation.split('#');
  const fullPath = path.join(REPO_ROOT, rawPath);
  if (!existsSync(fullPath)) {
    fail(errors, `${entry.id}: citation path does not resolve -- '${rawPath}' does not exist`);
    return;
  }
  if (!fragment) return;

  // docs/quirks/26.1.json#<id> -- the id must actually exist in quirks.json.
  if (rawPath === 'docs/quirks/26.1.json') {
    const quirksIds = loadQuirksIds();
    if (!quirksIds.has(fragment)) {
      fail(errors, `${entry.id}: citation references docs/quirks/26.1.json#${fragment}, but no quirk with that id exists (orphaned citation)`);
    }
    return;
  }

  // #L<n>-L<n> line-range fragments against a source/doc file.
  const m = `#${fragment}`.match(LINE_RANGE_FRAGMENT_RE);
  if (m) {
    const start = Number(m[1]);
    const end = m[2] ? Number(m[2]) : start;
    const total = lineCount(fullPath);
    if (start < 1 || end < start) {
      fail(errors, `${entry.id}: citation line range #L${start}-L${end} is malformed`);
    } else if (start > total) {
      fail(errors, `${entry.id}: citation line range #L${start}-L${end} starts past end of file '${rawPath}' (${total} lines) -- citation has rotted`);
    }
    return;
  }

  // Otherwise (e.g. #Still-open, a markdown heading anchor): just require
  // the anchor text to appear literally somewhere in the file, as a weak
  // but real check that it hasn't been renamed/removed.
  const text = readFileSync(fullPath, 'utf8');
  const anchorText = fragment.replace(/-/g, ' ');
  const looksPresent =
    text.toLowerCase().includes(fragment.toLowerCase()) || text.toLowerCase().includes(anchorText.toLowerCase());
  if (!looksPresent) {
    fail(errors, `${entry.id}: citation anchor '#${fragment}' not found (even loosely) in '${rawPath}' -- citation may have rotted`);
  }
}

function validateEntry(entry, errors) {
  for (const field of REQUIRED_FIELDS) {
    if (!(field in entry)) {
      fail(errors, `${entry.id ?? '<no id>'}: missing required field '${field}'`);
    }
  }
  if (typeof entry.id !== 'string' || entry.id.length === 0) {
    fail(errors, `<entry>: 'id' must be a non-empty string`);
    return;
  }
  if (!VALID_STATUS.has(entry.status)) {
    fail(errors, `${entry.id}: invalid status '${entry.status}' -- must be one of ${[...VALID_STATUS].join(', ')}`);
  }
  if (!VALID_OUTCOME.has(entry.outcome)) {
    fail(errors, `${entry.id}: invalid outcome '${entry.outcome}' -- must be one of ${[...VALID_OUTCOME].join(', ')}`);
  }
  if (!VALID_CONFIDENCE.has(entry.confidence)) {
    fail(errors, `${entry.id}: invalid confidence '${entry.confidence}'`);
  }
  if (!VALID_RUNTIME_STRATEGY.has(entry.runtimeStrategy)) {
    fail(errors, `${entry.id}: invalid runtimeStrategy '${entry.runtimeStrategy}'`);
  }
  if (!VALID_EVIDENCE_SOURCE.has(entry.evidenceSource)) {
    fail(errors, `${entry.id}: invalid evidenceSource '${entry.evidenceSource}'`);
  }
  if (!Array.isArray(entry.applications)) {
    fail(errors, `${entry.id}: 'applications' must be an array`);
  }
  if (entry.runs !== null && typeof entry.runs !== 'number') {
    fail(errors, `${entry.id}: 'runs' must be a number or null`);
  }
  if (entry.publicApi !== null && typeof entry.publicApi !== 'boolean') {
    fail(errors, `${entry.id}: 'publicApi' must be a boolean or null`);
  }
  if (!DATE_RE.test(entry.lastVerified ?? '')) {
    fail(errors, `${entry.id}: 'lastVerified' must be YYYY-MM-DD, got '${entry.lastVerified}'`);
  }
  if (typeof entry.notes !== 'string' || entry.notes.length === 0) {
    fail(errors, `${entry.id}: 'notes' must be a non-empty string -- an entry with no notes is a bare assertion, not evidence`);
  }

  // A 'verified' status claim about runtime behavior must cite live-browser
  // evidence somewhere in its evidence source, per ADR-002/ADR-004 -- a
  // 'verified' parser/grammar claim must cite real-export (+ ebnf).
  if (entry.status === 'verified' && entry.evidenceSource === 'none') {
    fail(errors, `${entry.id}: status is 'verified' but evidenceSource is 'none' -- verified claims require live-browser and/or real-export(+ebnf) evidence, per ADR-004`);
  }
  if (entry.status === 'unsupported' && entry.outcome !== 'n/a') {
    fail(errors, `${entry.id}: status is 'unsupported' (an explicit not-built stub) but outcome is '${entry.outcome}' -- should be 'n/a'`);
  }

  validateCitation(entry, errors);

  if (entry.supportMatrixRow !== null) {
    const row = entry.supportMatrixRow;
    for (const f of ['order', 'component', 'verifiedAgainst', 'how']) {
      if (!(f in row)) fail(errors, `${entry.id}: supportMatrixRow missing '${f}'`);
    }
  }
}

function main() {
  if (!existsSync(REGISTRY_PATH)) {
    console.error(`Registry not found at ${REGISTRY_PATH}`);
    process.exit(1);
  }
  const data = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));
  if (!Array.isArray(data.entries)) {
    console.error('Registry has no top-level `entries` array');
    process.exit(1);
  }

  const errors = [];
  const seenIds = new Set();
  for (const entry of data.entries) {
    if (seenIds.has(entry.id)) {
      fail(errors, `duplicate id '${entry.id}'`);
    }
    seenIds.add(entry.id);
    validateEntry(entry, errors);
  }

  // Cross-check: every supportMatrixRow.order value must be unique (they
  // determine the rendered table's row order in generate-support-matrix.mjs).
  const orders = data.entries.filter((e) => e.supportMatrixRow).map((e) => e.supportMatrixRow.order);
  const orderSet = new Set(orders);
  if (orderSet.size !== orders.length) {
    fail(errors, `supportMatrixRow.order values are not unique: [${orders.join(', ')}]`);
  }

  if (errors.length > 0) {
    console.error(`docs/verification/26.1.json: ${errors.length} validation error(s):\n`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  console.log(`docs/verification/26.1.json: ${data.entries.length} entries, all valid.`);
  console.log(`  verified: ${data.entries.filter((e) => e.status === 'verified').length}`);
  console.log(`  documented: ${data.entries.filter((e) => e.status === 'documented').length}`);
  console.log(`  observed: ${data.entries.filter((e) => e.status === 'observed').length}`);
  console.log(`  unverified: ${data.entries.filter((e) => e.status === 'unverified').length}`);
  console.log(`  unsupported: ${data.entries.filter((e) => e.status === 'unsupported').length}`);
}

main();
