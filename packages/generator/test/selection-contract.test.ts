import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { planTestSelection, type TestSelectionPlan } from '../src/selection.js';
import { evaluateSelectionContract, selectionContractHash, selectionEvidence, validateSelectionContract, type SelectionContract, type SelectionContractBody } from '../src/selection-contract.js';

let root: string;
let suite: string;
let context: string;
let plan: TestSelectionPlan;
let contract: SelectionContract;
function approve(body: SelectionContractBody): SelectionContract {
  const reviewedBy = 'fixture-reviewer';
  const reason = 'Synthetic test-only review';
  return { ...body, approval: { status: 'approved', reviewedBy, reason, contentHash: selectionContractHash(body, reviewedBy, reason) } };
}
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'apx-contract-'));
  suite = join(root, 'tests'); mkdirSync(suite);
  writeFileSync(join(suite, 'employee.spec.ts'), '// fixture');
  writeFileSync(join(suite, 'other.spec.ts'), '// fixture');
  writeFileSync(join(suite, 'health.spec.ts'), '// fixture');
  context = join(root, 'external-state.json');
  writeFileSync(context, '{"databaseRevision":"fixture-v1"}');
  const fixture = join(__dirname, 'fixtures/reference-fixtures');
  cpSync(fixture, join(root, 'old'), { recursive: true });
  cpSync(fixture, join(root, 'new'), { recursive: true });
  for (const dir of ['old', 'new']) writeFileSync(join(root, dir, 'pages/p00009-other.apx'), 'page 9 (\n page: 9\n name: Other\n alias: OTHER\n title: Other\n)');
  const page = join(root, 'new/pages/p00003-employee.apx');
  writeFileSync(page, readFileSync(page, 'utf8').replace('title: Employee', 'title: Changed'));
  plan = planTestSelection(join(root, 'old'), join(root, 'new'));
  const evidence = selectionEvidence(suite, context);
  contract = approve({ version: 1, baselineFingerprint: plan.baselineFingerprint, currentFingerprint: plan.currentFingerprint,
    suiteFingerprint: evidence.suiteFingerprint, contextFingerprint: evidence.contextFingerprint,
    completeSuite: true, completeDependencies: true, externalStateReviewed: true,
    tests: [
      { id: 'employee', spec: 'employee.spec.ts', pageIds: [3], alwaysRun: false, reason: 'Exercises employee' },
      { id: 'other', spec: 'other.spec.ts', pageIds: [9], alwaysRun: false, reason: 'Independent reviewed scenario' },
      { id: 'health', spec: 'health.spec.ts', pageIds: [], alwaysRun: true, reason: 'Cross-cutting check' },
    ] });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));
describe('reviewed dependency contracts', () => {
  it('selects declared impacted tests and always-run tests', () => {
    expect(plan.unscopedChangedFiles).toEqual([]);
    const result = evaluateSelectionContract(plan, contract, suite, context);
    expect(result.execution).toBe('reviewed-subset');
    expect(result.selectedTests).toEqual(['employee.spec.ts', 'health.spec.ts']);
    expect(result.decisions.find(d => d.id === 'other')).toMatchObject({ selected: false, reason: expect.stringContaining('reviewed') });
  });
  it('binds every dependency declaration to approval', () => {
    contract.tests[0]!.pageIds = [9];
    expect(() => evaluateSelectionContract(plan, contract, suite, context)).toThrow(/hash mismatch/);
  });
  it('binds reviewer identity and reason to the digest', () => {
    contract.approval.reviewedBy = 'someone-else';
    expect(() => validateSelectionContract(contract)).toThrow(/hash mismatch/);
  });
  it('requires approval, not just a valid body', () => {
    const { approval: _approval, ...body } = contract;
    expect(_approval.status).toBe('approved');
    expect(() => validateSelectionContract(body)).toThrow(/missing/);
    expect(() => validateSelectionContract({ ...contract, approval: { ...contract.approval, status: 'draft' } })).toThrow(/approved/);
  });
  it.each(['baselineFingerprint', 'currentFingerprint'] as const)('rejects stale %s', key => {
    expect(() => evaluateSelectionContract({ ...plan, [key]: '0'.repeat(64) }, contract, suite, context)).toThrow(/Stale contract/);
  });
  it('rejects changed test helpers as well as test files', () => {
    writeFileSync(join(suite, 'helper.ts'), '// new helper');
    expect(() => evaluateSelectionContract(plan, contract, suite, context)).toThrow(/suiteFingerprint/);
  });
  it('rejects stale external-state evidence', () => {
    writeFileSync(context, '{}');
    expect(() => evaluateSelectionContract(plan, contract, suite, context)).toThrow(/contextFingerprint/);
  });
  it('rejects incomplete suite coverage even with a valid approval', () => {
    const { approval: _approval, ...body } = contract;
    expect(_approval.status).toBe('approved');
    body.tests = body.tests.slice(0, 1);
    expect(() => evaluateSelectionContract(plan, approve(body), suite, context)).toThrow(/every discovered spec/);
  });
  it.each([
    { warnings: [{ export: 'current' as const, message: 'warning' }] },
    { staleGeneratedSpecs: ['obsolete.spec.ts'] },
    { candidates: [] },
    { applicationOrManifestChanged: true },
    { unscopedChangedFiles: ['assets/custom.js'] },
    { candidates: [{ pageId: 42, spec: 'unknown.spec.ts', reason: 'added' }] },
  ])('falls back to the full suite for uncertainty: %j', overrides => {
    const result = evaluateSelectionContract({ ...plan, ...overrides }, contract, suite, context);
    expect(result.execution).toBe('full-suite');
    expect(result.selectedTests).toBeNull();
  });
  it('rejects typo fields instead of ignoring them', () => {
    expect(() => validateSelectionContract({ ...contract, skipUnknown: true })).toThrow(/unknown/);
  });
  it.each(['../other.spec.ts', '/other.spec.ts', 'nested\\other.spec.ts', './other.spec.ts', '*.spec.ts'])('rejects unsafe or wildcard path %s', spec => {
    contract.tests[0]!.spec = spec;
    expect(() => validateSelectionContract(contract)).toThrow();
  });
  it('rejects duplicate test identities', () => {
    contract.tests[0]!.id = 'health';
    expect(() => validateSelectionContract(contract)).toThrow(/Duplicate/);
  });
  it('rejects unknown semantic page ids even with a fresh approval', () => {
    const { approval: _approval, ...body } = contract;
    expect(_approval.status).toBe('approved');
    body.tests[0]!.pageIds = [999];
    expect(() => evaluateSelectionContract(plan, approve(body), suite, context)).toThrow(/unknown semantic page/);
  });
  it('rejects missing dependency attestations', () => {
    expect(() => validateSelectionContract({ ...contract, completeDependencies: false })).toThrow(/attested/);
  });
  it('canonicalizes object key order without silently approving array edits', () => {
    // A complete recursive key reorder retains the same digest.
    const reverse = (value: unknown): unknown => Array.isArray(value) ? value.map(reverse) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).reverse().map(([k, v]) => [k, reverse(v)])) : value;
    expect(validateSelectionContract(reverse(contract))).toEqual(contract);
    contract.tests.reverse();
    expect(() => validateSelectionContract(contract)).toThrow(/hash mismatch/);
  });
  it('CLI evaluates approval without changing the default advisory plan', () => {
    const file = join(root, 'contract.json'); writeFileSync(file, JSON.stringify(contract));
    const result = spawnSync(process.execPath, [join(__dirname, '../dist/select-cli.js'), join(root, 'old'), join(root, 'new'), '--contract', file, '--suite', suite, '--context', context], { encoding: 'utf8' });
    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.execution).toBe('full-suite');
    expect(output.contractSelection.selectedTests).toEqual(['employee.spec.ts', 'health.spec.ts']);
  });
  it('CLI refuses partial contract inputs', () => {
    const result = spawnSync(process.execPath, [join(__dirname, '../dist/select-cli.js'), join(root, 'old'), join(root, 'new'), '--contract', 'missing'], { encoding: 'utf8' });
    expect(result.status).toBe(2);
    expect(result.stdout).toBe('');
  });
});
