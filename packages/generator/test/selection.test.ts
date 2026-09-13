import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { planTestSelection } from '../src/selection.js';

let root: string;
let baseline: string;
let current: string;
const fixture = join(__dirname, 'fixtures/reference-fixtures');
const pagePath = 'pages/p00003-employee.apx';
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'apx-selection-'));
  baseline = join(root, 'baseline');
  current = join(root, 'current');
  cpSync(fixture, baseline, { recursive: true });
  cpSync(fixture, current, { recursive: true });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));
function change(from: string, to: string) {
  const path = join(current, pagePath);
  writeFileSync(path, readFileSync(path, 'utf8').replace(from, to));
}
describe('advisory change-based selection', () => {
  it('never turns identical exports into permission to skip runtime tests', () => {
    const plan = planTestSelection(baseline, current);
    expect(plan.execution).toBe('full-suite');
    expect(plan.candidates).toEqual([]);
    expect(plan.changedFiles).toEqual([]);
    expect(plan.baselineFingerprint).toBe(plan.currentFingerprint);
    expect(plan.reasons.join(' ')).toContain('database');
  });
  it('identifies directly affected specs with reasons and stable identity', () => {
    change('title: Employee', 'title: Changed');
    const plan = planTestSelection(baseline, current);
    expect(plan.candidates).toEqual([{ pageId: 3, spec: 'p00003-employee.spec.ts', reason: 'Page 3 changed; direct AST change only, not transitive impact.' }]);
    expect(plan.changedFiles).toEqual([pagePath]);
    expect(plan.execution).toBe('full-suite');
  });
  it('lists renamed specs as stale without selecting the obsolete filename', () => {
    change('alias: EMPLOYEE', 'alias: STAFF');
    const plan = planTestSelection(baseline, current);
    expect(plan.staleGeneratedSpecs).toEqual(['p00003-employee.spec.ts']);
    expect(plan.candidates[0]?.spec).toBe('p00003-staff.spec.ts');
  });
  it('handles removed pages without proposing nonexistent tests', () => {
    rmSync(join(current, pagePath));
    const plan = planTestSelection(baseline, current);
    expect(plan.candidates).toEqual([]);
    expect(plan.currentGeneratedSpecs).toEqual([]);
    expect(plan.staleGeneratedSpecs).toEqual(['p00003-employee.spec.ts']);
    expect(plan.execution).toBe('full-suite');
  });
  it('handles additions', () => {
    rmSync(join(baseline, pagePath));
    expect(planTestSelection(baseline, current).candidates[0]?.reason).toContain('added');
  });
  it.each(['assets/custom.js', 'shared-components/custom.json', '.apex/extra.json'])('detects non-AST file changes: %s', path => {
    const parts = path.split('/');
    parts.pop();
    mkdirSync(join(current, ...parts), { recursive: true });
    writeFileSync(join(current, path), '{}');
    const plan = planTestSelection(baseline, current);
    expect(plan.changedFiles).toEqual([path]);
    expect(plan.execution).toBe('full-suite');
    expect(plan.reasons.join(' ')).toContain('without a directly affected');
  });
  it('does not miss source changes absent from semantic diff', () => {
    change('title: Employee', 'title: Employee\n');
    expect(planTestSelection(baseline, current).changedFiles).toEqual([pagePath]);
  });
  it('refuses unsupported manifests', () => {
    writeFileSync(join(current, '.apex/apexlang.json'), '{"mmdVersion":"27.1"}');
    expect(() => planTestSelection(baseline, current)).toThrow(/26.1/);
  });
  it('refuses missing manifests', () => {
    rmSync(join(baseline, '.apex/apexlang.json'));
    expect(() => planTestSelection(baseline, current)).toThrow(/missing/);
  });
  it('refuses structurally invalid exports', () => {
    writeFileSync(join(current, pagePath), 'page 3 (');
    expect(() => planTestSelection(baseline, current)).toThrow();
  });
  it('rejects symlinks rather than silently ignoring dependencies', () => {
    symlinkSync(join(baseline, pagePath), join(current, 'linked.apx'));
    expect(() => planTestSelection(baseline, current)).toThrow(/Unsupported export entry/);
  });
  it('is deterministic and independent of checkout root', () => {
    change('title: Employee', 'title: Changed');
    const plan = planTestSelection(baseline, current);
    expect(planTestSelection(baseline, current)).toEqual(plan);
    cpSync(baseline, join(root, 'old-copy'), { recursive: true });
    cpSync(current, join(root, 'new-copy'), { recursive: true });
    expect(planTestSelection(join(root, 'old-copy'), join(root, 'new-copy'))).toEqual(plan);
  });
  it('CLI emits only JSON and never runs tests', () => {
    const result = spawnSync(process.execPath, [join(__dirname, '../dist/select-cli.js'), baseline, current], { encoding: 'utf8' });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(planTestSelection(baseline, current));
  });
  it('CLI rejects unknown flags', () => {
    const result = spawnSync(process.execPath, [join(__dirname, '../dist/select-cli.js'), baseline, current, '--skip'], { encoding: 'utf8' });
    expect(result.status).toBe(2);
    expect(result.stdout).toBe('');
  });
});
