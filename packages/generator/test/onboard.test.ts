/**
 * Tests for `packages/generator/src/onboard.ts` -- the shared
 * `runOnboarding()` function both `apx-onboard` (onboard-cli.ts) and
 * `onboard_generated_apex_app` (packages/mcp/src/server.ts) call.
 *
 * Six concerns:
 *   1. No-baseline orchestration (inspect/generate/flow/docs only; diff
 *      and coverage both explicitly omitted with a note).
 *   2. Baseline orchestration (adds diff; coverage gated on an EXISTING
 *      touch log file).
 *   3. Determinism -- same inputs, byte-identical report JSON.
 *   4. Invalid export/baseline directories -- a clear thrown error, no
 *      partial/garbage report.
 *   5. SQLcl opt-in behavior via the injectable execFn/deps seam --
 *      requested-and-passes, requested-and-fails (a real, reportable
 *      validation failure, not a thrown error), requested-and-unresolvable
 *      (a hard failure, per the maintainer's explicit requirement), and
 *      not-requested-at-all. No real `sql`/SQLcl binary is invoked
 *      anywhere in this suite.
 *   6. `resolveSqlclExecutable()` resolution logic in isolation (explicit
 *      path vs. PATH search, POSIX vs. win32 naming).
 *   7. `liveVerificationRequirements` is a real derivation from this same
 *      run's parser warnings / unmodeled components / generation
 *      diagnostics, not a separately-authored static list.
 */
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  NO_BASELINE_COVERAGE_NOTE,
  NO_BASELINE_DIFF_NOTE,
  resolveSqlclExecutable,
  runOnboarding,
  touchLogMissingCoverageNote,
  type SqlclExecFn,
} from '../src/onboard.js';

const FIXTURES_ROOT = join(__dirname, 'fixtures');
const REFERENCE_FIXTURE = join(FIXTURES_ROOT, 'reference-fixtures'); // page 3: EMPLOYEE
const NAV_SAFETY_FIXTURE = join(FIXTURES_ROOT, 'navigation-safety-fixture'); // pages 1-4
const MODAL_DIALOG_FIXTURE = join(FIXTURES_ROOT, 'modal-dialog-fixture'); // pages 1-4

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'apx-onboard-test-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function dirs() {
  return {
    testsOutDir: join(tmpDir, 'tests'),
    docsOutDir: join(tmpDir, 'docs'),
  };
}

// ---------------------------------------------------------------------------
// 1. No-baseline orchestration
// ---------------------------------------------------------------------------

describe('runOnboarding -- no baseline (first-ever generation)', () => {
  it('runs inspect/generate/flow/docs, and explicitly omits diff and coverage with a note', async () => {
    const report = await runOnboarding({ exportDir: REFERENCE_FIXTURE, ...dirs() });

    expect(report.onboardVersion).toBe('0.1.0');
    expect(report.baselineExportDir).toBeNull();
    expect(report.touchLogPath).toBeNull();

    expect(report.parserWarnings).toEqual([]);
    expect(report.unmodeledComponents).toEqual([]);

    expect(report.generate.generated).toBe(1);
    expect(report.generate.files).toContain('p00003-employee.page.ts');
    expect(existsSync(join(report.generate.outDir, 'p00003-employee.spec.ts'))).toBe(true);

    expect(report.docs.generated).toBe(1);
    expect(existsSync(join(report.docs.outDir, 'index.md'))).toBe(true);

    expect(report.flowMap.nodes).toHaveLength(1);

    expect(report.diff).toEqual({ included: false, note: NO_BASELINE_DIFF_NOTE, report: null });
    expect(report.coverage).toEqual({ included: false, note: NO_BASELINE_COVERAGE_NOTE, report: null });

    expect(report.sqlcl.requested).toBe(false);
  });

  it('a --touch-log given WITHOUT --baseline still does not enable coverage (baseline governs coverage eligibility)', async () => {
    const touchLogPath = join(tmpDir, 'touch.jsonl');
    writeFileSync(touchLogPath, `${JSON.stringify({ kind: 'region', identifier: 'employee', pageId: 3 })}\n`);
    const report = await runOnboarding({ exportDir: REFERENCE_FIXTURE, touchLogPath, ...dirs() });
    expect(report.coverage.included).toBe(false);
    expect(report.coverage.note).toBe(NO_BASELINE_COVERAGE_NOTE);
  });
});

// ---------------------------------------------------------------------------
// 2. Baseline orchestration
// ---------------------------------------------------------------------------

describe('runOnboarding -- with baseline', () => {
  it('adds a real diff section against the baseline export', async () => {
    const report = await runOnboarding({
      exportDir: NAV_SAFETY_FIXTURE,
      baselineExportDir: REFERENCE_FIXTURE,
      ...dirs(),
    });
    expect(report.diff.included).toBe(true);
    expect(report.diff.note).toBeNull();
    // Real, live-confirmed evidence (same as packages/mcp/test/server.test.ts):
    // reference-fixtures has only page 3 (EMPLOYEE); navigation-safety-fixture
    // has pages 1-4 (a DIFFERENT page 3) -- 3 added, 1 changed.
    expect(report.diff.report!.summary).toEqual({ pagesAdded: 3, pagesRemoved: 0, pagesChanged: 1, pagesUnchanged: 0 });
  });

  it('baseline given but no --touch-log: coverage omitted with the generic "run the suite first" note', async () => {
    const report = await runOnboarding({
      exportDir: REFERENCE_FIXTURE,
      baselineExportDir: REFERENCE_FIXTURE,
      ...dirs(),
    });
    expect(report.coverage.included).toBe(false);
    expect(report.coverage.note).toMatch(/APX_COVERAGE_LOG/);
    expect(report.coverage.note).toMatch(/--touch-log/);
  });

  it('baseline given, --touch-log given, but the file does not exist yet: coverage omitted with a note naming the path', async () => {
    const touchLogPath = join(tmpDir, 'not-written-yet.jsonl');
    const report = await runOnboarding({
      exportDir: REFERENCE_FIXTURE,
      baselineExportDir: REFERENCE_FIXTURE,
      touchLogPath,
      ...dirs(),
    });
    expect(report.coverage.included).toBe(false);
    expect(report.coverage.note).toBe(touchLogMissingCoverageNote(report.touchLogPath!));
    expect(report.coverage.note).toContain(touchLogPath);
  });

  it('baseline given, --touch-log given, and the file exists: coverage is included with a real CoverageReport', async () => {
    const touchLogPath = join(tmpDir, 'touch.jsonl');
    writeFileSync(touchLogPath, `${JSON.stringify({ kind: 'region', identifier: 'employee', pageId: 3 })}\n`);
    const report = await runOnboarding({
      exportDir: REFERENCE_FIXTURE,
      baselineExportDir: REFERENCE_FIXTURE,
      touchLogPath,
      ...dirs(),
    });
    expect(report.coverage.included).toBe(true);
    expect(report.coverage.note).toBeNull();
    expect(report.coverage.report!.touchCount).toBe(1);
    expect(report.coverage.report!.overall.regions.touched).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// 3. Determinism
// ---------------------------------------------------------------------------

describe('runOnboarding -- determinism', () => {
  it('identical inputs (no SQLcl) produce byte-identical report JSON across two independent runs', async () => {
    const touchLogPath = join(tmpDir, 'touch.jsonl');
    writeFileSync(touchLogPath, `${JSON.stringify({ kind: 'region', identifier: 'employee', pageId: 3 })}\n`);
    const options = {
      exportDir: NAV_SAFETY_FIXTURE,
      baselineExportDir: REFERENCE_FIXTURE,
      touchLogPath,
      testsOutDir: join(tmpDir, 'tests-a'),
      docsOutDir: join(tmpDir, 'docs-a'),
    };
    const optionsB = { ...options, testsOutDir: join(tmpDir, 'tests-b'), docsOutDir: join(tmpDir, 'docs-b') };

    const reportA = await runOnboarding(options);
    const reportB = await runOnboarding(optionsB);

    // outDir/testsOutDir/docsOutDir legitimately differ (different target
    // directories) -- normalize those before the byte-identical comparison,
    // matching how every other determinism test in this project only
    // asserts identical CONTENT, never incidental absolute-path plumbing.
    const normalize = (r: typeof reportA) =>
      JSON.stringify({ ...r, generate: { ...r.generate, outDir: '<out>' }, docs: { ...r.docs, outDir: '<out>' } });

    expect(normalize(reportA)).toBe(normalize(reportB));
  });

  it('a fixed injected execFn also produces a byte-identical sqlcl section across two runs', async () => {
    const execFn: SqlclExecFn = async () => ({ code: 0, stdout: 'Validation successful.\n', stderr: '' });
    const deps = { execFn, existsFn: (p: string) => p === '/opt/sqlcl/bin/sql' };
    const options = {
      exportDir: REFERENCE_FIXTURE,
      testsOutDir: join(tmpDir, 'tests-a'),
      docsOutDir: join(tmpDir, 'docs-a'),
      sqlcl: { executablePath: '/opt/sqlcl/bin/sql' },
    };
    const r1 = await runOnboarding(options, deps);
    const r2 = await runOnboarding(
      { ...options, testsOutDir: join(tmpDir, 'tests-b'), docsOutDir: join(tmpDir, 'docs-b') },
      deps,
    );
    expect(r1.sqlcl).toEqual(r2.sqlcl);
    expect(r1.sqlcl).toEqual({
      requested: true,
      executablePath: '/opt/sqlcl/bin/sql',
      // Normalized, not the literal (randomly-located, per-run) temp
      // script path -- that's the whole point of this determinism test.
      command: ['/opt/sqlcl/bin/sql', '/nolog', '@<sqlcl-validation-script>'],
      exitCode: 0,
      passed: true,
      stdout: 'Validation successful.\n',
      stderr: '',
    });
  });
});

// ---------------------------------------------------------------------------
// 4. Invalid directories
// ---------------------------------------------------------------------------

describe('runOnboarding -- invalid directories', () => {
  it('throws a clear error for a nonexistent export directory', async () => {
    await expect(runOnboarding({ exportDir: '/nonexistent/apx/export', ...dirs() })).rejects.toThrow(
      /Export directory not found/,
    );
  });

  it('throws a clear error for a nonexistent baseline directory, distinct from the export-dir error', async () => {
    await expect(
      runOnboarding({ exportDir: REFERENCE_FIXTURE, baselineExportDir: '/nonexistent/baseline', ...dirs() }),
    ).rejects.toThrow(/Baseline export directory not found/);
  });

  it('throws a clear error when the export directory has no pages/ subdirectory', async () => {
    await expect(runOnboarding({ exportDir: tmpDir, ...dirs() })).rejects.toThrow(/no pages\/ subdirectory/);
  });

  it('rejects an unsupported manifest before invoking requested SQLcl validation', async () => {
    const unsupportedExport = join(tmpDir, 'unsupported-export');
    cpSync(REFERENCE_FIXTURE, unsupportedExport, { recursive: true });
    writeFileSync(
      join(unsupportedExport, '.apex', 'apexlang.json'),
      JSON.stringify({ mmdVersion: '27.1.0' }),
    );
    let sqlclCalled = false;
    const execFn: SqlclExecFn = async () => {
      sqlclCalled = true;
      return { code: 0, stdout: 'Validation successful.\n', stderr: '' };
    };

    await expect(
      runOnboarding(
        {
          exportDir: unsupportedExport,
          sqlcl: { executablePath: '/usr/local/bin/sql' },
          ...dirs(),
        },
        { execFn, existsFn: () => true },
      ),
    ).rejects.toThrow(/verified only for APEX 26\.1/);
    expect(sqlclCalled).toBe(false);
  });

  it('rejects an unsupported baseline before SQLcl or generated output', async () => {
    const unsupportedBaseline = join(tmpDir, 'unsupported-baseline');
    cpSync(REFERENCE_FIXTURE, unsupportedBaseline, { recursive: true });
    writeFileSync(
      join(unsupportedBaseline, '.apex', 'apexlang.json'),
      JSON.stringify({ mmdVersion: '27.1.0' }),
    );
    let sqlclCalled = false;
    const execFn: SqlclExecFn = async () => {
      sqlclCalled = true;
      return { code: 0, stdout: 'Validation successful.\n', stderr: '' };
    };
    const outputDirs = dirs();

    await expect(
      runOnboarding(
        {
          exportDir: REFERENCE_FIXTURE,
          baselineExportDir: unsupportedBaseline,
          sqlcl: { executablePath: '/usr/local/bin/sql' },
          ...outputDirs,
        },
        { execFn, existsFn: () => true },
      ),
    ).rejects.toThrow(/verified only for APEX 26\.1/);
    expect(sqlclCalled).toBe(false);
    expect(existsSync(outputDirs.testsOutDir)).toBe(false);
    expect(existsSync(outputDirs.docsOutDir)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5. SQLcl opt-in behavior
// ---------------------------------------------------------------------------

describe('runOnboarding -- SQLcl opt-in', () => {
  it('not requested at all: sqlcl section reflects requested: false, no execFn ever called', async () => {
    let called = false;
    const execFn: SqlclExecFn = async () => {
      called = true;
      return { code: 0, stdout: '', stderr: '' };
    };
    const report = await runOnboarding({ exportDir: REFERENCE_FIXTURE, ...dirs() }, { execFn });
    expect(report.sqlcl).toEqual({
      requested: false,
      executablePath: null,
      command: null,
      exitCode: null,
      passed: null,
      stdout: null,
      stderr: null,
    });
    expect(called).toBe(false);
  });

  it('requested and succeeds: validates from cwd without interpolating the export path into SQLcl source', async () => {
    const spacedExport = join(tmpDir, 'export with spaces');
    cpSync(REFERENCE_FIXTURE, spacedExport, { recursive: true });
    let scriptPathSeenByExecFn: string | null = null;
    const execFn: SqlclExecFn = async (executablePath, args, options) => {
      expect(executablePath).toBe('/usr/local/bin/sql');
      expect(options?.cwd).toBe(spacedExport);
      // Documented SQL startup syntax: SQL [[option] [logon|/NOLOG] [start]],
      // where start is @{url|file_name}[arg...] -- never a bare trailing
      // command (see onboard.ts's runSqlclValidation doc comment).
      expect(args[0]).toBe('/nolog');
      expect(args[1]).toMatch(/^@/);
      scriptPathSeenByExecFn = args[1].slice(1);
      // The script must be a real, readable file (still exists at the
      // moment execFn runs, before cleanup) containing exactly the
      // documented interactive-prompt command, plus an exit so the
      // session terminates instead of hanging at a prompt.
      expect(readFileSync(scriptPathSeenByExecFn, 'utf8')).toBe('apex validate\nexit\n');
      return { code: 0, stdout: 'Validation successful.\n', stderr: '' };
    };
    const report = await runOnboarding(
      { exportDir: spacedExport, sqlcl: { executablePath: '/usr/local/bin/sql' }, ...dirs() },
      { execFn, existsFn: () => true },
    );
    expect(report.sqlcl).toEqual({
      requested: true,
      executablePath: '/usr/local/bin/sql',
      command: ['/usr/local/bin/sql', '/nolog', '@<sqlcl-validation-script>'],
      exitCode: 0,
      passed: true,
      stdout: 'Validation successful.\n',
      stderr: '',
    });
    // Cleaned up afterward -- no leftover temp script.
    expect(scriptPathSeenByExecFn).not.toBeNull();
    expect(existsSync(scriptPathSeenByExecFn as string)).toBe(false);
  });

  it('normalizes a relative explicit executable before changing the child working directory', async () => {
    const relativeExecutable = './tools/sql';
    const execFn: SqlclExecFn = async (executablePath, _args, options) => {
      expect(executablePath).toBe(resolve(relativeExecutable));
      expect(options?.cwd).toBe(REFERENCE_FIXTURE);
      return { code: 0, stdout: 'Validation successful.\n', stderr: '' };
    };
    const report = await runOnboarding(
      { exportDir: REFERENCE_FIXTURE, sqlcl: { executablePath: relativeExecutable }, ...dirs() },
      { execFn, existsFn: (path) => path === relativeExecutable },
    );
    expect(report.sqlcl.executablePath).toBe(resolve(relativeExecutable));
    expect(report.sqlcl.passed).toBe(true);
  });

  it('rejects an explicit Windows .cmd/.bat launcher with an actionable error', async () => {
    await expect(
      runOnboarding(
        {
          exportDir: REFERENCE_FIXTURE,
          sqlcl: { executablePath: 'C:\\sqlcl\\bin\\sql.cmd' },
          ...dirs(),
        },
        { existsFn: () => true, platform: 'win32' },
      ),
    ).rejects.toThrow(/Pass the SQLcl sql\.exe path instead/);
  });

  it('fails closed when SQLcl reports compile errors but exits successfully', async () => {
    const execFn: SqlclExecFn = async () => ({
      code: 0,
      stdout: 'APEXLang Compile Errors:\nFile: pages/p00003-employee.apx\n',
      stderr: '',
    });
    const report = await runOnboarding(
      { exportDir: REFERENCE_FIXTURE, sqlcl: { executablePath: '/usr/local/bin/sql' }, ...dirs() },
      { execFn, existsFn: () => true },
    );
    expect(report.sqlcl.requested).toBe(true);
    expect(report.sqlcl.passed).toBe(false);
    expect(report.sqlcl.exitCode).toBe(0);
    expect(report.sqlcl.stdout).toContain('APEXLang Compile Errors');
  });

  it('fails closed on a zero exit with no documented success marker', async () => {
    const execFn: SqlclExecFn = async () => ({ code: 0, stdout: 'SQLcl completed.\n', stderr: '' });
    const report = await runOnboarding(
      { exportDir: REFERENCE_FIXTURE, sqlcl: { executablePath: '/usr/local/bin/sql' }, ...dirs() },
      { execFn, existsFn: () => true },
    );
    expect(report.sqlcl.passed).toBe(false);
    expect(report.sqlcl.exitCode).toBe(0);
  });

  it('fails when the process exits nonzero even if output contains the success marker', async () => {
    const execFn: SqlclExecFn = async () => ({ code: 1, stdout: 'Validation successful.\n', stderr: '' });
    const report = await runOnboarding(
      { exportDir: REFERENCE_FIXTURE, sqlcl: { executablePath: '/usr/local/bin/sql' }, ...dirs() },
      { execFn, existsFn: () => true },
    );
    expect(report.sqlcl.passed).toBe(false);
    expect(report.sqlcl.exitCode).toBe(1);
  });

  it('requested but the executable cannot be resolved: the WHOLE run fails (throws), never a silent skip', async () => {
    await expect(
      runOnboarding(
        { exportDir: REFERENCE_FIXTURE, sqlcl: {}, ...dirs() },
        { existsFn: () => false, pathEnv: '/usr/bin:/usr/local/bin' },
      ),
    ).rejects.toThrow(/no SQLcl executable could be resolved/);
  });

  it('requested with an explicit --sqlcl=<path> that does not exist: the whole run fails, names the explicit path', async () => {
    await expect(
      runOnboarding(
        { exportDir: REFERENCE_FIXTURE, sqlcl: { executablePath: '/opt/does-not-exist/sql' }, ...dirs() },
        { existsFn: () => false },
      ),
    ).rejects.toThrow(/\/opt\/does-not-exist\/sql/);
  });

  it('requested, resolved, but the process cannot actually be spawned: the whole run fails with a wrapped, actionable message', async () => {
    const execFn: SqlclExecFn = async () => {
      throw Object.assign(new Error('spawn sql ENOENT'), { code: 'ENOENT' });
    };
    await expect(
      runOnboarding(
        { exportDir: REFERENCE_FIXTURE, sqlcl: { executablePath: '/usr/local/bin/sql' }, ...dirs() },
        { execFn, existsFn: () => true },
      ),
    ).rejects.toThrow(/invoking it failed/);
  });

  it('generation/docs/flow output is still written even when SQLcl validation is requested and fails', async () => {
    const execFn: SqlclExecFn = async () => ({ code: 1, stdout: '', stderr: 'nope' });
    const report = await runOnboarding(
      { exportDir: REFERENCE_FIXTURE, sqlcl: { executablePath: '/usr/local/bin/sql' }, ...dirs() },
      { execFn, existsFn: () => true },
    );
    expect(report.generate.generated).toBe(1);
    expect(existsSync(join(report.generate.outDir, 'p00003-employee.spec.ts'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 6. resolveSqlclExecutable() in isolation
// ---------------------------------------------------------------------------

describe('resolveSqlclExecutable', () => {
  it('an explicit path that exists is returned verbatim, without searching PATH at all', () => {
    const existsFn = (p: string) => p === '/opt/sqlcl/bin/sql';
    expect(resolveSqlclExecutable({ executablePath: '/opt/sqlcl/bin/sql' }, { existsFn })).toBe('/opt/sqlcl/bin/sql');
  });

  it('an explicit path that does not exist resolves to null (never silently falls back to PATH)', () => {
    const existsFn = () => false;
    expect(resolveSqlclExecutable({ executablePath: '/opt/sqlcl/bin/sql' }, { existsFn, pathEnv: '/usr/bin' })).toBeNull();
  });

  it('POSIX: searches each PATH directory in order for a `sql` executable', () => {
    const existsFn = (p: string) => p === '/usr/local/bin/sql';
    const resolved = resolveSqlclExecutable(
      {},
      { existsFn, pathEnv: '/usr/bin:/usr/local/bin:/opt/bin', platform: 'linux' },
    );
    expect(resolved).toBe('/usr/local/bin/sql');
  });

  it('win32: searches for sql.exe only, separated by semicolons', () => {
    const existsFn = (p: string) => p === 'C:\\sqlcl\\bin\\sql.exe';
    const resolved = resolveSqlclExecutable(
      {},
      { existsFn, pathEnv: 'C:\\Windows;C:\\sqlcl\\bin', platform: 'win32' },
    );
    expect(resolved).toBe('C:\\sqlcl\\bin\\sql.exe');
  });

  it('win32: does NOT resolve a .cmd/.bat launcher via PATH search -- execFile() cannot run one directly', () => {
    // Real bug this guards against: a .cmd/.bat file existing on PATH must
    // never be silently "found" here, since invoking it via execFile()
    // later would fail in a way this project doesn't attempt to work
    // around (see resolveSqlclExecutable's own doc comment).
    const existsFn = (p: string) => p === 'C:\\sqlcl\\bin\\sql.cmd' || p === 'C:\\sqlcl\\bin\\sql.bat';
    const resolved = resolveSqlclExecutable(
      {},
      { existsFn, pathEnv: 'C:\\Windows;C:\\sqlcl\\bin', platform: 'win32' },
    );
    expect(resolved).toBeNull();
  });

  it('returns null when PATH is empty/unset and no explicit path is given', () => {
    expect(resolveSqlclExecutable({}, { existsFn: () => false, pathEnv: '' })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 7. liveVerificationRequirements is a real derivation, not a static list
// ---------------------------------------------------------------------------

describe('runOnboarding -- liveVerificationRequirements derivation', () => {
  it('includes an entry for the region with no verified DOM convention (reference-fixtures\' form region)', async () => {
    const report = await runOnboarding({ exportDir: REFERENCE_FIXTURE, ...dirs() });
    expect(
      report.liveVerificationRequirements.some(
        (r) => r.includes("region 'employee'") && r.includes('no-verified-dom-convention'),
      ),
    ).toBe(true);
  });

  it('includes an entry per not-auto-routable page, quoting the real reason string', async () => {
    const report = await runOnboarding({ exportDir: MODAL_DIALOG_FIXTURE, ...dirs() });
    const modalRequirement = report.liveVerificationRequirements.find((r) => r.includes('Page 1'));
    expect(modalRequirement).toBeTruthy();
    expect(modalRequirement).toContain('modalDialog requires parent-page navigation');
  });

  it('is empty for an export with nothing to flag', async () => {
    // reference-fixtures DOES have one skipped 'form' region, so use it to
    // confirm the requirement count matches exactly (1, not 0 and not more)
    // rather than asserting emptiness on a fixture that isn't actually clean.
    const report = await runOnboarding({ exportDir: REFERENCE_FIXTURE, ...dirs() });
    expect(report.liveVerificationRequirements).toHaveLength(1);
  });
});
