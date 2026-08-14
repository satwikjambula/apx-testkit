/**
 * Tests for apx-docs (packages/generator/src/docs.ts) — GitHub issue #4,
 * docs/ecosystem-roadmap.md "Ninth round" item 4. Three concerns, matching
 * the discipline `diff-field-coverage.test.ts` and `coverage.test.ts`
 * already establish for this package:
 *
 *   1. Field-completeness — a synthetic page with one of EVERY documented
 *      construct, each field set to a unique sentinel value, asserts every
 *      sentinel appears somewhere in the rendered Markdown. This is the
 *      docs-generator analogue of the calendarSettings/chartSettings+
 *      htmlDomId incident `diff-field-coverage.test.ts`'s own doc comment
 *      describes: a typed AST field silently not rendered would otherwise
 *      go unnoticed until read by hand.
 *   2. Determinism — same `ApexPage`/export in -> byte-identical Markdown
 *      out, twice in a row, and via `generateDocs()` against the real
 *      committed reference fixture (same fixture the release checklist's
 *      "regenerate reference-fixtures" step already uses for apx-testgen).
 *   3. Region/page item-ownership split — a region-owned item/button is
 *      documented once, under its region, not duplicated at page level
 *      (the same redundancy `diff-field-coverage.test.ts` documents for
 *      `ApexRegion.items`/`buttons` against `apx-diff`).
 */
import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type {
  ApexBranch,
  ApexButton,
  ApexComputation,
  ApexDAAction,
  ApexDynamicAction,
  ApexItem,
  ApexPage,
  ApexProcess,
  ApexRegion,
  ApexRegionAction,
  ApexReportColumn,
  ApexValidation,
} from '@apx/parser';
import { appIndexDocs, generateDocs, pageDocs } from '../src/docs.js';

const LOC = { file: 'p1.apx', line: 1 };

const itemFixture: ApexItem = {
  identifier: 'P1_SENTINEL_ITEM',
  type: 'textField',
  label: 'SENTINEL_ITEM_LABEL',
  required: true,
  sourceColumn: 'SENTINEL_SOURCE_COLUMN',
  lovName: 'SENTINEL_LOV_NAME',
  loc: LOC,
  raw: {},
};

const pageLevelItemFixture: ApexItem = {
  ...itemFixture,
  identifier: 'P1_SENTINEL_PAGE_ITEM',
  label: 'SENTINEL_PAGE_ITEM_LABEL',
};

const buttonFixture: ApexButton = {
  identifier: 'SENTINEL_BUTTON',
  label: 'SENTINEL_BUTTON_LABEL',
  action: 'SENTINEL_BUTTON_ACTION',
  target: null,
  url: null,
  htmlDomId: 'SENTINEL_BUTTON_DOM_ID',
  loc: LOC,
  raw: {},
};

const pageLevelButtonFixture: ApexButton = {
  ...buttonFixture,
  identifier: 'SENTINEL_PAGE_BUTTON',
  label: 'SENTINEL_PAGE_BUTTON_LABEL',
};

const columnFixture: ApexReportColumn = {
  identifier: 'SENTINEL_COLUMN',
  type: 'plainText',
  heading: 'SENTINEL_COLUMN_HEADING',
  sequence: 42,
  linkTarget: { page: 77, items: { P77_ID: '#ID#' }, clearCache: '77', url: null },
  loc: LOC,
  raw: {},
};

const regionActionFixture: ApexRegionAction = {
  identifier: 'SENTINEL_ACTION',
  label: 'SENTINEL_ACTION_LABEL',
  kind: 'button',
  target: { page: 88, items: null, clearCache: null },
  url: 'https://sentinel.example/action-url',
  loc: LOC,
  raw: {},
};

const regionFixture: ApexRegion = {
  identifier: 'sentinel-region',
  name: 'SENTINEL_REGION_NAME',
  type: 'form',
  source: { location: 'localDatabase', tableName: 'SENTINEL_TABLE', sql: 'select * from sentinel_table' },
  calendarSettings: {
    displayColumn: 'SENTINEL_DISPLAY_COLUMN',
    startDateColumn: 'SENTINEL_START_COLUMN',
    endDateColumn: 'SENTINEL_END_COLUMN',
    pkColumn: 'SENTINEL_PK_COLUMN',
    showTime: true,
    views: ['SENTINEL_VIEW_DAY', 'SENTINEL_VIEW_WEEK'],
    dragAndDrop: true,
  },
  chartSettings: { type: 'SENTINEL_CHART_TYPE' },
  htmlDomId: 'SENTINEL_REGION_DOM_ID',
  items: [itemFixture],
  buttons: [buttonFixture],
  columns: [columnFixture],
  actions: [regionActionFixture],
  loc: LOC,
  raw: {},
};

const daActionFixture: ApexDAAction = {
  identifier: 'SENTINEL_DA_ACTION',
  name: 'SENTINEL_DA_ACTION_NAME',
  action: 'SENTINEL_DA_ACTION_TYPE',
  fireWhenEventResultIs: true,
  loc: LOC,
  raw: {},
};

const dynamicActionFixture: ApexDynamicAction = {
  identifier: 'SENTINEL_DA',
  name: 'SENTINEL_DA_NAME',
  when: {
    selectionType: 'items',
    items: ['SENTINEL_DA_WHEN_ITEM'],
    button: 'SENTINEL_DA_WHEN_BUTTON',
    region: 'SENTINEL_DA_WHEN_REGION',
    event: 'SENTINEL_DA_EVENT',
    customEvent: 'SENTINEL_DA_CUSTOM_EVENT',
  },
  clientSideCondition: { type: 'item=value', item: 'SENTINEL_COND_ITEM', value: 'SENTINEL_COND_VALUE' },
  actions: [daActionFixture],
  loc: LOC,
  raw: {},
};

const branchFixture: ApexBranch = {
  identifier: null,
  name: 'SENTINEL_BRANCH_NAME',
  sequence: 10,
  point: 'SENTINEL_BRANCH_POINT',
  // clearCache added per ApexBranchTarget.clearCache (packages/parser/src/ast.ts) --
  // real evidence: concurrent-manager, pages/p00351-lookup-manager1.apx:960-968.
  target: { page: null, url: 'https://sentinel.example/branch-url', items: null, clearCache: null },
  condition: {
    whenButtonPressed: 'SENTINEL_BRANCH_WHEN_BUTTON',
    type: 'SENTINEL_BRANCH_COND_TYPE',
    item: 'SENTINEL_BRANCH_COND_ITEM',
    value: 'SENTINEL_BRANCH_COND_VALUE',
    plsqlExpression: 'SENTINEL_BRANCH_PLSQL',
  },
  loc: LOC,
  raw: {},
};

const validationFixture: ApexValidation = {
  identifier: 'SENTINEL_VALIDATION',
  name: 'SENTINEL_VALIDATION_NAME',
  type: 'SENTINEL_VALIDATION_TYPE',
  item: 'SENTINEL_VALIDATION_ITEM',
  column: 'SENTINEL_VALIDATION_COLUMN',
  error: {
    message: 'SENTINEL_VALIDATION_ERROR_MESSAGE',
    displayLocation: 'inline',
    associatedItem: 'SENTINEL_VALIDATION_ITEM',
    associatedColumn: null,
  },
  condition: {
    whenButtonPressed: 'SENTINEL_VALIDATION_WHEN_BUTTON',
    type: 'SENTINEL_VALIDATION_COND_TYPE',
    item: null,
    value: null,
    plsqlExpression: null,
  },
  loc: LOC,
  raw: {},
};

const processFixture: ApexProcess = {
  identifier: 'SENTINEL_PROCESS',
  name: 'SENTINEL_PROCESS_NAME',
  type: 'SENTINEL_PROCESS_TYPE',
  sequence: 20,
  point: 'SENTINEL_PROCESS_POINT',
  condition: {
    whenButtonPressed: 'SENTINEL_PROCESS_WHEN_BUTTON',
    type: null,
    item: null,
    value: null,
    plsqlExpression: null,
  },
  loc: LOC,
  raw: {},
};

const computationFixture: ApexComputation = {
  identifier: 'SENTINEL_COMPUTATION',
  itemName: 'SENTINEL_COMPUTATION_ITEM',
  type: 'SENTINEL_COMPUTATION_TYPE',
  sequence: 30,
  condition: {
    whenButtonPressed: 'SENTINEL_COMPUTATION_WHEN_BUTTON',
    type: null,
    item: null,
    value: null,
    plsqlExpression: null,
  },
  loc: LOC,
  raw: {},
};

const pageFixture: ApexPage = {
  id: 1,
  alias: 'SENTINEL_PAGE',
  name: 'SENTINEL_PAGE_NAME',
  title: 'SENTINEL_PAGE_TITLE',
  regions: [regionFixture],
  items: [itemFixture, pageLevelItemFixture],
  buttons: [buttonFixture, pageLevelButtonFixture],
  dynamicActions: [dynamicActionFixture],
  branches: [branchFixture],
  validations: [validationFixture],
  processes: [processFixture],
  computations: [computationFixture],
  loc: LOC,
  raw: { 'security.authentication': 'public' },
};

describe('pageDocs — field completeness', () => {
  const rendered = pageDocs(pageFixture);

  const expectedSentinels = [
    'SENTINEL_PAGE_NAME',
    'SENTINEL_PAGE_TITLE',
    // page-level (unowned) item/button only -- the region-owned pair is
    // checked separately below, since it must NOT also appear at page level.
    'SENTINEL_PAGE_ITEM_LABEL',
    'SENTINEL_PAGE_BUTTON_LABEL',
    // region
    'SENTINEL_REGION_NAME',
    'SENTINEL_TABLE',
    'SENTINEL_REGION_DOM_ID',
    'SENTINEL_DISPLAY_COLUMN',
    'SENTINEL_VIEW_DAY',
    'SENTINEL_CHART_TYPE',
    // region-owned item/button
    'SENTINEL_ITEM_LABEL',
    'SENTINEL_SOURCE_COLUMN',
    'SENTINEL_LOV_NAME',
    'SENTINEL_BUTTON_LABEL',
    'SENTINEL_BUTTON_ACTION',
    'SENTINEL_BUTTON_DOM_ID',
    // column
    'SENTINEL_COLUMN',
    'SENTINEL_COLUMN_HEADING',
    // region action
    'SENTINEL_ACTION',
    'SENTINEL_ACTION_LABEL',
    'sentinel.example/action-url',
    // dynamic action
    'SENTINEL_DA_NAME',
    'SENTINEL_DA_EVENT',
    'SENTINEL_DA_CUSTOM_EVENT',
    'SENTINEL_DA_WHEN_ITEM',
    'SENTINEL_DA_WHEN_BUTTON',
    'SENTINEL_DA_WHEN_REGION',
    'SENTINEL_COND_ITEM',
    'SENTINEL_COND_VALUE',
    'SENTINEL_DA_ACTION_NAME',
    'SENTINEL_DA_ACTION_TYPE',
    // branch
    'SENTINEL_BRANCH_NAME',
    'SENTINEL_BRANCH_POINT',
    'sentinel.example/branch-url',
    'SENTINEL_BRANCH_WHEN_BUTTON',
    'SENTINEL_BRANCH_COND_TYPE',
    'SENTINEL_BRANCH_COND_ITEM',
    'SENTINEL_BRANCH_COND_VALUE',
    'SENTINEL_BRANCH_PLSQL',
    // validation
    'SENTINEL_VALIDATION',
    'SENTINEL_VALIDATION_NAME',
    'SENTINEL_VALIDATION_TYPE',
    'SENTINEL_VALIDATION_ITEM',
    'SENTINEL_VALIDATION_COLUMN',
    'SENTINEL_VALIDATION_ERROR_MESSAGE',
    'SENTINEL_VALIDATION_WHEN_BUTTON',
    // process
    'SENTINEL_PROCESS',
    'SENTINEL_PROCESS_NAME',
    'SENTINEL_PROCESS_TYPE',
    'SENTINEL_PROCESS_POINT',
    'SENTINEL_PROCESS_WHEN_BUTTON',
    // computation
    'SENTINEL_COMPUTATION',
    'SENTINEL_COMPUTATION_ITEM',
    'SENTINEL_COMPUTATION_TYPE',
    'SENTINEL_COMPUTATION_WHEN_BUTTON',
  ];

  for (const sentinel of expectedSentinels) {
    it(`renders ${sentinel}`, () => {
      expect(
        rendered.includes(sentinel),
        `apx-docs output is missing '${sentinel}' -- a typed AST field exists but is not rendered ` +
          'by packages/generator/src/docs.ts. Wire it into the matching table()/format*() helper.',
      ).toBe(true);
    });
  }
});

describe('pageDocs — region vs. page-level item/button ownership', () => {
  const rendered = pageDocs(pageFixture);

  it('lists the region-owned item once, under the region, not again at page level', () => {
    const pageLevelSection = rendered.slice(
      rendered.indexOf('## Page-level items'),
      rendered.indexOf('## Regions'),
    );
    expect(pageLevelSection).not.toContain('SENTINEL_ITEM_LABEL');
    expect(pageLevelSection).toContain('SENTINEL_PAGE_ITEM_LABEL');
  });

  it('lists the region-owned button once, under the region, not again at page level', () => {
    const pageLevelSection = rendered.slice(
      rendered.indexOf('## Page-level buttons'),
      rendered.indexOf('## Regions'),
    );
    expect(pageLevelSection).not.toContain('SENTINEL_BUTTON_LABEL');
    expect(pageLevelSection).toContain('SENTINEL_PAGE_BUTTON_LABEL');
  });
});

describe('pageDocs — empty page renders cleanly', () => {
  const emptyPage: ApexPage = {
    id: 2,
    alias: 'EMPTY_PAGE',
    name: null,
    title: null,
    regions: [],
    items: [],
    buttons: [],
    dynamicActions: [],
    branches: [],
    validations: [],
    processes: [],
    computations: [],
    loc: LOC,
    raw: {},
  };

  it('does not throw and every section renders a "(none)" placeholder', () => {
    const rendered = pageDocs(emptyPage);
    expect(rendered).toContain('# Page 2: EMPTY_PAGE (`EMPTY_PAGE`)');
    // 7 top-level empty sections: page items, page buttons, regions,
    // dynamic actions, branches, validations, processes, computations.
    expect(rendered.match(/_\(none\)_/g)?.length).toBe(8);
  });
});

describe('pageDocs — determinism', () => {
  it('the same ApexPage renders byte-identical Markdown twice', () => {
    expect(pageDocs(pageFixture)).toBe(pageDocs(pageFixture));
  });
});

describe('appIndexDocs', () => {
  it('lists every documented page with a link to its per-page file and reports unmodeled types', () => {
    const rendered = appIndexDocs({
      astVersion: '0.1.0-provisional',
      pages: [pageFixture],
      sourceFiles: ['pages/p00001-sentinel-page.apx'],
      unmodeled: ['someFutureConstruct'],
    });
    expect(rendered).toContain('[1](./p00001-sentinel_page.docs.md)');
    expect(rendered).toContain('someFutureConstruct');
  });

  it('excludes page 0 and alias-less pages, same filter apx-testgen/apx-diff already apply', () => {
    const page0: ApexPage = { ...pageFixture, id: 0 };
    const noAlias: ApexPage = { ...pageFixture, id: 3, alias: null };
    const rendered = appIndexDocs({
      astVersion: '0.1.0-provisional',
      pages: [page0, noAlias, pageFixture],
      sourceFiles: [],
      unmodeled: [],
    });
    expect(rendered).toContain('1 page(s) documented');
  });
});

describe('generateDocs — against the real committed reference fixture', () => {
  const exportDir = join(__dirname, 'fixtures', 'reference-fixtures');

  it('writes one .docs.md per real page plus index.md', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'apx-docs-test-'));
    try {
      const result = generateDocs(exportDir, outDir);
      expect(result.generated).toBe(1);
      expect(result.files).toEqual(['p00003-employee.docs.md', 'index.md']);
      const pageDoc = readFileSync(join(outDir, 'p00003-employee.docs.md'), 'utf8');
      expect(pageDoc).toContain('# Page 3: Employee (`EMPLOYEE`)');
      expect(pageDoc).toContain('P3_ENAME');
      const index = readFileSync(join(outDir, 'index.md'), 'utf8');
      expect(index).toContain('[3](./p00003-employee.docs.md)');
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it('is deterministic — regenerating twice produces byte-identical files', () => {
    const outDir1 = mkdtempSync(join(tmpdir(), 'apx-docs-test-a-'));
    const outDir2 = mkdtempSync(join(tmpdir(), 'apx-docs-test-b-'));
    try {
      const r1 = generateDocs(exportDir, outDir1);
      const r2 = generateDocs(exportDir, outDir2);
      expect(r1.files).toEqual(r2.files);
      for (const file of r1.files) {
        const a = readFileSync(join(outDir1, file), 'utf8');
        const b = readFileSync(join(outDir2, file), 'utf8');
        expect(a).toBe(b);
      }
    } finally {
      rmSync(outDir1, { recursive: true, force: true });
      rmSync(outDir2, { recursive: true, force: true });
    }
  });
});
