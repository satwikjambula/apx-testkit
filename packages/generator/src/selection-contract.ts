import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fingerprint, inventory, type TestSelectionPlan } from './selection.js';

export interface SelectionContractBody {
  version: 1;
  baselineFingerprint: string;
  currentFingerprint: string;
  suiteFingerprint: string;
  contextFingerprint: string;
  /** Human attestations, not facts inferred by apx-testkit. */
  completeSuite: true;
  completeDependencies: true;
  externalStateReviewed: true;
  tests: { id: string; spec: string; pageIds: number[]; alwaysRun: boolean; reason: string }[];
}

export interface SelectionContract extends SelectionContractBody {
  approval: { status: 'approved'; reviewedBy: string; reason: string; contentHash: string };
}

export interface ContractSelection {
  execution: 'full-suite' | 'reviewed-subset';
  selectedTests: string[] | null;
  decisions: { id: string; spec: string; selected: boolean; reason: string }[];
  reasons: string[];
  /** A hash guards integrity, not reviewer identity/authentication. */
  approvalHash: string;
}

function object(value: unknown, keys: string[], name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${name} must be an object`);
  const result = value as Record<string, unknown>;
  if (Object.keys(result).some(key => !keys.includes(key)) || keys.some(key => !(key in result))) {
    throw new Error(`${name} has missing or unknown fields`);
  }
  return result;
}
function text(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} must be a nonempty string`);
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
const bodyKeys = ['version', 'baselineFingerprint', 'currentFingerprint', 'suiteFingerprint', 'contextFingerprint', 'completeSuite', 'completeDependencies', 'externalStateReviewed', 'tests'];

function validateBody(input: unknown): SelectionContractBody {
  const body = object(input, bodyKeys, 'Contract body');
  if (body.version !== 1) throw new Error('Contract version must be 1');
  for (const key of ['baselineFingerprint', 'currentFingerprint', 'suiteFingerprint', 'contextFingerprint']) {
    if (typeof body[key] !== 'string' || !/^[a-f0-9]{64}$/.test(body[key] as string)) throw new Error(`Invalid ${key}`);
  }
  for (const key of ['completeSuite', 'completeDependencies', 'externalStateReviewed']) {
    if (body[key] !== true) throw new Error(`${key} must be explicitly attested true`);
  }
  if (!Array.isArray(body.tests) || !body.tests.length) throw new Error('Contract tests must be nonempty');
  const ids = new Set<string>();
  const specs = new Set<string>();
  for (const test of body.tests) {
    const entry = object(test, ['id', 'spec', 'pageIds', 'alwaysRun', 'reason'], 'Test dependency');
    text(entry.id, 'Test id');
    text(entry.spec, 'Spec path');
    text(entry.reason, 'Test dependency reason');
    if (/[*?\[\]{}\x00-\x1f]/.test(entry.spec) || entry.spec.startsWith('/') || entry.spec.includes('\\') || entry.spec.split('/').some(part => !part || part === '.' || part === '..') || !/\.(spec|test)\.[cm]?[jt]sx?$/.test(entry.spec)) throw new Error('Spec must be an explicit relative test-file path');
    if (ids.has(entry.id) || specs.has(entry.spec)) throw new Error('Duplicate test id or spec');
    ids.add(entry.id); specs.add(entry.spec);
    if (typeof entry.alwaysRun !== 'boolean') throw new Error('alwaysRun must be boolean');
    if (!Array.isArray(entry.pageIds) || entry.pageIds.some(id => !Number.isSafeInteger(id) || id <= 0) || new Set(entry.pageIds).size !== entry.pageIds.length) throw new Error('pageIds must contain unique positive integers');
    if (!entry.alwaysRun && !entry.pageIds.length) throw new Error('Tests without page dependencies must always run');
  }
  return body as unknown as SelectionContractBody;
}

/** Produces a review digest only. It never supplies an approval or identity. */
export function selectionContractHash(body: SelectionContractBody, reviewedBy: string, reason: string): string {
  validateBody(body); text(reviewedBy, 'reviewedBy'); text(reason, 'Approval reason');
  return `sha256:${createHash('sha256').update(canonical({ body, reviewedBy, reason })).digest('hex')}`;
}

export function validateSelectionContract(input: unknown): SelectionContract {
  const raw = object(input, [...bodyKeys, 'approval'], 'Contract');
  const { approval: approvalInput, ...bodyInput } = raw;
  const body = validateBody(bodyInput);
  const approval = object(approvalInput, ['status', 'reviewedBy', 'reason', 'contentHash'], 'Approval');
  if (approval.status !== 'approved') throw new Error('Contract requires explicit approved status');
  text(approval.reviewedBy, 'reviewedBy'); text(approval.reason, 'Approval reason');
  if (approval.contentHash !== selectionContractHash(body, approval.reviewedBy, approval.reason)) throw new Error('Contract approval hash mismatch');
  return structuredClone(input) as SelectionContract;
}

export function selectionEvidence(suiteDir: string, contextFile: string): { suiteFingerprint: string; contextFingerprint: string; specs: string[] } {
  const files = inventory(resolve(suiteDir));
  return {
    suiteFingerprint: fingerprint(files),
    contextFingerprint: createHash('sha256').update(readFileSync(resolve(contextFile))).digest('hex'),
    specs: [...files.keys()].filter(file => /\.(spec|test)\.[cm]?[jt]sx?$/.test(file)).sort(),
  };
}

/** Evaluate a human-reviewed dependency contract; never runs tests. */
export function evaluateSelectionContract(plan: TestSelectionPlan, input: unknown, suiteDir: string, contextFile: string): ContractSelection {
  const contract = validateSelectionContract(input);
  const evidence = selectionEvidence(suiteDir, contextFile);
  for (const key of ['baselineFingerprint', 'currentFingerprint'] as const) {
    if (contract[key] !== plan[key]) throw new Error(`Stale contract: ${key} changed`);
  }
  for (const key of ['suiteFingerprint', 'contextFingerprint'] as const) {
    if (contract[key] !== evidence[key]) throw new Error(`Stale contract: ${key} changed`);
  }
  if (JSON.stringify(contract.tests.map(test => test.spec).sort()) !== JSON.stringify(evidence.specs)) {
    throw new Error('Contract must cover every discovered spec in the approved suite directory');
  }
  const knownPages = new Set(plan.knownPageIds);
  if (contract.tests.some(test => test.pageIds.some(id => !knownPages.has(id)))) throw new Error('Contract references an unknown semantic page id');
  const fallback = (reason: string): ContractSelection => ({ execution: 'full-suite', selectedTests: null, decisions: [], reasons: [reason], approvalHash: contract.approval.contentHash });
  if (plan.warnings.length) return fallback('Parser warnings prevent reduced selection.');
  if (plan.staleGeneratedSpecs.length) return fallback('Removed or renamed generated specs require full-suite review.');
  if (!plan.candidates.length) return fallback('No directly changed generated pages; runtime and non-page dependencies remain uncertain.');
  if (plan.applicationOrManifestChanged) return fallback('Application or manifest metadata changed.');
  if (plan.unscopedChangedFiles.length) return fallback('Changes outside directly changed page sources require the full suite.');
  const changed = new Set(plan.candidates.map(candidate => candidate.pageId));
  if ([...changed].some(id => !contract.tests.some(test => test.pageIds.includes(id)))) return fallback('A changed page has no declared test dependency.');
  const decisions = [...contract.tests].sort((a, b) => a.spec < b.spec ? -1 : a.spec > b.spec ? 1 : 0).map(test => ({
    id: test.id, spec: test.spec,
    selected: test.alwaysRun || test.pageIds.some(id => changed.has(id)),
    reason: test.alwaysRun ? `Always run: ${test.reason}` : test.pageIds.some(id => changed.has(id)) ? `Declared changed-page dependency: ${test.reason}` : `Excluded by reviewed dependency declaration: ${test.reason}`,
  }));
  return { execution: 'reviewed-subset', selectedTests: decisions.filter(d => d.selected).map(d => d.spec), decisions, reasons: ['Conditional on the reviewer-attested complete suite, dependencies and external-state record; not independently verified by apx-testkit.'], approvalHash: contract.approval.contentHash };
}
