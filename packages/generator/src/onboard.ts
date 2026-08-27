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
 * `apex validate -input <exportDir>` is run -- confirmed against Oracle's
 * live SQLcl 26.2 documentation for this pass (Chapter 12.1, "validate":
 * "Syntax: apex validate [options]" / "-input <input> {PATH} -- ...This
 * can be a directory, a zip file, or a single APEXlang file..."; also
 * confirmed via Chapter 7.2 "Commands Overview": "validate -- Compiles
 * and validates APEXlang source files", and that validate "does not
 * require a database connection"). See `docs/quirks/26.1.json`
 * `sqlcl-apex-validate-command-shape` for the full evidence citation,
 * including what is NOT independently live-verified here (invoking a
 * real `sql` binary was not possible in this environment -- see that
 * entry and `resolveSqlclExecutable()`'s doc comment below).
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
import { existsSync, statSync } from 'node:fs';
import { execFile } from 'node:child_process';
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
export const defaultSqlclExecFn: SqlclExecFn = (executablePath, args) =>
  new Promise((resolvePromise, reject) => {
    execFile(executablePath, args as string[], { maxBuffer: 20 * 1024 * 1024 }, (error, stdout, stderr) => {
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

export type SqlclExecFn = (executablePath: string, args: readonly string[]) => Promise<SqlclExecResult>;

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
 * name (`sql` on POSIX; `sql.exe`/`sql.cmd`/`sql.bat` on Windows, since
 * SQLcl ships all three launcher shapes across its Windows distribution
 * history). Returns `null` when nothing resolves -- the caller turns
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
  const names = isWindows ? ['sql.exe', 'sql.cmd', 'sql.bat'] : ['sql'];
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
  /** Full argv, executable included, exactly as invoked -- e.g. `['/usr/local/bin/sql', '/nolog', 'apex', 'validate', '-input', '/path/to/export']`. `null` when `requested` is `false`. */
  command: string[] | null;
  exitCode: number | null;
  passed: boolean | null;
  stdout: string | null;
  stderr: string | null;
}

const SQLCL_NOT_REQUESTED: SqlclValidationSection = {
  requested: false,
  executablePath: null,
  command: null,
  exitCode: null,
  passed: null,
  stdout: null,
  stderr: null,
};

/**
 * `/nolog` skips requiring a database connection -- confirmed appropriate
 * for `validate` specifically (Oracle's docs state "This command does not
 * require a database connection"). Passing the extension command
 * (`apex validate -input <dir>`) as trailing arguments to the `sql`
 * launcher itself, rather than via a script file piped over stdin, is
 * SQLcl's documented one-shot invocation convention for its extension
 * commands (the same convention SQLcl's own Liquibase integration uses
 * for CI/CD one-liners, e.g. `sql /nolog liquibase status`) -- applied
 * here by design. This outer invocation shell was NOT independently
 * reproduced against a real `sql` binary in this pass (none was
 * available in this environment); the `apex validate -input <path>`
 * command/flag shape itself IS independently confirmed directly against
 * Oracle's live SQLcl 26.2 documentation -- see this module's top doc
 * comment and `docs/quirks/26.1.json` `sqlcl-apex-validate-command-shape`
 * for the exact citation and what remains unverified.
 */
function buildSqlclArgs(exportDir: string): string[] {
  return ['/nolog', 'apex', 'validate', '-input', exportDir];
}

async function runSqlclValidation(
  exportDir: string,
  option: SqlclOption,
  deps: OnboardRuntimeDeps,
): Promise<SqlclValidationSection> {
  const executablePath = resolveSqlclExecutable(option, deps);
  if (!executablePath) {
    const where = option.executablePath
      ? `the explicit --sqlcl path '${option.executablePath}'`
      : 'PATH (searched for sql/sql.exe/sql.cmd/sql.bat)';
    throw new Error(
      `apx-onboard: --sqlcl validation was requested but no SQLcl executable could be resolved (looked at ${where}). ` +
        'Install SQLcl (https://www.oracle.com/database/sqldeveloper/technologies/sqlcl/) and either add it to PATH ' +
        'or pass --sqlcl=<path-to-sql-executable>. Validation was explicitly requested and could not run -- this is ' +
        'a hard failure of the whole apx-onboard run, not a skipped step.',
    );
  }
  const args = buildSqlclArgs(exportDir);
  const execFn = deps.execFn ?? defaultSqlclExecFn;
  let result: SqlclExecResult;
  try {
    result = await execFn(executablePath, args);
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
    command: [executablePath, ...args],
    exitCode: result.code,
    passed: result.code === 0,
    stdout: result.stdout,
    stderr: result.stderr,
  };
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
  /** When set, opt in to SQLcl `apex validate -input <exportDir>`. Absent = SQLcl is never invoked, never required. */
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

  // Parser warnings / unmodeled components: same independent parse
  // `report.ts`'s computeReport() already performs for the identical
  // reason (ParseIssue's structured loc is needed verbatim; GenerateResult
  // only carries a pre-stringified form of the same warnings).
  const parsed = parseApp(loadApexlangExport(exportDir));
  const parserWarnings = parsed.warnings;
  const unmodeledComponents = [...parsed.ast.unmodeled].sort();

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

  const sqlcl = options.sqlcl ? await runSqlclValidation(exportDir, options.sqlcl, deps) : SQLCL_NOT_REQUESTED;

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
