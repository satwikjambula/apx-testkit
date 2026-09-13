import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadApexlangExport, parseApp } from '@apx/parser';
import { computeDiff } from './diff.js';
import { specFileName } from './page-object.js';

export interface TestSelectionPlan {
  version: 1;
  scope: 'generated-spec-candidates';
  /** Never interpret candidate files as a safe reduced execution suite. */
  execution: 'full-suite';
  reasons: string[];
  baselineFingerprint: string;
  currentFingerprint: string;
  changedFiles: string[];
  /** Changes outside directly changed page sources cannot use page contracts. */
  unscopedChangedFiles: string[];
  applicationOrManifestChanged: boolean;
  knownPageIds: number[];
  candidates: { pageId: number; spec: string; reason: string }[];
  currentGeneratedSpecs: string[];
  staleGeneratedSpecs: string[];
  warnings: { export: 'baseline' | 'current'; message: string }[];
}

// Byte-level inventory is a conservative guard, not an alternate semantic
// parser. Include assets/JSON that the AST does not model. Refuse symlinks
// rather than silently excluding a potentially relevant export dependency.
export function inventory(root: string): Map<string, string> {
  const files = new Map<string, string>();
  function walk(dir: string, prefix: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
      const relative = prefix + entry.name;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path, relative + '/');
      else if (entry.isFile()) files.set(relative, createHash('sha256').update(readFileSync(path)).digest('hex'));
      else throw new Error(`Unsupported export entry: ${relative}. Use a regular-file export snapshot.`);
    }
  }
  walk(root, '');
  return files;
}

export function fingerprint(files: Map<string, string>): string {
  return createHash('sha256').update(JSON.stringify([...files].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0))).digest('hex');
}

/**
 * Explain direct generated-spec impact without pretending the AST is a
 * complete dependency graph. In this first increment every plan requires
 * the full configured suite; candidates are for prioritization/review only.
 */
export function planTestSelection(baselineDir: string, currentDir: string): TestSelectionPlan {
  const baselineRoot = resolve(baselineDir);
  const currentRoot = resolve(currentDir);
  const before = inventory(baselineRoot);
  const after = inventory(currentRoot);
  const baseline = parseApp(loadApexlangExport(baselineRoot));
  const current = parseApp(loadApexlangExport(currentRoot));
  for (const [name, result] of [['baseline', baseline], ['current', current]] as const) {
    const errors = result.warnings.filter(w => w.severity === 'error');
    if (errors.length) throw new Error(`Invalid ${name} export: ${errors.map(w => w.message).join('; ')}`);
  }
  const diff = computeDiff(baselineRoot, currentRoot);
  // Fail if an export changed during parsing rather than mixing snapshots.
  if (fingerprint(before) !== fingerprint(inventory(baselineRoot)) || fingerprint(after) !== fingerprint(inventory(currentRoot))) {
    throw new Error('Export changed while planning. Retry against immutable snapshots.');
  }
  const changedFiles = [...new Set([...before.keys(), ...after.keys()])]
    .filter(file => before.get(file) !== after.get(file)).sort();
  const specs = (result: typeof current) => result.ast.pages
    .filter(page => page.id !== 0 && page.alias).map(specFileName).sort();
  const currentGeneratedSpecs = specs(current);
  const currentSet = new Set(currentGeneratedSpecs);
  const candidateIds = new Set(diff.pages.filter(page => page.kind !== 'removed').map(page => page.id));
  const candidateSources = new Set([...baseline.ast.pages, ...current.ast.pages]
    .filter(page => candidateIds.has(page.id)).map(page => page.loc.file));
  const reasons = [
    'The export AST is not a complete dependency graph: cross-page, database, shared-code and hand-written-test dependencies are not proven.',
    'Run the full configured test suite, including hand-written tests. Candidate files are not an execution allowlist.',
  ];
  if (!changedFiles.length) reasons.push('Export bytes are unchanged; this does not establish that the database, environment, test code or runtime behavior is unchanged.');
  if (diff.applicationChanges.length || diff.manifestChanges.length) reasons.push('Application or manifest metadata changed.');
  if (changedFiles.length && !diff.pages.length) reasons.push('Export files changed without a directly affected generated page; changes may include shared components, global pages, assets or formatting.');
  return {
    version: 1,
    scope: 'generated-spec-candidates',
    execution: 'full-suite',
    reasons,
    baselineFingerprint: fingerprint(before),
    currentFingerprint: fingerprint(after),
    changedFiles,
    unscopedChangedFiles: changedFiles.filter(file => !candidateSources.has(file)),
    applicationOrManifestChanged: diff.applicationChanges.length > 0 || diff.manifestChanges.length > 0,
    knownPageIds: [...new Set([...baseline.ast.pages, ...current.ast.pages].map(page => page.id).filter(id => id > 0))].sort((a, b) => a - b),
    candidates: diff.pages.filter(page => page.kind !== 'removed').map(page => ({
      pageId: page.id,
      spec: page.affectedFiles.find(file => file.endsWith('.spec.ts'))!,
      reason: `Page ${page.id} ${page.kind}; direct AST change only, not transitive impact.`,
    })),
    currentGeneratedSpecs,
    staleGeneratedSpecs: specs(baseline).filter(file => !currentSet.has(file)),
    warnings: [
      ...baseline.warnings.map(w => ({ export: 'baseline' as const, message: `${w.loc.file}:${w.loc.line} ${w.message}` })),
      ...current.warnings.map(w => ({ export: 'current' as const, message: `${w.loc.file}:${w.loc.line} ${w.message}` })),
    ],
  };
}
