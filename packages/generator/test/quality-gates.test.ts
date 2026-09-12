import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { evaluateQualityGates, parseQualityPolicy, type QualityGateInput } from '../src/quality-gates.js';
import { onboardingFailed, runOnboarding } from '../src/onboard.js';

const fixture = resolve(__dirname, 'fixtures/reference-fixtures');
const evidence: QualityGateInput = {
  parserWarningCount: 2, baselineWarningCount: 1, unmodeledComponents: [], pages: [],
  sqlcl: { requested: false, passed: null, exitCode: null },
};

describe('quality policy validation', () => {
  it.each([null, [], { version: 2, maxParserWarnings: 0 }, { version: 1 },
    { version: 1, requireSqlcl: false }, { version: 1, maxParserWarning: 0 },
    { version: 1, maxParserWarnings: -1 }, { version: 1, maxParserWarnings: 1.5 },
    { version: 1, maxParserWarnings: NaN }, { version: 1, maxParserWarnings: Infinity },
    { version: 1, maxParserWarnings: '0' }, { version: 1, requireSqlcl: 'true' },
    { version: 1, allowedUnmodeledComponents: ['plugin'] },
    { version: 1, allowedUnmodeledComponents: [{ type: 'plugin', reason: ' ' }] },
    { version: 1, allowedUnmodeledComponents: [{ type: 'plugin', reason: 'reviewed', typo: true }] },
    { version: 1, allowedUnmodeledComponents: [{ type: 'x', reason: 'one' }, { type: 'x', reason: 'two' }] },
  ])('rejects invalid or ineffective policy %j', (policy) => {
    expect(() => parseQualityPolicy(policy)).toThrow(/policy|component/i);
  });

  it('copies and sorts exceptions without modifying the policy', () => {
    const input = { version: 1, allowedUnmodeledComponents: [{ type: 'z', reason: 'later' }, { type: 'a', reason: 'reviewed' }] };
    const output = parseQualityPolicy(input);
    expect(output.allowedUnmodeledComponents?.map((item) => item.type)).toEqual(['a', 'z']);
    expect(input.allowedUnmodeledComponents[0].type).toBe('z');
  });
});

describe('quality decisions', () => {
  it('evaluates exact limits and net warning growth', () => {
    expect(evaluateQualityGates({ version: 1, maxParserWarnings: 2, maxWarningIncrease: 1 }, evidence).passed).toBe(true);
    const failed = evaluateQualityGates({ version: 1, maxParserWarnings: 1, maxWarningIncrease: 0 }, evidence);
    expect(failed.checks.map((check) => check.status)).toEqual(['failed', 'failed']);
    expect(evaluateQualityGates({ version: 1, maxWarningIncrease: 0 }, { ...evidence, baselineWarningCount: 3 }).passed).toBe(true);
  });

  it('blocks growth checks without a baseline, even with zero current warnings', () => {
    const report = evaluateQualityGates({ version: 1, maxWarningIncrease: 0 },
      { ...evidence, baselineWarningCount: null, parserWarningCount: 0 });
    expect(report.passed).toBe(false);
    expect(report.checks[0].status).toBe('blocked');
  });

  it.each([NaN, -1, Infinity, 0.5])('rejects invalid evidence count %s', (count) => {
    expect(() => evaluateQualityGates({ version: 1, maxParserWarnings: 0 },
      { ...evidence, parserWarningCount: count })).toThrow(/evidence/);
  });

  it('requires requested and successful SQLcl validation, not just an exit code', () => {
    const policy = { version: 1 as const, requireSqlcl: true };
    expect(evaluateQualityGates(policy, evidence).checks[0].status).toBe('blocked');
    for (const sqlcl of [
      { requested: true, passed: false, exitCode: 0 },
      { requested: true, passed: null, exitCode: 0 },
      { requested: true, passed: true, exitCode: 1 },
    ]) expect(evaluateQualityGates(policy, { ...evidence, sqlcl }).passed).toBe(false);
    expect(evaluateQualityGates(policy, { ...evidence, sqlcl: { requested: true, passed: true, exitCode: 0 } }).passed).toBe(true);
  });

  it('allows exact documented exceptions and reports unknown types', () => {
    const policy = { version: 1 as const, allowedUnmodeledComponents: [{ type: 'plugin', reason: 'Manual verification tracked in issue 42.' }] };
    const report = evaluateQualityGates(policy, { ...evidence, unmodeledComponents: ['plugin', 'other', 'plugin'] });
    expect(report.passed).toBe(false);
    expect(report.appliedExceptions).toEqual(policy.allowedUnmodeledComponents);
    expect(report.checks[0].message).toContain('other');
    expect(evaluateQualityGates(policy, { ...evidence, unmodeledComponents: ['plugin'] }).passed).toBe(true);
    expect(evaluateQualityGates({ version: 1, allowedUnmodeledComponents: [] }, { ...evidence, unmodeledComponents: ['plugin'] }).passed).toBe(false);
  });

  it('counts skipped regions and pages independently', () => {
    const pages = [{ pageId: 3, alias: 'EMPLOYEE', notAutoRoutable: true, notAutoRoutableReasons: ['modal'],
      skippedRegions: [{ identifier: 'employee', type: 'form', reason: 'no-verified-dom-convention' as const }] }];
    const report = evaluateQualityGates({ version: 1, maxSkippedRegions: 0, maxNotAutoRoutablePages: 0 }, { ...evidence, pages });
    expect(report.checks.map((check) => [check.actual, check.status])).toEqual([[1, 'failed'], [1, 'failed']]);
  });
});

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'apx-quality-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });
const outputs = () => ({ testsOutDir: join(dir, 'tests'), docsOutDir: join(dir, 'docs') });

describe('onboarding quality gate integration', () => {
  it('keeps no-policy runs explicit and evaluates a real baseline deterministically', async () => {
    const ordinary = await runOnboarding({ exportDir: fixture, ...outputs() });
    expect(ordinary.qualityGate).toBeNull();
    const options = { exportDir: fixture, baselineExportDir: fixture, ...outputs(),
      qualityPolicy: { version: 1 as const, maxWarningIncrease: 0, maxParserWarnings: 0 } };
    const first = await runOnboarding(options);
    const second = await runOnboarding(options);
    expect(first.qualityGate?.passed).toBe(true);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it('uses actual parser warnings, not injected report text', async () => {
    const current = join(dir, 'export');
    cpSync(fixture, current, { recursive: true });
    writeFileSync(join(current, 'extra.apx'), 'unrecognized top level text\n');
    const report = await runOnboarding({ exportDir: current, baselineExportDir: fixture, ...outputs(),
      qualityPolicy: { version: 1, maxWarningIncrease: 0 } });
    expect(report.parserWarnings.length).toBeGreaterThan(0);
    expect(report.qualityGate?.passed).toBe(false);
    expect(onboardingFailed(report)).toBe(true);
  });

  it('rejects policy typos before output or SQLcl execution', async () => {
    let called = false;
    await expect(runOnboarding({ exportDir: fixture, ...outputs(), sqlcl: {},
      qualityPolicy: { version: 1, maxParserWarning: 0 } as any }, {
      execFn: async () => { called = true; return { code: 0, stdout: '', stderr: '' }; },
    })).rejects.toThrow(/Unknown quality policy/);
    expect(called).toBe(false);
    expect(existsSync(outputs().testsOutDir)).toBe(false);
  });

  it('cannot use a passing policy to hide a failed SQLcl result', async () => {
    const report = await runOnboarding({ exportDir: fixture, ...outputs(), sqlcl: { executablePath: '/fake/sql' },
      qualityPolicy: { version: 1, maxParserWarnings: 0 } },
    { existsFn: () => true, execFn: async () => ({ code: 0, stdout: 'Compile Errors', stderr: '' }) });
    expect(report.qualityGate?.passed).toBe(true);
    expect(onboardingFailed(report)).toBe(true);
  });
});

describe('quality gate CLI exit contract', () => {
  function cli(extra: string[]) {
    return spawnSync(process.execPath, [resolve(__dirname, '../dist/onboard-cli.js'),
      '--export', fixture, '--tests', outputs().testsOutDir, '--docs', outputs().docsOutDir,
      '--report', join(dir, 'report.json'), ...extra], { encoding: 'utf8' });
  }

  it('writes a failed report and exits 1 for missing required validation', () => {
    const policy = join(dir, 'policy.json');
    writeFileSync(policy, JSON.stringify({ version: 1, requireSqlcl: true }));
    const result = cli(['--quality-policy', policy]);
    expect(result.status, result.stderr).toBe(1);
    const report = JSON.parse(readFileSync(join(dir, 'report.json'), 'utf8'));
    expect(report.qualityGate.checks[0].status).toBe('blocked');
    expect(result.stdout).toContain('quality gates: FAILED');
  });

  it('exits 0 for a passing policy', () => {
    const policy = join(dir, 'policy.json');
    writeFileSync(policy, JSON.stringify({ version: 1, maxParserWarnings: 0 }));
    const result = cli(['--quality-policy', policy]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('quality gates: PASSED');
  });

  it.each([['--quality-polciy', 'x'], ['--quality-policy'], ['--quality-policy', '--sqlcl'],
    ['--quality-policy', 'a', '--quality-policy', 'b']])('rejects malformed flags %j before outputs', (...extra) => {
    const result = cli(extra);
    expect(result.status).toBe(2);
    expect(existsSync(join(dir, 'report.json'))).toBe(false);
    expect(existsSync(outputs().testsOutDir)).toBe(false);
  });
});
