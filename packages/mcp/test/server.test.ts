/**
 * Tests for `packages/mcp/src/server.ts` -- the MCP stdio server exposing
 * `@apx/testgen`'s deterministic CLIs (six pre-existing, plus
 * `onboard_generated_apex_app`/`apx-onboard`) as agent-callable tools.
 *
 * Talks to a real `McpServer` (via `createServer()`) over
 * `InMemoryTransport.createLinkedPair()` and a real `Client`, exactly the
 * pattern `@modelcontextprotocol/sdk` itself documents for testing a
 * server without a real stdio subprocess (`node_modules/
 * @modelcontextprotocol/sdk/dist/esm/inMemory.d.ts`) -- confirmed live
 * against the built `dist/server.js` before this suite was written (every
 * assertion below was independently reproduced against a real running
 * server first, not derived from reading the source alone).
 *
 * Six concerns, matching the maintainer's explicit review list (plus a
 * seventh describe block below covering `onboard_generated_apex_app`
 * specifically -- baseline vs. no-baseline behavior, error propagation --
 * per the apx-onboard feature's own explicit test requirements):
 *   1. Tool registration -- all documented tools discoverable via `listTools()`.
 *   2. Input validation -- malformed/missing input rejected clearly, per tool.
 *   3. Invalid export path handling -- graceful (`isError: true`), never a
 *      thrown/rejected `callTool()` and never a crashed server.
 *   4. Successful execution for each tool against a real, already-committed
 *      export fixture (`packages/generator/test/fixtures/*`), with
 *      assertions on the REAL shape the underlying `@apx/testgen` library
 *      function produces (not a hand-invented shape).
 *   5. Generation failure paths -- a real fs failure (`outDir` colliding
 *      with an existing regular file) surfaces as `isError: true`, not a
 *      crash.
 *   6. JSON output shape validation for the three structured-output tools
 *      (`generate_flow_map`, `diff_apex_exports`, `analyze_coverage`).
 *
 * A malformed-but-parseable export (garbage `.apx` content) is also
 * covered separately -- `@apx/parser` is warning-based, not throw-based,
 * for unrecognized content (confirmed live: garbage text in a `.apx` file
 * produces a `warnings` entry, not a thrown error), so "malformed export"
 * and "invalid path" are genuinely different failure modes and are tested
 * as such.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createServer } from '../src/server.js';

// Real, already-committed export fixtures -- never invented data. See
// `.ai/knowledge/verification.md`'s "real export parsing" evidence source.
const FIXTURES_ROOT = join(__dirname, '..', '..', 'generator', 'test', 'fixtures');
const REFERENCE_FIXTURE = join(FIXTURES_ROOT, 'reference-fixtures'); // single page: 3/EMPLOYEE
const NAV_SAFETY_FIXTURE = join(FIXTURES_ROOT, 'navigation-safety-fixture'); // pages 1, 2, 3

const TOOL_NAMES = [
  'inspect_apex_export',
  'generate_apex_tests',
  'generate_flow_map',
  'diff_apex_exports',
  'analyze_coverage',
  'generate_apex_docs',
  'onboard_generated_apex_app',
] as const;

interface ToolTextContent {
  type: 'text';
  text: string;
}

interface ToolResult {
  content: ToolTextContent[];
  isError?: boolean;
}

let server: McpServer;
let client: Client;
let tmpDir: string;

beforeEach(async () => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  server = createServer();
  client = new Client({ name: 'apx-mcp-test-client', version: '0.0.1' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  tmpDir = mkdtempSync(join(tmpdir(), 'apx-mcp-test-'));
});

afterEach(async () => {
  await client.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

async function callTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  return (await client.callTool({ name, arguments: args })) as unknown as ToolResult;
}

function firstText(result: ToolResult): string {
  return result.content[0]?.text ?? '';
}

// ---------------------------------------------------------------------------
// 1. Tool registration
// ---------------------------------------------------------------------------

describe('tool registration', () => {
  it('exposes exactly the seven documented tools, no more, no fewer', async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual([...TOOL_NAMES].sort());
  });

  it('every tool has a non-trivial description and an object input schema', async () => {
    const { tools } = await client.listTools();
    for (const tool of tools) {
      expect(tool.description, `${tool.name} description`).toBeTruthy();
      expect(tool.description!.length, `${tool.name} description length`).toBeGreaterThan(20);
      expect(tool.inputSchema.type, `${tool.name} inputSchema.type`).toBe('object');
    }
  });

  it('exportDir-taking tools all require exportDir as a string property', async () => {
    const { tools } = await client.listTools();
    for (const name of ['inspect_apex_export', 'generate_flow_map', 'analyze_coverage', 'generate_apex_docs', 'onboard_generated_apex_app']) {
      const tool = tools.find((t) => t.name === name)!;
      const props = tool.inputSchema.properties as Record<string, { type?: string }>;
      expect(props.exportDir?.type, `${name} exportDir type`).toBe('string');
      expect(tool.inputSchema.required, `${name} required`).toContain('exportDir');
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Input validation (malformed/missing input, per tool)
// ---------------------------------------------------------------------------

describe('input validation', () => {
  it('inspect_apex_export rejects a call with no exportDir', async () => {
    const r = await callTool('inspect_apex_export', {});
    expect(r.isError).toBe(true);
    expect(firstText(r)).toMatch(/exportDir|Required|invalid_type/i);
  });

  it('generate_apex_tests rejects a call missing outDir', async () => {
    const r = await callTool('generate_apex_tests', { exportDir: REFERENCE_FIXTURE });
    expect(r.isError).toBe(true);
    expect(firstText(r)).toMatch(/outDir|Required/i);
  });

  it('generate_flow_map rejects a call with a non-string exportDir', async () => {
    const r = await callTool('generate_flow_map', { exportDir: 42 });
    expect(r.isError).toBe(true);
    expect(firstText(r)).toMatch(/invalid_type|string/i);
  });

  it('diff_apex_exports rejects a call missing newExportDir', async () => {
    const r = await callTool('diff_apex_exports', { oldExportDir: REFERENCE_FIXTURE });
    expect(r.isError).toBe(true);
    expect(firstText(r)).toMatch(/newExportDir|Required/i);
  });

  it('diff_apex_exports rejects an unknown format enum value', async () => {
    const r = await callTool('diff_apex_exports', {
      oldExportDir: REFERENCE_FIXTURE,
      newExportDir: REFERENCE_FIXTURE,
      format: 'xml',
    });
    expect(r.isError).toBe(true);
    expect(firstText(r)).toMatch(/invalid_enum_value|format/i);
  });

  it('analyze_coverage rejects a call missing touchLogPath', async () => {
    const r = await callTool('analyze_coverage', { exportDir: REFERENCE_FIXTURE });
    expect(r.isError).toBe(true);
    expect(firstText(r)).toMatch(/touchLogPath|Required/i);
  });

  it('analyze_coverage rejects a non-boolean includeHtml', async () => {
    const r = await callTool('analyze_coverage', {
      exportDir: REFERENCE_FIXTURE,
      touchLogPath: join(tmpDir, 'touch.jsonl'),
      includeHtml: 'yes',
    });
    expect(r.isError).toBe(true);
    expect(firstText(r)).toMatch(/invalid_type|boolean/i);
  });

  it('generate_apex_docs rejects a call missing outDir', async () => {
    const r = await callTool('generate_apex_docs', { exportDir: REFERENCE_FIXTURE });
    expect(r.isError).toBe(true);
    expect(firstText(r)).toMatch(/outDir|Required/i);
  });

  it('an unknown tool name is rejected, not silently ignored', async () => {
    const r = await callTool('does_not_exist', {});
    expect(r.isError).toBe(true);
    expect(firstText(r)).toMatch(/not found/i);
  });
});

// ---------------------------------------------------------------------------
// 3. Invalid export path handling -- graceful, never a crash
// ---------------------------------------------------------------------------

describe('invalid export path handling', () => {
  it('inspect_apex_export on a nonexistent directory returns isError, does not throw', async () => {
    const r = await callTool('inspect_apex_export', { exportDir: '/nonexistent/apx/export' });
    expect(r.isError).toBe(true);
    expect(firstText(r)).toBeTruthy();
  });

  it('generate_apex_tests on a nonexistent directory returns isError, does not throw', async () => {
    const r = await callTool('generate_apex_tests', {
      exportDir: '/nonexistent/apx/export',
      outDir: join(tmpDir, 'out'),
    });
    expect(r.isError).toBe(true);
  });

  it('generate_flow_map on a nonexistent directory returns a clear, friendly error', async () => {
    const r = await callTool('generate_flow_map', { exportDir: '/nonexistent/apx/export' });
    expect(r.isError).toBe(true);
    expect(firstText(r)).toContain('Export directory not found');
  });

  it('generate_flow_map on a real directory missing pages/ returns a clear, friendly error', async () => {
    // tmpDir exists but has no pages/ subdirectory -- distinct failure mode
    // from "does not exist at all".
    const r = await callTool('generate_flow_map', { exportDir: tmpDir });
    expect(r.isError).toBe(true);
    expect(firstText(r)).toMatch(/pages\/ subdirectory/);
  });

  it('generate_flow_map on a path that is a file, not a directory, returns a clear error', async () => {
    const filePath = join(tmpDir, 'not-a-dir.txt');
    writeFileSync(filePath, 'hello');
    const r = await callTool('generate_flow_map', { exportDir: filePath });
    expect(r.isError).toBe(true);
    expect(firstText(r)).toContain('Not a directory');
  });

  it('diff_apex_exports reports which side is invalid when only the old export is bad', async () => {
    const r = await callTool('diff_apex_exports', {
      oldExportDir: '/nonexistent/old',
      newExportDir: REFERENCE_FIXTURE,
    });
    expect(r.isError).toBe(true);
    expect(firstText(r)).toMatch(/^Old export:/);
  });

  it('diff_apex_exports reports which side is invalid when only the new export is bad', async () => {
    const r = await callTool('diff_apex_exports', {
      oldExportDir: REFERENCE_FIXTURE,
      newExportDir: '/nonexistent/new',
    });
    expect(r.isError).toBe(true);
    expect(firstText(r)).toMatch(/^New export:/);
  });

  it('analyze_coverage on a nonexistent export directory returns isError', async () => {
    const r = await callTool('analyze_coverage', {
      exportDir: '/nonexistent/apx/export',
      touchLogPath: join(tmpDir, 'touch.jsonl'),
    });
    expect(r.isError).toBe(true);
    expect(firstText(r)).toContain('Export directory not found');
  });

  it('analyze_coverage treats a missing touch log file as zero touches, not an error', async () => {
    const r = await callTool('analyze_coverage', {
      exportDir: REFERENCE_FIXTURE,
      touchLogPath: join(tmpDir, 'does-not-exist.jsonl'),
    });
    expect(r.isError).toBeFalsy();
    const report = JSON.parse(firstText(r));
    expect(report.touchCount).toBe(0);
  });

  it('generate_apex_docs on a nonexistent export directory returns isError', async () => {
    const r = await callTool('generate_apex_docs', {
      exportDir: '/nonexistent/apx/export',
      outDir: join(tmpDir, 'docs-out'),
    });
    expect(r.isError).toBe(true);
    expect(firstText(r)).toContain('Export directory not found');
  });

  it('a malformed-but-present export (garbage .apx content) does not error -- @apx/parser is warning-based', async () => {
    const malformedDir = join(tmpDir, 'malformed-export');
    mkdirSync(join(malformedDir, '.apex'), { recursive: true });
    mkdirSync(join(malformedDir, 'pages'), { recursive: true });
    writeFileSync(
      join(malformedDir, '.apex', 'apexlang.json'),
      JSON.stringify({ mmdVersion: '26.1.0-test' }),
    );
    writeFileSync(join(malformedDir, 'pages', 'p00001-garbage.apx'), 'this is not valid apexlang at all {{{ garbage');

    const r = await callTool('generate_flow_map', { exportDir: malformedDir });
    expect(r.isError).toBeFalsy();
    const flowMap = JSON.parse(firstText(r));
    expect(flowMap.nodes).toEqual([]);
    expect(flowMap.edges).toEqual([]);

    const rInspect = await callTool('inspect_apex_export', { exportDir: malformedDir });
    expect(rInspect.isError).toBeFalsy();
    const inspected = JSON.parse(firstText(rInspect));
    expect(inspected.pages).toEqual([]);
    expect(inspected.warnings.length).toBeGreaterThan(0);
    expect(inspected.warnings[0]).toMatch(/Unrecognized top-level line/);
  });
});

// ---------------------------------------------------------------------------
// 4 & 6. Successful execution against real fixtures + JSON output shape
// ---------------------------------------------------------------------------

describe('inspect_apex_export against the real reference fixture', () => {
  it('returns the real inspect() shape: pages/warnings/unmodeled', async () => {
    const r = await callTool('inspect_apex_export', { exportDir: REFERENCE_FIXTURE });
    expect(r.isError).toBeFalsy();
    const result = JSON.parse(firstText(r));
    expect(Object.keys(result).sort()).toEqual(['pages', 'unmodeled', 'warnings']);
    expect(result.pages).toHaveLength(1);
    const page = result.pages[0];
    expect(page.id).toBe(3);
    expect(page.alias).toBe('EMPLOYEE');
    expect(page.public).toBe(true);
    expect(Array.isArray(page.regions)).toBe(true);
    expect(Array.isArray(page.items)).toBe(true);
    expect(Array.isArray(page.buttons)).toBe(true);
  });
});

describe('generate_apex_tests against the real reference fixture', () => {
  it('writes real .page.ts/.spec.ts files and summarizes them', async () => {
    const outDir = join(tmpDir, 'generated');
    const r = await callTool('generate_apex_tests', { exportDir: REFERENCE_FIXTURE, outDir });
    expect(r.isError).toBeFalsy();
    const text = firstText(r);
    expect(text).toMatch(/Generated 1 specs? into/);
    expect(existsSync(join(outDir, 'p00003-employee.page.ts'))).toBe(true);
    expect(existsSync(join(outDir, 'p00003-employee.spec.ts'))).toBe(true);
  });
});

describe('generate_flow_map against the real reference fixture', () => {
  it('returns the real FlowMap shape', async () => {
    const r = await callTool('generate_flow_map', { exportDir: REFERENCE_FIXTURE });
    expect(r.isError).toBeFalsy();
    const flowMap = JSON.parse(firstText(r));
    expect(Object.keys(flowMap).sort()).toEqual(['edges', 'flowMapVersion', 'nodes', 'reachability']);
    expect(flowMap.flowMapVersion).toBe('0.1.0');
    expect(flowMap.nodes).toHaveLength(1);
    expect(flowMap.nodes[0]).toMatchObject({ id: 'page:3', pageId: 3, alias: 'EMPLOYEE' });
    expect(flowMap.reachability).toHaveProperty('pagesWithNoIncomingEdges');
    expect(Array.isArray(flowMap.reachability.pagesWithNoIncomingEdges)).toBe(true);
  });

  it('is deterministic -- two calls against the same export produce byte-identical output', async () => {
    const r1 = await callTool('generate_flow_map', { exportDir: REFERENCE_FIXTURE });
    const r2 = await callTool('generate_flow_map', { exportDir: REFERENCE_FIXTURE });
    expect(firstText(r1)).toBe(firstText(r2));
  });
});

describe('diff_apex_exports against two real, different fixtures', () => {
  it('returns the real DiffReport shape (json format, the default)', async () => {
    const r = await callTool('diff_apex_exports', {
      oldExportDir: REFERENCE_FIXTURE,
      newExportDir: NAV_SAFETY_FIXTURE,
    });
    expect(r.isError).toBeFalsy();
    const report = JSON.parse(firstText(r));
    expect(Object.keys(report).sort()).toEqual([
      'applicationChanges',
      'manifestChanges',
      'newExportDir',
      'oldExportDir',
      'pages',
      'summary',
    ]);
    // Real, live-confirmed evidence: reference-fixtures has only page 3
    // (EMPLOYEE); navigation-safety-fixture has pages 1 through 4 (a
    // DIFFERENT page 3 -- so page 3 is "changed", pages 1/2/4 are "added").
    expect(report.summary).toEqual({ pagesAdded: 3, pagesRemoved: 0, pagesChanged: 1, pagesUnchanged: 0 });
    expect(report.pages).toHaveLength(4);
    for (const page of report.pages) {
      expect(['added', 'removed', 'changed']).toContain(page.kind);
      expect(Array.isArray(page.affectedFiles)).toBe(true);
    }
  });

  it('format: "human" returns prose, not JSON', async () => {
    const r = await callTool('diff_apex_exports', {
      oldExportDir: REFERENCE_FIXTURE,
      newExportDir: NAV_SAFETY_FIXTURE,
      format: 'human',
    });
    expect(r.isError).toBeFalsy();
    const text = firstText(r);
    expect(() => JSON.parse(text)).toThrow();
    expect(text).toContain('Regression report (human-readable)');
  });

  it('diffing an export against itself reports zero changes', async () => {
    const r = await callTool('diff_apex_exports', {
      oldExportDir: REFERENCE_FIXTURE,
      newExportDir: REFERENCE_FIXTURE,
    });
    const report = JSON.parse(firstText(r));
    expect(report.summary).toEqual({ pagesAdded: 0, pagesRemoved: 0, pagesChanged: 0, pagesUnchanged: 1 });
    expect(report.pages).toEqual([]);
  });
});

describe('analyze_coverage against the real reference fixture', () => {
  it('returns the real CoverageReport shape and reflects a real touch log', async () => {
    const touchLogPath = join(tmpDir, 'touch.jsonl');
    // A real touch log line shape, exactly as @apx/testkit's coverage
    // recorder writes it (packages/testkit/src/fixtures/coverage.ts):
    // one JSON object per line, {kind, identifier, pageId}.
    writeFileSync(touchLogPath, `${JSON.stringify({ kind: 'region', identifier: 'employee', pageId: 3 })}\n`);

    const r = await callTool('analyze_coverage', { exportDir: REFERENCE_FIXTURE, touchLogPath });
    expect(r.isError).toBeFalsy();
    const report = JSON.parse(firstText(r));
    expect(Object.keys(report).sort()).toEqual(['exportDir', 'overall', 'pages', 'touchCount', 'touchLogPath']);
    expect(report.touchCount).toBe(1);
    expect(report.overall.regions.touched).toBeGreaterThanOrEqual(1);
    // Exactly one content block -- no missing-touch-log warning appended,
    // since the log genuinely exists this time.
    expect(r.content).toHaveLength(1);
  });

  it('appends a missing-touch-log warning block when the touch log does not exist', async () => {
    const r = await callTool('analyze_coverage', {
      exportDir: REFERENCE_FIXTURE,
      touchLogPath: join(tmpDir, 'never-written.jsonl'),
    });
    expect(r.content).toHaveLength(2);
    expect(r.content[1].text).toMatch(/does not exist/);
  });

  it('includeHtml: true appends a self-contained HTML heatmap as a third block', async () => {
    const r = await callTool('analyze_coverage', {
      exportDir: REFERENCE_FIXTURE,
      touchLogPath: join(tmpDir, 'never-written.jsonl'),
      includeHtml: true,
    });
    expect(r.content).toHaveLength(3);
    expect(r.content[1].text).toContain('<!doctype html>');
    expect(r.content[2].text).toMatch(/does not exist/);
  });
});

describe('generate_apex_docs against the real reference fixture', () => {
  it('writes real Markdown files and an index.md', async () => {
    const outDir = join(tmpDir, 'docs-out');
    const r = await callTool('generate_apex_docs', { exportDir: REFERENCE_FIXTURE, outDir });
    expect(r.isError).toBeFalsy();
    const text = firstText(r);
    expect(text).toMatch(/Documented 1 page\(s\) into/);
    expect(existsSync(join(outDir, 'p00003-employee.docs.md'))).toBe(true);
    expect(existsSync(join(outDir, 'index.md'))).toBe(true);
    const indexContent = readFileSync(join(outDir, 'index.md'), 'utf8');
    expect(indexContent).toContain('EMPLOYEE');
  });
});

// ---------------------------------------------------------------------------
// 5. Generation failure paths -- a real fs failure, not a hypothetical one
// ---------------------------------------------------------------------------

describe('generation failure paths', () => {
  it('generate_apex_tests fails gracefully when outDir collides with an existing file', async () => {
    const blocker = join(tmpDir, 'blocker');
    writeFileSync(blocker, 'not a directory');
    const r = await callTool('generate_apex_tests', { exportDir: REFERENCE_FIXTURE, outDir: blocker });
    expect(r.isError).toBe(true);
    expect(firstText(r)).toMatch(/EEXIST/);
  });

  it('generate_apex_docs fails gracefully when outDir collides with an existing file', async () => {
    const blocker = join(tmpDir, 'blocker');
    writeFileSync(blocker, 'not a directory');
    const r = await callTool('generate_apex_docs', { exportDir: REFERENCE_FIXTURE, outDir: blocker });
    expect(r.isError).toBe(true);
    expect(firstText(r)).toMatch(/EEXIST/);
  });

  it('analyze_coverage fails gracefully when touchLogPath points at a directory, not a file', async () => {
    const aDir = join(tmpDir, 'a-directory');
    mkdirSync(aDir);
    const r = await callTool('analyze_coverage', { exportDir: REFERENCE_FIXTURE, touchLogPath: aDir });
    expect(r.isError).toBe(true);
    expect(firstText(r)).toMatch(/EISDIR/);
  });
});

// ---------------------------------------------------------------------------
// 7. onboard_generated_apex_app -- registration/schema already covered
// above; this block covers baseline vs. no-baseline behavior and error
// propagation specifically, per the apx-onboard feature's own test
// requirements. This tool wraps @apx/testgen/onboard's runOnboarding()
// directly -- see packages/generator/test/onboard.test.ts for the
// exhaustive library-level behavior (SQLcl injectable-execFn paths,
// resolveSqlclExecutable resolution logic, determinism); this suite only
// re-confirms the MCP transport layer shapes/propagates that same
// behavior correctly, it does not re-derive it.
// ---------------------------------------------------------------------------

describe('onboard_generated_apex_app', () => {
  it('missing exportDir is rejected by the zod schema', async () => {
    const r = await callTool('onboard_generated_apex_app', {
      testsOutDir: join(tmpDir, 'tests'),
      docsOutDir: join(tmpDir, 'docs'),
    });
    expect(r.isError).toBe(true);
    expect(firstText(r)).toMatch(/exportDir|Required/i);
  });

  it('missing testsOutDir is rejected by the zod schema', async () => {
    const r = await callTool('onboard_generated_apex_app', {
      exportDir: REFERENCE_FIXTURE,
      docsOutDir: join(tmpDir, 'docs'),
    });
    expect(r.isError).toBe(true);
    expect(firstText(r)).toMatch(/testsOutDir|Required/i);
  });

  it('a non-boolean sqlcl value is rejected by the zod schema', async () => {
    const r = await callTool('onboard_generated_apex_app', {
      exportDir: REFERENCE_FIXTURE,
      testsOutDir: join(tmpDir, 'tests'),
      docsOutDir: join(tmpDir, 'docs'),
      sqlcl: 'yes',
    });
    expect(r.isError).toBe(true);
    expect(firstText(r)).toMatch(/invalid_type|boolean/i);
  });

  it('a nonexistent exportDir returns isError, does not throw or crash the server', async () => {
    const r = await callTool('onboard_generated_apex_app', {
      exportDir: '/nonexistent/apx/export',
      testsOutDir: join(tmpDir, 'tests'),
      docsOutDir: join(tmpDir, 'docs'),
    });
    expect(r.isError).toBe(true);
    expect(firstText(r)).toContain('Export directory not found');
  });

  it('a nonexistent baselineExportDir returns isError naming the baseline side specifically', async () => {
    const r = await callTool('onboard_generated_apex_app', {
      exportDir: REFERENCE_FIXTURE,
      baselineExportDir: '/nonexistent/baseline',
      testsOutDir: join(tmpDir, 'tests'),
      docsOutDir: join(tmpDir, 'docs'),
    });
    expect(r.isError).toBe(true);
    expect(firstText(r)).toMatch(/^Baseline export:/);
  });

  it('no baseline: real report with generate/docs/flowMap populated, diff and coverage explicitly omitted', async () => {
    const r = await callTool('onboard_generated_apex_app', {
      exportDir: REFERENCE_FIXTURE,
      testsOutDir: join(tmpDir, 'tests'),
      docsOutDir: join(tmpDir, 'docs'),
    });
    expect(r.isError).toBeFalsy();
    const report = JSON.parse(firstText(r));
    expect(report.baselineExportDir).toBeNull();
    expect(report.generate.generated).toBe(1);
    expect(report.docs.generated).toBe(1);
    expect(report.flowMap.nodes).toHaveLength(1);
    expect(report.diff).toEqual({ included: false, note: expect.stringContaining('no --baseline'), report: null });
    expect(report.coverage).toEqual({ included: false, note: expect.stringContaining('first-ever'), report: null });
    expect(report.sqlcl.requested).toBe(false);
    expect(existsSync(join(tmpDir, 'tests', 'p00003-employee.spec.ts'))).toBe(true);
    expect(existsSync(join(tmpDir, 'docs', 'index.md'))).toBe(true);
  });

  it('with baseline: report includes a real diff section against the baseline export', async () => {
    const r = await callTool('onboard_generated_apex_app', {
      exportDir: NAV_SAFETY_FIXTURE,
      baselineExportDir: REFERENCE_FIXTURE,
      testsOutDir: join(tmpDir, 'tests'),
      docsOutDir: join(tmpDir, 'docs'),
    });
    expect(r.isError).toBeFalsy();
    const report = JSON.parse(firstText(r));
    expect(report.diff.included).toBe(true);
    expect(report.diff.report.summary).toEqual({ pagesAdded: 3, pagesRemoved: 0, pagesChanged: 1, pagesUnchanged: 0 });
  });

  it('with baseline + an existing touchLogPath: coverage is included with a real CoverageReport', async () => {
    const touchLogPath = join(tmpDir, 'touch.jsonl');
    writeFileSync(touchLogPath, `${JSON.stringify({ kind: 'region', identifier: 'employee', pageId: 3 })}\n`);
    const r = await callTool('onboard_generated_apex_app', {
      exportDir: REFERENCE_FIXTURE,
      baselineExportDir: REFERENCE_FIXTURE,
      testsOutDir: join(tmpDir, 'tests'),
      docsOutDir: join(tmpDir, 'docs'),
      touchLogPath,
    });
    expect(r.isError).toBeFalsy();
    const report = JSON.parse(firstText(r));
    expect(report.coverage.included).toBe(true);
    expect(report.coverage.report.touchCount).toBe(1);
  });

  it('with baseline but no touchLogPath: coverage omitted with a note, not an error', async () => {
    const r = await callTool('onboard_generated_apex_app', {
      exportDir: REFERENCE_FIXTURE,
      baselineExportDir: REFERENCE_FIXTURE,
      testsOutDir: join(tmpDir, 'tests'),
      docsOutDir: join(tmpDir, 'docs'),
    });
    expect(r.isError).toBeFalsy();
    const report = JSON.parse(firstText(r));
    expect(report.coverage.included).toBe(false);
    expect(report.coverage.note).toMatch(/APX_COVERAGE_LOG/);
  });

  it('sqlcl requested but unresolvable (no real sql binary in this environment): isError true, actionable message, error propagated through safeText, not a crash', async () => {
    const r = await callTool('onboard_generated_apex_app', {
      exportDir: REFERENCE_FIXTURE,
      testsOutDir: join(tmpDir, 'tests'),
      docsOutDir: join(tmpDir, 'docs'),
      sqlcl: true,
      sqlclExecutablePath: '/opt/does-not-exist/sql',
    });
    expect(r.isError).toBe(true);
    expect(firstText(r)).toMatch(/no SQLcl executable could be resolved/);
    expect(firstText(r)).toContain('/opt/does-not-exist/sql');
  });

  it('sqlclExecutablePath alone (sqlcl omitted) still opts in to validation', async () => {
    const r = await callTool('onboard_generated_apex_app', {
      exportDir: REFERENCE_FIXTURE,
      testsOutDir: join(tmpDir, 'tests'),
      docsOutDir: join(tmpDir, 'docs'),
      sqlclExecutablePath: '/opt/does-not-exist/sql',
    });
    expect(r.isError).toBe(true);
    expect(firstText(r)).toMatch(/no SQLcl executable could be resolved/);
  });

  it('is deterministic -- two calls against the same export produce byte-identical output', async () => {
    const r1 = await callTool('onboard_generated_apex_app', {
      exportDir: REFERENCE_FIXTURE,
      testsOutDir: join(tmpDir, 'tests-1'),
      docsOutDir: join(tmpDir, 'docs-1'),
    });
    const r2 = await callTool('onboard_generated_apex_app', {
      exportDir: REFERENCE_FIXTURE,
      testsOutDir: join(tmpDir, 'tests-2'),
      docsOutDir: join(tmpDir, 'docs-2'),
    });
    const normalize = (text: string): unknown => {
      const parsed = JSON.parse(text);
      return { ...parsed, generate: { ...parsed.generate, outDir: '<out>' }, docs: { ...parsed.docs, outDir: '<out>' } };
    };
    expect(normalize(firstText(r1))).toEqual(normalize(firstText(r2)));
  });
});
