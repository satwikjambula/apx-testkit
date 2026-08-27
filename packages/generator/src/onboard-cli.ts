#!/usr/bin/env node
/**
 * apx-onboard -- CLI wrapper around `runOnboarding()` (onboard.ts). See
 * that module's doc comment for the full orchestration contract
 * (baseline/no-baseline sequencing, SQLcl opt-in behavior, report shape).
 * This file contains NO orchestration logic of its own -- argument
 * parsing, usage text, writing the report to disk, and a human-readable
 * console summary only, matching every other `*-cli.ts` entrypoint in
 * this package.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { runOnboarding, type SqlclOption } from './onboard.js';

const args = process.argv.slice(2);

function flagValue(name: string): string | undefined {
  const idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1] : undefined;
}

function usage(): void {
  console.error(
    'Usage: apx-onboard --export <dir> [--baseline <dir>] --tests <outDir> --docs <outDir> --report <path> ' +
      '[--touch-log <path>] [--sqlcl[=<path-to-sqlcl-executable>]]',
  );
  console.error('');
  console.error('  --export <dir>     Required. The APEXlang export root to onboard (must contain pages/).');
  console.error('  --baseline <dir>   Optional. A prior export of the SAME app. Enables the diff section');
  console.error('                     (apx-diff) and, given a --touch-log pointing at an EXISTING file, the');
  console.error('                     coverage section (apx-coverage). Omitted entirely (with a note) otherwise.');
  console.error('  --tests <outDir>   Required. Directory to write generated Playwright .page.ts/.spec.ts files into.');
  console.error('  --docs <outDir>    Required. Directory to write generated Markdown documentation into.');
  console.error('  --report <path>    Required. Path to write the onboarding report JSON to.');
  console.error("  --touch-log <path> Optional. A touch log written by @apx/testkit's coverage recorder during a");
  console.error('                     PRIOR run of the GENERATED suite (APX_COVERAGE_LOG). Only consulted when');
  console.error('                     --baseline is also given -- apx-onboard never runs Playwright itself.');
  console.error('  --sqlcl[=<path>]   Optional, OFF by default. Opt in to SQLcl `apex validate -input <export-dir>`.');
  console.error('                     With no explicit path, PATH is searched for a sql/sql.exe/sql.cmd/sql.bat');
  console.error('                     executable. If SQLcl was requested but cannot be resolved or invoked, the');
  console.error('                     whole run fails (non-zero exit) -- never a silent skip.');
}

const exportDir = flagValue('--export');
const baselineExportDir = flagValue('--baseline');
const testsOutDir = flagValue('--tests');
const docsOutDir = flagValue('--docs');
const reportPath = flagValue('--report');
const touchLogPath = flagValue('--touch-log');

const sqlclFlag = args.find((a) => a === '--sqlcl' || a.startsWith('--sqlcl='));
let sqlcl: SqlclOption | undefined;
if (sqlclFlag) {
  const eq = sqlclFlag.indexOf('=');
  if (eq >= 0) {
    const explicitPath = sqlclFlag.slice(eq + 1);
    if (!explicitPath) {
      console.error('--sqlcl=<path> requires a non-empty path, e.g. --sqlcl=/usr/local/bin/sql');
      process.exit(2);
    }
    sqlcl = { executablePath: explicitPath };
  } else {
    sqlcl = {};
  }
}

if (!exportDir || !testsOutDir || !docsOutDir || !reportPath) {
  usage();
  process.exit(2);
}

try {
  const report = await runOnboarding({
    exportDir,
    baselineExportDir,
    testsOutDir,
    docsOutDir,
    touchLogPath,
    sqlcl,
  });

  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log(`Onboarding report written to ${reportPath}`);
  console.log(`  export:   ${report.exportDir}`);
  console.log(`  baseline: ${report.baselineExportDir ?? '(none -- first-ever generation)'}`);
  console.log(`  parser warnings: ${report.parserWarnings.length}`);
  console.log(`  unmodeled components: ${report.unmodeledComponents.length ? report.unmodeledComponents.join(', ') : '(none)'}`);
  console.log(
    `  generated tests: ${report.generate.generated} page(s) into ${report.generate.outDir} ` +
      `(${report.generate.skippedAuth} require auth)`,
  );
  console.log(`  docs: ${report.docs.generated} page(s) into ${report.docs.outDir}`);
  console.log(`  flow map: ${report.flowMap.nodes.length} node(s), ${report.flowMap.edges.length} edge(s)`);
  if (report.diff.included && report.diff.report) {
    const s = report.diff.report.summary;
    console.log(`  diff: ${s.pagesAdded} added, ${s.pagesRemoved} removed, ${s.pagesChanged} changed, ${s.pagesUnchanged} unchanged`);
  } else {
    console.log(`  diff: not included -- ${report.diff.note}`);
  }
  if (report.coverage.included && report.coverage.report) {
    const c = report.coverage.report.overall;
    console.log(
      `  coverage: items ${c.items.touched}/${c.items.total}, regions ${c.regions.touched}/${c.regions.total}, buttons ${c.buttons.touched}/${c.buttons.total}`,
    );
  } else {
    console.log(`  coverage: not included -- ${report.coverage.note}`);
  }
  if (report.sqlcl.requested) {
    console.log(`  sqlcl validate: ${report.sqlcl.passed ? 'PASSED' : 'FAILED'} (exit code ${report.sqlcl.exitCode}, ${report.sqlcl.executablePath})`);
  } else {
    console.log('  sqlcl validate: not requested (pass --sqlcl to opt in)');
  }
  console.log(`  live-verification requirements: ${report.liveVerificationRequirements.length}`);

  if (report.sqlcl.requested && !report.sqlcl.passed) {
    // A completed-but-failed SQLcl validation is a real, actionable
    // finding -- surface it via the exit code too, not just the report
    // JSON, so this is CI-usable without a second parsing step.
    process.exitCode = 1;
  }
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(message);
  process.exit(1);
}
