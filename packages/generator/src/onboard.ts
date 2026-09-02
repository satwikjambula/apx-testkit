/**
 * apx-onboard -- one shared, deterministic orchestration function for
 * "I just got a brand-new (usually AI-generated) APEXlang export; what do
 * I do with it?" Both the `apx-onboard` CLI (`onboard-cli.ts`) and the
 * `onboard_generated_apex_app` MCP tool (`packages/mcp/src/server.ts`)
 * call `runOnboarding()` directly -- this is the ONE implementation, per
 * this project's `apx-report`/`apx-diff` precedent for keeping a CLI and
 * an MCP tool backed by a single source of truth (see
 * `docs/ecosystem-roadmap.md` "Seventeenth round").
 *
 * This module performs NO new analysis of its own beyond the SQLcl
 * command construction/resolution below. Every report section is
 * composed, verbatim or near-verbatim, from an already-real,
 * already-deterministic `@apx/testgen` function:
 *   - parser warnings / unmodeled components: `parseApp(loadApexlangExport(...))`
 *     (same call `report.ts`'s `computeReport()` already makes for the
 *     same reason -- see that module's doc comment).
 *   - test generation: `generate()` (`lib.ts`), including the structural
 *     `GenerateResult.pages` diagnostics added specifically for this
 *     feature (see `lib.ts`'s doc comment on that field).
 *   - flow map: `computeFlowMap()` (`flow.ts`).
 *   - docs: `generateDocs()` (`docs.ts`).
 *   - diff: `computeDiff()` (`diff.ts`) -- only when a baseline export is
 *     given.
 *   - coverage: `computeCoverage()` (`coverage.ts`) -- only when a
 *     baseline export AND an existing touch log are both given.
 *
 * BASELINE/NO-BASELINE ORCHESTRATION -- the corrected sequencing from
 * `docs/ecosystem-roadmap.md`'s Seventeenth round ("What would change
 * this verdict"), now the functional spec rather than a revisit trigger:
 *   - No baseline given (first-ever generation): inspect/parse ->
 *     generate() -> flow map -> docs. No diff (nothing to diff against),
 *     no coverage (no test run has happened yet -- see below).
 *   - Baseline given: the no-baseline sequence, PLUS a diff against the
 *     baseline export. Coverage is included ONLY when `touchLogPath` is
 *     given AND that file already exists (it can only exist after the
 *     GENERATED suite has actually been run once with
 *     `APX_COVERAGE_LOG` set -- `apx-onboard` itself never runs
 *     Playwright). Every other combination gets an explicit, specific
 *     note in the report explaining why coverage is absent -- never a
 *     silent omission, per this project's "real evidence only, no
 *     guessing" discipline.
 *
 * SQLcl VALIDATION -- opt-in, per the maintainer's explicit override of
 * this feature's Product Architect review (see the Seventeenth round's
 * override note). OFF by default: nothing in the default path depends on
 * SQLcl being installed. When requested (`sqlcl` option set), the SQLcl
 * executable is resolved (explicit path, or searched on PATH) and
 * `apex validate` is run with the export directory as SQLcl's working
 * directory -- confirmed against Oracle's live SQLcl 26.1 documentation
 * for this pass (Chapter 12.1, "validate":
 * "Syntax: apex validate [options]" / "-input <input> {PATH} -- ...This
 * can be a directory, a zip file, or a single APEXlang file..."; also
 * confirmed via Chapter 7.2 "Commands Overview": "validate -- Compiles
 * and validates APEXlang source files", and that validate "does not
 * require a database connection"). See `docs/quirks/26.1.json`
 * `sqlcl-apex-validate-command-shape` for the full evidence citation,
 * including what is NOT independently live-verified here (invoking a
 * real `sql` binary was not possible in this environment -- see that
 * entry and `resolveSqlclExecutable()`'s doc comment below). The command
 * is run non-interactively via a temporary `.sql` script (`sql /nolog
 * @<script>`), matching SQLcl's documented `[start]` invocation syntax --
 * see `runSqlclValidation()`'s doc comment for the full correction
 * history (an earlier version of this code passed the command as bare
 * trailing argv, which is not a documented shape).
 * If `--sqlcl` is requested but no executable can be resolved, or
 * resolved but not invocable, `runOnboarding()` THROWS -- this must fail
 * the whole run with a non-zero exit code, never a silent skip or a
 * warning buried in the report (the maintainer's explicit,
 * non-negotiable requirement).
 *
 * DETERMINISM: same inputs (export dir, baseline dir, touch log path,
 * and -- for SQLcl -- the same injected `execFn`/environment) ->
 * byte-identical `OnboardingReport` JSON, every time. No timestamps, no
 * random ids, no unstable ordering beyond what the composed functions
 * above already guarantee.
 */
import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { loadApexlangExport, parseApp, type ParseIssue } from '@apx/parser';
import { generate, type GenerateResult, type PageGenerationDiagnostics } from './lib.js';
import { computeFlowMap, type FlowMap } from './flow.js';
import { generateDocs, type DocsGenerateResult } from './docs.js';
import { computeDiff, type DiffReport } from './diff.js';
import { computeCoverage, type CoverageReport } from './coverage.js';

// ---------------------------------------------------------------------------
// Export directory validation -- same checks/messages every other CLI/MCP
// tool in this project already makes (flow-cli.ts/docs-cli.ts/
// packages/mcp/src/server.ts's checkExportDir) before doing any real work.
// ---------------------------------------------------------------------------

function checkExportDir(dir: string, label: string): string | null {
  if (!existsSync(dir)) return `${label} directory not found: ${dir}`;
  if (!statSync(dir).isDirectory()) return `${label}: not a directory: ${dir}`;
  if (!existsSync(join(dir, 'pages'))) {
    return `${label}: no pages/ subdirectory in ${dir} -- is this an unzipped APEXlang export root?`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// SQLcl validation -- opt-in, injectable for deterministic testing.
// ---------------------------------------------------------------------------

export interface SqlclExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

/**
 * Invokes `executablePath` with `args` and resolves with its exit code +
 * captured output -- even for a NONZERO exit code (a failed `apex
 * validate` run is a normal, reportable outcome, not an invocation
 * failure). Only rejects when the process could not be spawned at all
 * (`ENOENT`/`EACCES`/etc. -- Node reports these via a string `error.code`,
 * never a number, which is how this distinguishes "ran and failed" from
 * "never ran").
 */
export interface SqlclExecOptions {
  cwd: string;
}

export const defaultSqlclExecFn: SqlclExecFn = (executablePath, args, options) =>
  new Promise((resolvePromise, reject) => {
    execFile(executablePath, args as string[], { cwd: options?.cwd, maxBuffer: 20 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        const code = (error as NodeJS.ErrnoException & { code?: number | string }).code;
        if (typeof code !== 'number') {
          reject(error);
          return;
        }
        resolvePromise({ code, stdout: stdout.toString(), stderr: stderr.toString() });
        return;
      }
      resolvePromise({ code: 0, stdout: stdout.toString(), stderr: stderr.toString() });
    });
  });

export type SqlclExecFn = (
  executablePath: string,
  args: readonly string[],
  options?: Readonly<SqlclExecOptions>,
) => Promise<SqlclExecResult>;

export interface SqlclOption {
  /** Explicit executable path from `--sqlcl=<path>`. When absent, PATH is searched. */
  executablePath?: string;
}

/** Injectable seams for deterministic testing -- see this module's doc
 * comment's "SQLcl VALIDATION" section and `.ai/checklists/runtime-api.md`'s
 * "mock external processes, don't assume tooling availability" convention. */
export interface OnboardRuntimeDeps {
  execFn?: SqlclExecFn;
  pathEnv?: string;
  platform?: NodeJS.Platform;
  existsFn?: (path: string) => boolean;
}

/**
 * Resolves the SQLcl executable. An explicit `--sqlcl=<path>` is used
 * verbatim -- existence-checked only, never searched further (an explicit
 * path is a deliberate override, not a hint). Otherwise every directory
 * on `PATH` is searched, in order, for a platform-appropriate executable
 * name (`sql` on POSIX; `sql.exe` only on Windows -- see the `names`
 * assignment below for why `.cmd`/`.bat` are deliberately excluded).
 * Returns `null` when nothing resolves -- the caller turns
 * that into a hard failure, never a silent skip.
 */
export function resolveSqlclExecutable(
  option: SqlclOption,
  deps: Pick<OnboardRuntimeDeps, 'pathEnv' | 'platform' | 'existsFn'> = {},
): string | null {
  const existsFn = deps.existsFn ?? existsSync;
  if (option.executablePath) {
    return existsFn(option.executablePath) ? option.executablePath : null;
  }
  const platform = deps.platform ?? process.platform;
  const pathEnv = deps.pathEnv ?? process.env.PATH ?? '';
  const isWindows = platform === 'win32';
  const separator = isWindows ? ';' : ':';
  const dirSeparator = isWindows ? '\\' : '/';
  // sql.exe only on Windows -- NOT sql.cmd/sql.bat. node:child_process's
  // execFile() cannot run a .cmd/.bat file directly (Node's own docs:
  // "On Windows, .bat and .cmd files cannot be executed with... execFile()
  // directly"); the workaround (spawning through cmd.exe, or execFile with
  // shell:true) introduces batch-file argument-quoting hazards this project
  // isn't taking on for an optional validation step. NOTE: this limitation
  // is inherent to execFile()/the file type, not to PATH search specifically
  // -- runSqlclValidation() rejects an explicit `--sqlcl=<path>` pointing
  // at a .cmd/.bat launcher with a targeted error before resolution.
  // Current SQLcl Windows
  // distributions ship sql.exe as the real launcher, so this is expected
  // to be a non-issue in practice; documented honestly rather than implying
  // a workaround that doesn't actually exist.
  const names = isWindows ? ['sql.exe'] : ['sql'];
  for (const dir of pathEnv.split(separator).filter((d) => d.length > 0)) {
    for (const name of names) {
      // Deliberately NOT node:path's join()/sep -- those reflect the HOST
      // OS the test runner happens to execute on, not the `platform`
      // being simulated here (win32 PATH entries use backslashes even
      // when this code itself runs on a POSIX CI runner).
      const candidate = dir.endsWith(dirSeparator) ? `${dir}${name}` : `${dir}${dirSeparator}${name}`;
      if (existsFn(candidate)) return candidate;
    }
  }
  return null;
}

export interface SqlclValidationSection {
  requested: boolean;
  executablePath: string | null;
  /** Normalized argv, executable included. The random temporary script path is represented by `@<sqlcl-validation-script>`. `null` when `requested` is `false`. */
  command: string[] | null;
  exitCode: number | null;
  passed: boolean | null;
  stdout: string | null;
  stderr: string | null;
}

// Object.freeze() -- this exact object is returned to every caller that
// doesn't request SQLcl validation. In a long-lived process (the MCP
// server handles many onboarding requests without restarting), a shared
// mutable singleton returned by reference would let one consumer's
// mutation corrupt every other run's report. Frozen, not just documented
// as read-only, so a mutation attempt throws (strict mode) or silently
// no-ops rather than actually corrupting state.
const SQLCL_NOT_REQUESTED: SqlclValidationSection = Object.freeze({
  requested: false,
  executablePath: null,
  command: null,
  exitCode: null,
  passed: null,
  stdout: null,
  stderr: null,
});

/**
 * CORRECTED (review feedback, 2026-08-27): the prior version of this
 * function passed `apex validate -input <dir>` as trailing argv to the
 * `sql` launcher directly (`sql /nolog apex validate -input <dir>`) --
 * NOT a documented SQLcl invocation shape. Verified fresh against Oracle's
 * own docs: the `SQL` command-line syntax is `SQL [[option] [logon |
 * /NOLOG] [start]]`, where `start` is `@{url|file_name[.ext]} [arg...]` --
 * an "at-sign followed by a script reference," never a bare trailing
 * command. Oracle's own APEXlang-validation walkthrough shows `apex
 * validate -input <path>` typed at the interactive `SQL>` prompt after
 * SQLcl has already started (`docs.oracle.com/.../using-sqlcl-apexlang.html`,
 * "Validating an APEXlang Application with SQLcl") -- not passed on SQLcl's
 * own command line. `/nolog`'s "skip database connection" scope is
 * unaffected by this fix -- it still governs the SQLcl session itself, not
 * the script mechanism. See `docs/quirks/26.1.json`
 * `sqlcl-apex-validate-command-shape` for the full, updated citation
 * (including what remains unverified: no real `sql` binary was available
 * in this environment to independently confirm end-to-end exit-code
 * behavior).
 *
 * Fix: run SQLcl with the already-resolved export directory as its working
 * directory and write `apex validate` (plus `exit`, so the session
 * terminates and returns control rather than sitting at an interactive
 * prompt) to a temporary `.sql` script. Oracle 26.1 explicitly documents
 * that omitting `-input` validates the current directory. This avoids
 * interpolating a user-controlled filesystem path into SQLcl source, so
 * spaces and newlines cannot corrupt or inject script commands. Invoke
 * `sql /nolog @<scriptPath>` -- exactly the documented `[start]` shape.
 * The script's location is a real, securely-generated temp directory (`mkdtempSync`,
 * avoiding the predictable-path/symlink risk of a fixed temp filename in
 * a shared writable directory) and is always removed afterward, including
 * on failure.
 *
 * DETERMINISM NOTE: the temp script's path is randomly generated per run
 * (by design, for the reason above) and therefore is NOT itself
 * reproducible across runs -- `SqlclValidationSection.command` reports a
 * NORMALIZED form (`'@<sqlcl-validation-script>'` in place of the literal
 * path) so the overall `OnboardingReport` stays byte-identical across
 * runs with the same inputs, per this project's determinism invariant.
 * The literal script path is real internally (needed to actually invoke
 * SQLcl correctly) but is not meaningful information for a report reader,
 * since the file no longer exists by the time the report is read.
 */
const SQLCL_SCRIPT_PLACEHOLDER = '@<sqlcl-validation-script>';

function buildSqlclScriptContents(): string {
  return 'apex validate\nexit\n';
}

/**
 * Oracle 26.1 documents the observable validation contract as follows:
 * successful validation prints `Validation successful`; otherwise errors
 * or warnings are printed. It does NOT document that the extension command
 * controls SQLcl's process exit status, and bare `exit` defaults to SUCCESS.
 * Require both a clean process exit and the documented success marker. Any
 * other output fails closed instead of turning an invalid export into a
 * false-positive pass.
 */
function sqlclValidationPassed(result: SqlclExecResult): boolean {
  if (result.code !== 0) return false;
  const output = `${result.stdout}\n${result.stderr}`;
  return /(?:^|\r?\n)Validation successful\.?(?:\r?\n|$)/i.test(output);
}

async function runSqlclValidation(
  exportDir: string,
  option: SqlclOption,
  deps: OnboardRuntimeDeps,
): Promise<SqlclValidationSection> {
  const platform = deps.platform ?? process.platform;
  if (platform === 'win32' && option.executablePath && /\.(?:cmd|bat)$/i.test(option.executablePath)) {
    throw new Error(
      `apx-onboard: --sqlcl cannot execute the Windows batch launcher '${option.executablePath}'. ` +
        'Pass the SQLcl sql.exe path instead; Node execFile cannot execute .cmd/.bat files directly.',
    );
  }

  const resolvedExecutablePath = resolveSqlclExecutable(option, deps);
  if (!resolvedExecutablePath) {
    const where = option.executablePath
      ? `the explicit --sqlcl path '${option.executablePath}'`
      : 'PATH (searched for sql/sql.exe)';
    throw new Error(
      `apx-onboard: --sqlcl validation was requested but no SQLcl executable could be resolved (looked at ${where}). ` +
        'Install SQLcl (https://www.oracle.com/database/sqldeveloper/technologies/sqlcl/) and either add it to PATH ' +
        'or pass --sqlcl=<path-to-sql-executable>. Validation was explicitly requested and could not run -- this is ' +
      'a hard failure of the whole apx-onboard run, not a skipped step.',
    );
  }
  // Child-process executable lookup happens relative to `cwd`. Normalize
  // before switching cwd to the export directory so an explicit relative
  // path such as `./tools/sql` keeps referring to the caller's directory.
  const executablePath = resolve(resolvedExecutablePath);

  // Real filesystem, not an injectable seam -- this is a tiny, local,
  // side-effect-free temp-file write, not the external SQLcl process this
  // project's "mock external processes" convention targets (only the
  // actual `execFn` subprocess call below is mocked in tests).
  const scriptDir = mkdtempSync(join(tmpdir(), 'apx-onboard-sqlcl-'));
  const scriptPath = join(scriptDir, 'apx-onboard-validate.sql');
  try {
    writeFileSync(scriptPath, buildSqlclScriptContents(), 'utf8');
    const args = ['/nolog', `@${scriptPath}`];
    const execFn = deps.execFn ?? defaultSqlclExecFn;
    let result: SqlclExecResult;
    try {
      result = await execFn(executablePath, args, { cwd: exportDir });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(
        `apx-onboard: --sqlcl validation was requested and an executable was found at ${executablePath}, but ` +
          `invoking it failed (could not spawn the process): ${message}`,
      );
    }
    return {
      requested: true,
      executablePath,
      command: [executablePath, '/nolog', SQLCL_SCRIPT_PLACEHOLDER],
      exitCode: result.code,
      passed: sqlclValidationPassed(result),
      stdout: result.stdout,
      stderr: result.stderr,
    };
  } finally {
    rmSync(scriptDir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Diff / coverage sections -- explicit inclusion/omission, never silent.
// ---------------------------------------------------------------------------

export interface DiffSection {
  included: boolean;
  note: string | null;
  report: DiffReport | null;
}

export interface CoverageSection {
  included: boolean;
  note: string | null;
  report: CoverageReport | null;
}

export const NO_BASELINE_DIFF_NOTE =
  'Diff omitted: no --baseline given (first-ever onboarding of this export) -- there is no prior export to compare against.';

export const NO_BASELINE_COVERAGE_NOTE =
  'Coverage omitted: this is a first-ever (no --baseline) onboarding run, and the generated suite has not been run yet.';

export const NO_TOUCH_LOG_GIVEN_COVERAGE_NOTE_PREFIX =
  'Coverage requires running the generated suite first with APX_COVERAGE_LOG set to a touch log path, then re-run apx-onboard with --touch-log';

export function touchLogMissingCoverageNote(touchLogPath: string): string {
  return `Coverage requires running the generated suite first with APX_COVERAGE_LOG set to ${touchLogPath}.`;
}

// ---------------------------------------------------------------------------
// Live-verification-requirements -- derived from THIS run's real,
// already-collected diagnostics, never a separately-authored checklist.
// ---------------------------------------------------------------------------

function buildLiveVerificationRequirements(input: {
  parserWarnings: readonly ParseIssue[];
  unmodeledComponents: readonly string[];
  pages: readonly PageGenerationDiagnostics[];
}): string[] {
  const requirements: string[] = [];

  for (const w of input.parserWarnings) {
    requirements.push(`Parser warning at ${w.loc.file}:${w.loc.line} -- ${w.message} -- review before trusting generated output for this construct.`);
  }

  for (const type of [...input.unmodeledComponents].sort()) {
    requirements.push(
      `Component type '${type}' was seen in this export but is not yet modeled by the typed AST -- no assertion was generated for it; verify it manually.`,
    );
  }

  for (const page of input.pages) {
    if (page.notAutoRoutable) {
      for (const reason of page.notAutoRoutableReasons) {
        requirements.push(`Page ${page.pageId} (${page.alias ?? 'no alias'}) is not auto-routable: ${reason}`);
      }
    }
    for (const region of page.skippedRegions) {
      requirements.push(
        `Page ${page.pageId} (${page.alias ?? 'no alias'}), region '${region.identifier}' (type: ${region.type ?? 'untyped'}): no auto-generated assertion (${region.reason}) -- verify manually or live-verify a runtime wrapper for this region type.`,
      );
    }
  }

  return requirements;
}

// ---------------------------------------------------------------------------
// Public report shape.
// ---------------------------------------------------------------------------

export interface OnboardGenerateSection {
  generated: number;
  skippedAuth: number;
  outDir: string;
  files: string[];
  pages: PageGenerationDiagnostics[];
}

export interface OnboardDocsSection {
  generated: number;
  outDir: string;
  indexFile: string;
  files: string[];
}

export interface OnboardingReport {
  onboardVersion: '0.1.0';
  exportDir: string;
  baselineExportDir: string | null;
  touchLogPath: string | null;
  parserWarnings: ParseIssue[];
  unmodeledComponents: string[];
  generate: OnboardGenerateSection;
  flowMap: FlowMap;
  docs: OnboardDocsSection;
  diff: DiffSection;
  coverage: CoverageSection;
  sqlcl: SqlclValidationSection;
  liveVerificationRequirements: string[];
}

export interface OnboardOptions {
  exportDir: string;
  /** Baseline (prior) export directory. Enables the diff section and (given a usable touch log) the coverage section. */
  baselineExportDir?: string;
  testsOutDir: string;
  docsOutDir: string;
  /** Path to a touch log written by @apx/testkit's coverage recorder during a prior run of the GENERATED suite. */
  touchLogPath?: string;
  /** When set, opt in to SQLcl `apex validate` with `exportDir` as its working directory. Absent = SQLcl is never invoked, never required. */
  sqlcl?: SqlclOption;
}

/**
 * The one shared onboarding orchestration function -- see this module's
 * top doc comment. Async only because of the optional SQLcl subprocess
 * step; every other step is synchronous, pure composition of already-real
 * `@apx/testgen` functions.
 */
export async function runOnboarding(
  options: OnboardOptions,
  deps: OnboardRuntimeDeps = {},
): Promise<OnboardingReport> {
  const exportDir = resolve(options.exportDir);
  const exportProblem = checkExportDir(exportDir, 'Export');
  if (exportProblem) throw new Error(exportProblem);

  let baselineExportDir: string | null = null;
  if (options.baselineExportDir) {
    baselineExportDir = resolve(options.baselineExportDir);
    const baselineProblem = checkExportDir(baselineExportDir, 'Baseline export');
    if (baselineProblem) throw new Error(baselineProblem);
  }

  // Parse and enforce the APEXlang 26.1 manifest before invoking any
  // external tool. This is read-only and preserves the approved pipeline:
  // manifest/version gate -> inspect/parse -> optional SQLcl -> outputs.
  const parsed = parseApp(loadApexlangExport(exportDir));
  const parserWarnings = parsed.warnings;
  const unmodeledComponents = [...parsed.ast.unmodeled].sort();
  if (baselineExportDir) {
    // Fail before SQLcl or generated output when the baseline itself is
    // missing its manifest, targets an unsupported APEX version, or cannot
    // be parsed. computeDiff() loads it again later; this early read is the
    // side-effect-free acceptance gate that keeps failures atomic.
    parseApp(loadApexlangExport(baselineExportDir));
  }

  // CORRECTED (review feedback, 2026-08-27): SQLcl validation runs after
  // the read-only manifest/parser gate but before generate()/generateDocs()
  // write anything to disk. The
  // prior ordering ran validation LAST -- if it was requested and then
  // failed/couldn't be invoked, runOnboarding() threw with test and doc
  // files already written to options.testsOutDir/docsOutDir and no report
  // ever produced to explain why they're there. SQLcl validation depends
  // on nothing computed below (only the export directory itself), so
  // moving it first is a pure reordering, not a behavior change to what
  // gets validated -- it just fails BEFORE any output exists instead of
  // after some of it does.
  const sqlcl = options.sqlcl ? await runSqlclValidation(exportDir, options.sqlcl, deps) : SQLCL_NOT_REQUESTED;

  const generateResult: GenerateResult = generate(exportDir, options.testsOutDir);
  const flowMap = computeFlowMap(exportDir);
  const docsResult: DocsGenerateResult = generateDocs(exportDir, options.docsOutDir);

  const diff: DiffSection = baselineExportDir
    ? { included: true, note: null, report: computeDiff(baselineExportDir, exportDir) }
    : { included: false, note: NO_BASELINE_DIFF_NOTE, report: null };

  const touchLogPath = options.touchLogPath ? resolve(options.touchLogPath) : null;
  let coverage: CoverageSection;
  if (!baselineExportDir) {
    coverage = { included: false, note: NO_BASELINE_COVERAGE_NOTE, report: null };
  } else if (!touchLogPath) {
    coverage = {
      included: false,
      note: `${NO_TOUCH_LOG_GIVEN_COVERAGE_NOTE_PREFIX} <path>.`,
      report: null,
    };
  } else if (!existsSync(touchLogPath)) {
    coverage = { included: false, note: touchLogMissingCoverageNote(touchLogPath), report: null };
  } else {
    coverage = { included: true, note: null, report: computeCoverage(exportDir, touchLogPath) };
  }

  const liveVerificationRequirements = buildLiveVerificationRequirements({
    parserWarnings,
    unmodeledComponents,
    pages: generateResult.pages,
  });

  return {
    onboardVersion: '0.1.0',
    exportDir,
    baselineExportDir,
    touchLogPath,
    parserWarnings,
    unmodeledComponents,
    generate: {
      generated: generateResult.generated,
      skippedAuth: generateResult.skippedAuth,
      outDir: generateResult.outDir,
      files: generateResult.files,
      pages: generateResult.pages,
    },
    flowMap,
    docs: {
      generated: docsResult.generated,
      outDir: docsResult.outDir,
      indexFile: docsResult.indexFile,
      files: docsResult.files,
    },
    diff,
    coverage,
    sqlcl,
    liveVerificationRequirements,
  };
}
