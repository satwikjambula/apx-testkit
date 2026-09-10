import { readFileSync } from 'node:fs';
import type { PageGenerationDiagnostics } from './lib.js';

/** Explicit opt-in rules; omitted rules are not evaluated. No live-test claims. */
export interface QualityPolicy {
  version: 1;
  maxParserWarnings?: number;
  /** Net increase in warning COUNT, not a comparison of individual warnings. */
  maxWarningIncrease?: number;
  allowedUnmodeledComponents?: { type: string; reason: string }[];
  requireSqlcl?: boolean;
  maxSkippedRegions?: number;
  maxNotAutoRoutablePages?: number;
}

const LIMITS = ['maxParserWarnings', 'maxWarningIncrease', 'maxSkippedRegions', 'maxNotAutoRoutablePages'] as const;
const KEYS = new Set<string>(['version', ...LIMITS, 'allowedUnmodeledComponents', 'requireSqlcl']);

/** Validate at every public entry point, including callers without TypeScript. */
export function parseQualityPolicy(value: unknown): QualityPolicy {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Quality policy must be an object.');
  }
  const input = value as Record<string, unknown>;
  for (const key of Object.keys(input)) {
    if (!KEYS.has(key)) throw new Error(`Unknown quality policy field: ${key}`);
  }
  if (input.version !== 1) throw new Error('Quality policy version must be 1.');
  const policy: QualityPolicy = { version: 1 };
  for (const key of LIMITS) {
    if (!(key in input)) continue;
    const limit = input[key];
    if (typeof limit !== 'number' || !Number.isSafeInteger(limit) || limit < 0) {
      throw new Error(`Quality policy ${key} must be a non-negative safe integer.`);
    }
    policy[key] = limit;
  }
  if ('requireSqlcl' in input) {
    if (typeof input.requireSqlcl !== 'boolean') throw new Error('Quality policy requireSqlcl must be a boolean.');
    policy.requireSqlcl = input.requireSqlcl;
  }
  if ('allowedUnmodeledComponents' in input) {
    if (!Array.isArray(input.allowedUnmodeledComponents)) {
      throw new Error('Quality policy allowedUnmodeledComponents must be an array.');
    }
    const seen = new Set<string>();
    policy.allowedUnmodeledComponents = input.allowedUnmodeledComponents.map((entry: unknown) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        throw new Error('Each allowed unmodeled component must have a type and reason.');
      }
      const item = entry as Record<string, unknown>;
      if (Object.keys(item).some((key) => key !== 'type' && key !== 'reason') ||
          typeof item.type !== 'string' || !item.type.trim() || item.type !== item.type.trim() ||
          typeof item.reason !== 'string' || !item.reason.trim()) {
        throw new Error('Each allowed unmodeled component needs an exact type and non-empty reason, with no extra fields.');
      }
      if (seen.has(item.type)) throw new Error(`Duplicate allowed unmodeled component: ${item.type}`);
      seen.add(item.type);
      return { type: item.type, reason: item.reason.trim() };
    }).sort((a, b) => a.type < b.type ? -1 : a.type > b.type ? 1 : 0);
  }
  if (!LIMITS.some((key) => policy[key] !== undefined) &&
      policy.allowedUnmodeledComponents === undefined && policy.requireSqlcl !== true) {
    throw new Error('Quality policy must enable at least one rule.');
  }
  return policy;
}

export function loadQualityPolicy(path: string): QualityPolicy {
  return parseQualityPolicy(JSON.parse(readFileSync(path, 'utf8')));
}

export interface QualityGateInput {
  parserWarningCount: number;
  baselineWarningCount: number | null;
  unmodeledComponents: readonly string[];
  pages: readonly PageGenerationDiagnostics[];
  sqlcl: { requested: boolean; passed: boolean | null; exitCode: number | null };
}

export interface QualityGateCheck {
  rule: keyof Omit<QualityPolicy, 'version'>;
  status: 'passed' | 'failed' | 'blocked';
  message: string;
  actual: number | boolean | string[] | null;
  expected: number | boolean | string[];
}

export interface QualityGateReport {
  policy: QualityPolicy;
  passed: boolean;
  checks: QualityGateCheck[];
  appliedExceptions: { type: string; reason: string }[];
}

/** Derives gate decisions only from the current run's structured diagnostics. */
export function evaluateQualityGates(value: QualityPolicy, input: QualityGateInput): QualityGateReport {
  const policy = parseQualityPolicy(value);
  // Reject invalid count evidence instead of allowing NaN comparisons to pass.
  for (const [name, count] of [['parserWarningCount', input.parserWarningCount],
    ['baselineWarningCount', input.baselineWarningCount]] as const) {
    if (count === null && name === 'baselineWarningCount') continue;
    if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) {
      throw new Error(`Invalid quality gate evidence: ${name}`);
    }
  }
  const checks: QualityGateCheck[] = [];
  const limit = (rule: typeof LIMITS[number], actual: number | null): void => {
    const expected = policy[rule];
    if (expected === undefined) return;
    checks.push({ rule, actual, expected,
      status: actual === null ? 'blocked' : actual <= expected ? 'passed' : 'failed',
      message: actual === null ? `${rule} requires a baseline export.` : `${rule}: ${actual} (maximum ${expected}).`,
    });
  };
  limit('maxParserWarnings', input.parserWarningCount);
  limit('maxWarningIncrease', input.baselineWarningCount === null ? null :
    Math.max(0, input.parserWarningCount - input.baselineWarningCount));
  limit('maxSkippedRegions', input.pages.reduce((count, page) => count + page.skippedRegions.length, 0));
  limit('maxNotAutoRoutablePages', input.pages.filter((page) => page.notAutoRoutable).length);

  const types = [...new Set(input.unmodeledComponents)].sort();
  const appliedExceptions = (policy.allowedUnmodeledComponents ?? []).filter((entry) => types.includes(entry.type));
  if (policy.allowedUnmodeledComponents !== undefined) {
    const expected = policy.allowedUnmodeledComponents.map((entry) => entry.type);
    const unexpected = types.filter((type) => !expected.includes(type));
    checks.push({ rule: 'allowedUnmodeledComponents', actual: types, expected,
      status: unexpected.length ? 'failed' : 'passed',
      message: unexpected.length ? `Unmodeled components need review: ${unexpected.join(', ')}` : 'All unmodeled components have explicit exceptions.',
    });
  }
  if (policy.requireSqlcl) {
    const passed = input.sqlcl.requested && input.sqlcl.passed === true && input.sqlcl.exitCode === 0;
    checks.push({ rule: 'requireSqlcl', actual: passed, expected: true,
      status: !input.sqlcl.requested ? 'blocked' : passed ? 'passed' : 'failed',
      message: !input.sqlcl.requested ? 'SQLcl is required by policy; request validation explicitly.' :
        passed ? 'SQLcl validation passed.' : 'SQLcl validation failed.',
    });
  }
  return { policy, passed: checks.every((check) => check.status === 'passed'), checks, appliedExceptions };
}
