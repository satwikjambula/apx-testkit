/**
 * Black-box tests for the `apx-onboard` CLI (`onboard-cli.ts`), spawned as
 * a real child process against the BUILT `dist/onboard-cli.js` -- the CLI
 * file itself calls `process.exit()`/parses `process.argv` at module load,
 * so it cannot be exercised safely via a direct `import` inside the test
 * process (matching this project's other CLIs, none of which are
 * ever `import`-tested directly for the same reason). This requires
 * `packages/generator` to already be built (`npm run build -w
 * packages/generator`) before this suite runs -- the same real,
 * already-established dependency `packages/mcp/test/server.test.ts` has
 * on this package's `dist/` output via `@apx/testgen`'s package.json
 * `exports` map.
 *
 * Argument parsing, exit codes, and both the no-baseline and baseline
 * paths are covered end-to-end against real, already-committed export
 * fixtures -- no invented data.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const FIXTURES_ROOT = join(__dirname, 'fixtures');
const REFERENCE_FIXTURE = join(FIXTURES_ROOT, 'reference-fixtures');
const NAV_SAFETY_FIXTURE = join(FIXTURES_ROOT, 'navigation-safety-fixture');
const CLI_PATH = join(__dirname, '..', 'dist', 'onboard-cli.js');

let tmpDir: string;

beforeAll(() => {
  if (!existsSync(CLI_PATH)) {
    throw new Error(`${CLI_PATH} does not exist -- run "npm run build -w packages/generator" before this suite.`);
  }
});

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'apx-onboard-cli-test-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function run(args: string[], env?: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, [CLI_PATH, ...args], { encoding: 'utf8', env });
}

describe('apx-onboard CLI -- argument parsing', () => {
  it('no arguments at all: exit code 2, usage on stderr', () => {
    const r = run([]);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/Usage: apx-onboard/);
  });

  it('missing --tests: exit code 2, usage on stderr', () => {
    const r = run(['--export', REFERENCE_FIXTURE, '--docs', join(tmpDir, 'docs'), '--report', join(tmpDir, 'r.json')]);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/Usage: apx-onboard/);
  });

  it('missing --report: exit code 2, usage on stderr', () => {
    const r = run(['--export', REFERENCE_FIXTURE, '--tests', join(tmpDir, 't'), '--docs', join(tmpDir, 'd')]);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/Usage: apx-onboard/);
  });

  it('--sqlcl=<empty>: exit code 2, specific error, not the generic usage text', () => {
    const r = run([
      '--export', REFERENCE_FIXTURE,
      '--tests', join(tmpDir, 't'),
      '--docs', join(tmpDir, 'd'),
      '--report', join(tmpDir, 'r.json'),
      '--sqlcl=',
    ]);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/--sqlcl=<path> requires a non-empty path/);
  });
});

describe('apx-onboard CLI -- invalid export directory', () => {
  it('a nonexistent --export directory: exit code 1, clear stderr message, no report written', () => {
    const reportPath = join(tmpDir, 'report.json');
    const r = run([
      '--export', '/nonexistent/apx/export',
      '--tests', join(tmpDir, 't'),
      '--docs', join(tmpDir, 'd'),
      '--report', reportPath,
    ]);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/Export directory not found/);
    expect(existsSync(reportPath)).toBe(false);
  });
});

describe('apx-onboard CLI -- no-baseline run (real reference fixture)', () => {
  it('exit code 0; writes a real report JSON; stdout summarizes generate/docs/flow/diff/coverage/sqlcl', () => {
    const reportPath = join(tmpDir, 'report.json');
    const r = run([
      '--export', REFERENCE_FIXTURE,
      '--tests', join(tmpDir, 'tests'),
      '--docs', join(tmpDir, 'docs'),
      '--report', reportPath,
    ]);
    expect(r.status, r.stderr).toBe(0);
    expect(existsSync(reportPath)).toBe(true);

    const report = JSON.parse(readFileSync(reportPath, 'utf8'));
    expect(report.baselineExportDir).toBeNull();
    expect(report.generate.generated).toBe(1);
    expect(report.diff.included).toBe(false);
    expect(report.coverage.included).toBe(false);
    expect(report.sqlcl.requested).toBe(false);

    expect(r.stdout).toContain('Onboarding report written to');
    expect(r.stdout).toContain('baseline: (none -- first-ever generation)');
    expect(r.stdout).toMatch(/diff: not included/);
    expect(r.stdout).toMatch(/coverage: not included/);
    expect(r.stdout).toMatch(/sqlcl validate: not requested/);
  });
});

describe('apx-onboard CLI -- baseline run (two real, different fixtures)', () => {
  it('exit code 0; report includes a real diff; coverage still omitted (no --touch-log)', () => {
    const reportPath = join(tmpDir, 'report.json');
    const r = run([
      '--export', NAV_SAFETY_FIXTURE,
      '--baseline', REFERENCE_FIXTURE,
      '--tests', join(tmpDir, 'tests'),
      '--docs', join(tmpDir, 'docs'),
      '--report', reportPath,
    ]);
    expect(r.status, r.stderr).toBe(0);
    const report = JSON.parse(readFileSync(reportPath, 'utf8'));
    expect(report.diff.included).toBe(true);
    expect(report.diff.report.summary).toEqual({ pagesAdded: 3, pagesRemoved: 0, pagesChanged: 1, pagesUnchanged: 0 });
    expect(report.coverage.included).toBe(false);
    expect(r.stdout).toMatch(/diff: 3 added, 0 removed, 1 changed, 0 unchanged/);
  });

  it('exit code 0; --touch-log pointing at a real, existing touch log includes a real coverage section', () => {
    const reportPath = join(tmpDir, 'report.json');
    const touchLogPath = join(tmpDir, 'touch.jsonl');
    writeFileSync(touchLogPath, `${JSON.stringify({ kind: 'region', identifier: 'employee', pageId: 3 })}\n`);
    const r = run([
      '--export', REFERENCE_FIXTURE,
      '--baseline', REFERENCE_FIXTURE,
      '--tests', join(tmpDir, 'tests'),
      '--docs', join(tmpDir, 'docs'),
      '--report', reportPath,
      '--touch-log', touchLogPath,
    ]);
    expect(r.status, r.stderr).toBe(0);
    const report = JSON.parse(readFileSync(reportPath, 'utf8'));
    expect(report.coverage.included).toBe(true);
    expect(report.coverage.report.touchCount).toBe(1);
    expect(r.stdout).toMatch(/coverage: items \d+\/\d+/);
  });
});

describe('apx-onboard CLI -- SQLcl opt-in (PATH hermetically emptied for this suite)', () => {
  it('--sqlcl with no explicit path and no sql on PATH: exit code 1, clear actionable stderr, no report written', () => {
    // Real CI failure caught here: spawnSync inherits the parent's real
    // PATH by default, and at least one hosted CI runner has SOMETHING
    // literally named `sql` on it (confirmed: resolveSqlclExecutable found
    // a candidate there, so this test's "no sql on PATH" precondition
    // silently didn't hold, and the whole point of the assertion -- that
    // resolution failure produces a specific, actionable message -- went
    // untested). Point PATH at this test's own freshly-created, guaranteed-
    // empty tmpDir instead of trusting the ambient host environment.
    const reportPath = join(tmpDir, 'report.json');
    const r = run(
      [
        '--export', REFERENCE_FIXTURE,
        '--tests', join(tmpDir, 'tests'),
        '--docs', join(tmpDir, 'docs'),
        '--report', reportPath,
        '--sqlcl',
      ],
      { ...process.env, PATH: tmpDir },
    );
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/no SQLcl executable could be resolved/);
    expect(existsSync(reportPath)).toBe(false);
  });

  it('--sqlcl=<nonexistent explicit path>: exit code 1, error names the explicit path', () => {
    const reportPath = join(tmpDir, 'report.json');
    const r = run([
      '--export', REFERENCE_FIXTURE,
      '--tests', join(tmpDir, 'tests'),
      '--docs', join(tmpDir, 'docs'),
      '--report', reportPath,
      '--sqlcl=/opt/does-not-exist/sql',
    ]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('/opt/does-not-exist/sql');
    expect(existsSync(reportPath)).toBe(false);
  });
});
