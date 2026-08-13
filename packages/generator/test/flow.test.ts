/**
 * Tests for apx-flow (packages/generator/src/flow.ts). Four concerns,
 * matching the discipline `diff-field-coverage.test.ts`/`docs.test.ts`
 * already establish for this package:
 *
 *   1. All four navigation sources produce a real edge, each resolving
 *      both the page-target and URL-redirect variant where the source
 *      supports both.
 *   2. Condition preservation — a page with multiple branches (including
 *      two targeting the SAME page under different conditions) produces
 *      one edge PER branch, never merged/flattened, and each edge's
 *      `condition` matches its own originating branch exactly.
 *   3. Confidence tiering — `FLOW_MECHANISM_EVIDENCE` assigns `'high'` to
 *      every mechanism except `button.page`, which is `'medium'`; built
 *      edges carry that same confidence through, per mechanism.
 *   4. Determinism — the same `ApexAppAst` produces a byte-identical
 *      `FlowMap` (via `JSON.stringify`) twice, and `computeFlowMap()`
 *      against the real committed reference fixture is stable too.
 */
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import type {
  ApexBranch,
  ApexButton,
  ApexPage,
  ApexRegion,
  ApexRegionAction,
  ApexReportColumn,
} from '@apx/parser';
import { buildFlowMap, computeFlowMap, FLOW_MECHANISM_EVIDENCE, type FlowEdgeMechanism } from '../src/flow.js';

const LOC = { file: 'p1.apx', line: 1 };

function page(overrides: Partial<ApexPage>): ApexPage {
  return {
    id: 1,
    alias: 'PAGE_ONE',
    name: 'Page One',
    title: 'Page One',
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
    ...overrides,
  };
}

function region(overrides: Partial<ApexRegion>): ApexRegion {
  return {
    identifier: 'r',
    name: null,
    type: 'cards',
    source: null,
    calendarSettings: null,
    chartSettings: null,
    htmlDomId: null,
    items: [],
    buttons: [],
    columns: [],
    actions: [],
    loc: LOC,
    raw: {},
    ...overrides,
  };
}

function branch(overrides: Partial<ApexBranch>): ApexBranch {
  return {
    identifier: null,
    name: null,
    sequence: 10,
    point: 'afterSubmit',
    target: null,
    condition: null,
    loc: LOC,
    raw: {},
    ...overrides,
  };
}

function regionAction(overrides: Partial<ApexRegionAction>): ApexRegionAction {
  return {
    identifier: 'action',
    label: null,
    kind: 'fullCard',
    target: null,
    url: null,
    loc: LOC,
    raw: {},
    ...overrides,
  };
}

function reportColumn(overrides: Partial<ApexReportColumn>): ApexReportColumn {
  return {
    identifier: 'COL',
    type: 'link',
    heading: null,
    sequence: 10,
    linkTarget: null,
    loc: LOC,
    raw: {},
    ...overrides,
  };
}

function button(overrides: Partial<ApexButton>): ApexButton {
  return {
    identifier: 'btn',
    label: null,
    action: null,
    target: null,
    url: null,
    htmlDomId: null,
    loc: LOC,
    raw: {},
    ...overrides,
  };
}

function ast(pages: ApexPage[]) {
  return { astVersion: '0.1.0-provisional' as const, pages, sourceFiles: [], unmodeled: [] };
}

describe('buildFlowMap — nodes', () => {
  it('includes only real pages (id !== 0 and alias set), matching docs.ts/coverage.ts/page-object.ts', () => {
    const p1 = page({ id: 1, alias: 'PAGE_ONE' });
    const global = page({ id: 0, alias: null });
    const noAlias = page({ id: 5, alias: null });
    const result = buildFlowMap(ast([global, p1, noAlias]));
    expect(result.nodes).toEqual([{ id: 'page:1', pageId: 1, alias: 'PAGE_ONE', name: 'Page One' }]);
  });
});

describe('buildFlowMap — source 1: page branches', () => {
  it('resolves a page-target branch to a real page node (high confidence)', () => {
    const p1 = page({
      id: 1,
      alias: 'PAGE_ONE',
      branches: [branch({ name: 'go-to-two', target: { page: 2, url: null, items: { P2_ID: '&P1_ID.' } } })],
    });
    const p2 = page({ id: 2, alias: 'PAGE_TWO' });
    const result = buildFlowMap(ast([p1, p2]));
    expect(result.edges).toHaveLength(1);
    const e = result.edges[0];
    expect(e.source).toBe('branch');
    expect(e.mechanism).toBe('branch.page');
    expect(e.from).toBe('page:1');
    expect(e.to).toEqual({ kind: 'page', nodeId: 'page:2', pageId: 2 });
    expect(e.items).toEqual({ P2_ID: '&P1_ID.' });
    expect(e.clearCache).toBeNull(); // ApexBranchTarget has no clearCache field at all
    expect(e.confidence).toBe('high');
  });

  it('resolves a URL-redirect branch to a url target (high confidence)', () => {
    const p1 = page({
      id: 1,
      alias: 'PAGE_ONE',
      branches: [branch({ name: 'sign-out', target: { page: null, url: '&LOGOUT_URL.', items: null } })],
    });
    const result = buildFlowMap(ast([p1]));
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0].mechanism).toBe('branch.url');
    expect(result.edges[0].to).toEqual({ kind: 'url', url: '&LOGOUT_URL.' });
    expect(result.edges[0].confidence).toBe('high');
  });

  it('resolves a branch targeting a page ALIAS (not a number) via case-insensitive alias lookup', () => {
    const p1 = page({
      id: 1,
      alias: 'PAGE_ONE',
      branches: [branch({ target: { page: 'page_two', url: null, items: null } })],
    });
    const p2 = page({ id: 2, alias: 'PAGE_TWO' });
    const result = buildFlowMap(ast([p1, p2]));
    expect(result.edges[0].to).toEqual({ kind: 'page', nodeId: 'page:2', pageId: 2 });
  });

  it('leaves an item-substitution-token target unresolved (not silently guessed)', () => {
    const p1 = page({
      id: 1,
      alias: 'PAGE_ONE',
      branches: [branch({ target: { page: '&LAST_VIEW.', url: null, items: null } })],
    });
    const result = buildFlowMap(ast([p1]));
    expect(result.edges[0].to).toEqual({ kind: 'unresolvedPage', ref: '&LAST_VIEW.' });
  });

  it('produces no edge for a branch with no target data at all', () => {
    const p1 = page({ id: 1, alias: 'PAGE_ONE', branches: [branch({})] });
    expect(buildFlowMap(ast([p1])).edges).toHaveLength(0);
  });

  it('CONDITION PRESERVATION: two branches targeting the SAME page under different conditions produce two distinct, unmerged edges', () => {
    const p1 = page({
      id: 1,
      alias: 'PAGE_ONE',
      branches: [
        branch({
          name: 'approve-branch',
          target: { page: 2, url: null, items: null },
          condition: { whenButtonPressed: 'APPROVE', type: null, item: null, value: null, plsqlExpression: null },
        }),
        branch({
          name: 'reject-branch',
          target: { page: 2, url: null, items: null },
          condition: { whenButtonPressed: 'REJECT', type: null, item: null, value: null, plsqlExpression: null },
        }),
      ],
    });
    const p2 = page({ id: 2, alias: 'PAGE_TWO' });
    const result = buildFlowMap(ast([p1, p2]));

    // Two edges, NOT flattened into one -- even though both target page 2.
    expect(result.edges).toHaveLength(2);
    expect(result.edges[0].id).not.toBe(result.edges[1].id);
    expect(result.edges[0].to).toEqual({ kind: 'page', nodeId: 'page:2', pageId: 2 });
    expect(result.edges[1].to).toEqual({ kind: 'page', nodeId: 'page:2', pageId: 2 });

    // Each edge's own condition survives verbatim, un-merged with the other.
    expect(result.edges[0].condition?.whenButtonPressed).toBe('APPROVE');
    expect(result.edges[1].condition?.whenButtonPressed).toBe('REJECT');
    expect(result.edges[0].sourceIdentifier).toBeNull(); // ApexBranch.identifier is always null in real data
  });
});

describe('buildFlowMap — source 2: Cards/List region actions', () => {
  it('resolves a page-target region action (high confidence)', () => {
    const p1 = page({
      id: 1,
      alias: 'PAGE_ONE',
      regions: [
        region({
          identifier: 'emp-cards',
          actions: [
            regionAction({
              identifier: 'action',
              kind: 'fullCard',
              target: { page: 14, items: { P14_EMPNO: '&EMPNO.' }, clearCache: '14' },
            }),
          ],
        }),
      ],
    });
    const p14 = page({ id: 14, alias: 'DETAIL' });
    const result = buildFlowMap(ast([p1, p14]));
    expect(result.edges).toHaveLength(1);
    const e = result.edges[0];
    expect(e.mechanism).toBe('regionAction.page');
    expect(e.regionIdentifier).toBe('emp-cards');
    expect(e.to).toEqual({ kind: 'page', nodeId: 'page:14', pageId: 14 });
    expect(e.clearCache).toBe('14');
    expect(e.confidence).toBe('high');
  });

  it('resolves a URL-redirect region action (high confidence)', () => {
    const p1 = page({
      id: 1,
      alias: 'PAGE_ONE',
      regions: [
        region({
          identifier: 'content-row',
          actions: [regionAction({ identifier: 'action', kind: 'title', url: '#action$open-search' })],
        }),
      ],
    });
    const result = buildFlowMap(ast([p1]));
    expect(result.edges[0].mechanism).toBe('regionAction.url');
    expect(result.edges[0].to).toEqual({ kind: 'url', url: '#action$open-search' });
    expect(result.edges[0].confidence).toBe('high');
  });

  it('produces no edge for an action with neither target nor url (e.g. a triggerAction-type action)', () => {
    const p1 = page({
      id: 1,
      alias: 'PAGE_ONE',
      regions: [region({ identifier: 'r1', actions: [regionAction({})] })],
    });
    expect(buildFlowMap(ast([p1])).edges).toHaveLength(0);
  });
});

describe('buildFlowMap — source 3: report/IR/IG column links', () => {
  it('resolves a page-target column link (high confidence)', () => {
    const p1 = page({
      id: 1,
      alias: 'PAGE_ONE',
      regions: [
        region({
          identifier: 'accounts-report',
          columns: [
            reportColumn({
              identifier: 'CUSTOMER_NAME',
              heading: 'Customer',
              linkTarget: { page: 94, items: { P94_ID: '#ID#' }, clearCache: '94', url: null },
            }),
          ],
        }),
      ],
    });
    const p94 = page({ id: 94, alias: 'ACCOUNT' });
    const result = buildFlowMap(ast([p1, p94]));
    const e = result.edges[0];
    expect(e.mechanism).toBe('reportColumnLink.page');
    expect(e.regionIdentifier).toBe('accounts-report');
    expect(e.label).toBe('Customer');
    expect(e.to).toEqual({ kind: 'page', nodeId: 'page:94', pageId: 94 });
    expect(e.confidence).toBe('high');
  });

  it('resolves a URL-redirect column link (high confidence, the Eleventh-round bug-fix case)', () => {
    const p1 = page({
      id: 1,
      alias: 'PAGE_ONE',
      regions: [
        region({
          identifier: 'child-records',
          columns: [
            reportColumn({
              identifier: 'CHILD_RECORD_NAME',
              linkTarget: { page: null, items: null, clearCache: null, url: '#' },
            }),
          ],
        }),
      ],
    });
    const result = buildFlowMap(ast([p1]));
    expect(result.edges[0].mechanism).toBe('reportColumnLink.url');
    expect(result.edges[0].to).toEqual({ kind: 'url', url: '#' });
    expect(result.edges[0].confidence).toBe('high');
  });

  it('produces no edge for a column with no link {} group at all', () => {
    const p1 = page({
      id: 1,
      alias: 'PAGE_ONE',
      regions: [region({ identifier: 'r1', columns: [reportColumn({})] })],
    });
    expect(buildFlowMap(ast([p1])).edges).toHaveLength(0);
  });
});

describe('buildFlowMap — source 4: button page/URL redirects', () => {
  it('resolves a URL-redirect button (high confidence — live-witnessed variant)', () => {
    const p1 = page({
      id: 1,
      alias: 'PAGE_ONE',
      buttons: [button({ identifier: 'view-details', label: 'View', url: '#' })],
    });
    const result = buildFlowMap(ast([p1]));
    const e = result.edges[0];
    expect(e.mechanism).toBe('button.url');
    expect(e.to).toEqual({ kind: 'url', url: '#' });
    expect(e.confidence).toBe('high');
  });

  it('resolves a page/app-redirect button (MEDIUM confidence — typed, not live-witnessed)', () => {
    const p1 = page({
      id: 1,
      alias: 'PAGE_ONE',
      buttons: [
        button({
          identifier: 'go-next',
          label: 'Next',
          target: { page: 2, items: null, clearCache: null },
        }),
      ],
    });
    const p2 = page({ id: 2, alias: 'PAGE_TWO' });
    const result = buildFlowMap(ast([p1, p2]));
    const e = result.edges[0];
    expect(e.mechanism).toBe('button.page');
    expect(e.to).toEqual({ kind: 'page', nodeId: 'page:2', pageId: 2 });
    expect(e.confidence).toBe('medium');
  });

  it('does not double-count a region-owned button (page.buttons is the single source of truth, not also iterated per-region)', () => {
    const btn = button({ identifier: 'view-details', url: '#' });
    const p1 = page({
      id: 1,
      alias: 'PAGE_ONE',
      buttons: [btn],
      regions: [region({ identifier: 'r1', buttons: [btn] })],
    });
    expect(buildFlowMap(ast([p1])).edges).toHaveLength(1);
  });
});

describe('FLOW_MECHANISM_EVIDENCE — confidence tiering', () => {
  const expectedHigh: FlowEdgeMechanism[] = [
    'branch.page',
    'branch.url',
    'regionAction.page',
    'regionAction.url',
    'reportColumnLink.page',
    'reportColumnLink.url',
    'button.url',
  ];

  for (const m of expectedHigh) {
    it(`${m} is 'high' — live-witnessed real data`, () => {
      expect(FLOW_MECHANISM_EVIDENCE[m].confidence).toBe('high');
      expect(FLOW_MECHANISM_EVIDENCE[m].evidence.length).toBeGreaterThan(0);
    });
  }

  it("button.page is 'medium' — structured/typed, not live-witnessed for this specific variant", () => {
    expect(FLOW_MECHANISM_EVIDENCE['button.page'].confidence).toBe('medium');
    expect(FLOW_MECHANISM_EVIDENCE['button.page'].evidence).toMatch(/NOT live-witnessed|not yet confirmed live/);
  });

  it('exactly one mechanism is medium; every other mechanism is high (the tiering must not blur)', () => {
    const values = Object.values(FLOW_MECHANISM_EVIDENCE);
    expect(values.filter((v) => v.confidence === 'medium')).toHaveLength(1);
    expect(values.filter((v) => v.confidence === 'high')).toHaveLength(7);
  });
});

describe('buildFlowMap — reachability', () => {
  it('reports pages with zero incoming edges from the 4 typed sources', () => {
    const p1 = page({
      id: 1,
      alias: 'PAGE_ONE',
      branches: [branch({ target: { page: 2, url: null, items: null } })],
    });
    const p2 = page({ id: 2, alias: 'PAGE_TWO' });
    const p3 = page({ id: 3, alias: 'PAGE_THREE' }); // never targeted
    const result = buildFlowMap(ast([p1, p2, p3]));
    // page 1 has no incoming edge either (nothing targets it) -- both 1 and 3 are orphaned, 2 is not.
    expect(result.reachability.pagesWithNoIncomingEdges.sort()).toEqual([1, 3]);
  });

  it('a URL/unresolved target never counts as incoming to any page', () => {
    const p1 = page({
      id: 1,
      alias: 'PAGE_ONE',
      branches: [branch({ target: { page: null, url: 'https://example.com', items: null } })],
    });
    const result = buildFlowMap(ast([p1]));
    expect(result.reachability.pagesWithNoIncomingEdges).toEqual([1]);
  });
});

describe('buildFlowMap — determinism', () => {
  it('the same ApexAppAst produces a byte-identical FlowMap twice', () => {
    const p1 = page({
      id: 1,
      alias: 'PAGE_ONE',
      branches: [branch({ target: { page: 2, url: null, items: null } })],
      regions: [
        region({
          identifier: 'r1',
          actions: [regionAction({ identifier: 'a1', target: { page: 2, items: null, clearCache: null } })],
          columns: [reportColumn({ identifier: 'c1', linkTarget: { page: 2, items: null, clearCache: null, url: null } })],
        }),
      ],
      buttons: [button({ identifier: 'b1', url: 'https://example.com' })],
    });
    const p2 = page({ id: 2, alias: 'PAGE_TWO' });
    const a = ast([p1, p2]);
    expect(JSON.stringify(buildFlowMap(a))).toBe(JSON.stringify(buildFlowMap(a)));
  });
});

describe('computeFlowMap — against the real committed reference fixture', () => {
  const exportDir = join(__dirname, 'fixtures', 'reference-fixtures');

  it('parses without throwing and returns the one real page as a node', () => {
    const result = computeFlowMap(exportDir);
    expect(result.nodes).toEqual([{ id: 'page:3', pageId: 3, alias: 'EMPLOYEE', name: 'Employee' }]);
    // This fixture has no branches/region-actions/column-links/button-targets -- zero edges is the honest result.
    expect(result.edges).toEqual([]);
    expect(result.reachability.pagesWithNoIncomingEdges).toEqual([3]);
  });

  it('is deterministic — regenerating twice produces a byte-identical FlowMap', () => {
    expect(JSON.stringify(computeFlowMap(exportDir))).toBe(JSON.stringify(computeFlowMap(exportDir)));
  });
});
