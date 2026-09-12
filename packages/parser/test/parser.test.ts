import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseApp, parseApxFile } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = readFileSync(join(here, 'fixtures', 'p00003-employee.apx'), 'utf8');

describe('provisional APEXlang parser (fixture derived from Oracle 26.1 docs)', () => {
  const result = parseApp({ 'p00003-employee.apx': fixture });

  it('parses with no warnings', () => {
    expect(result.warnings).toEqual([]);
  });

  it('projects the page with id, alias, and flattened group props', () => {
    expect(result.ast.pages).toHaveLength(1);
    const page = result.ast.pages[0];
    expect(page.id).toBe(3);
    expect(page.alias).toBe('EMPLOYEE');
    expect(page.raw['appearance.pageMode']).toBe('modalDialog');
    expect(page.raw['appearance.dialogTemplate']).toEqual({ ref: '/drawer', standard: true });
    expect(page.raw['appearance.templateOptions']).toEqual([
      '#DEFAULT#',
      'js-dialog-class-t-Drawer--pullOutEnd',
    ]);
    expect(page.raw['dialog.chained']).toBe(false);
  });

  it('projects the form region with source and identifier', () => {
    const region = result.ast.pages[0].regions[0];
    expect(region.identifier).toBe('employee');
    expect(region.type).toBe('form');
    expect(region.source).toEqual({ location: 'localDatabase', tableName: 'EMP', sql: null });
  });

  it('projects items including hidden PK, required flag, and source column', () => {
    const [empno, ename] = result.ast.pages[0].regions[0].items;
    expect(empno.identifier).toBe('P3_EMPNO');
    expect(empno.type).toBe('hidden');
    expect(empno.sourceColumn).toBe('EMPNO');
    expect(ename.required).toBe(true);
    expect(ename.label).toBe('Name');
  });

  it('projects buttons', () => {
    const [save] = result.ast.pages[0].regions[0].buttons;
    expect(save.identifier).toBe('save');
    expect(save.action).toBe('submit');
  });

  it('deterministic: same input -> same JSON output', () => {
    const again = parseApp({ 'p00003-employee.apx': fixture });
    expect(JSON.stringify(again.ast)).toBe(JSON.stringify(result.ast));
  });
});

describe('lossless handling of unrecognized top-level input', () => {
  it('preserves the original line in a synthetic raw node as well as warning', () => {
    const result = parseApp({ 'unknown.apx': '  syntax the parser does not recognize  ' });
    expect(result.warnings).toHaveLength(1);
    expect(result.tree).toEqual([
      {
        type: '#unparsed',
        identifier: null,
        props: { line: '  syntax the parser does not recognize  ' },
        children: [],
        loc: { file: 'unknown.apx', line: 1 },
      },
    ]);
    expect(result.ast.unmodeled).toContain('#unparsed');
  });
});

describe('semantic identity validation', () => {
  it('rejects duplicate page ids before downstream generators can overwrite files', () => {
    expect(() =>
      parseApp({
        'pages/first.apx': 'page first (\n page: 1\n alias: FIRST\n)\n',
        'pages/second.apx': 'page second (\n page: 1\n alias: SECOND\n)\n',
      }),
    ).toThrow(/pages\/second\.apx:1: duplicate page id 1.*pages\/first\.apx:1/);
  });

  it('rejects duplicate page-scoped component identifiers before Map projection loses one', () => {
    expect(() =>
      parseApp({
        'pages/duplicate-region.apx': `page duplicate-region (
  page: 1
  alias: DUPLICATE-REGION
  region results (
    type: cards
  )
  region results (
    type: interactiveReport
  )
)`,
      }),
    ).toThrow(/duplicate page 1 region identifier 'results'/);
  });

  it('rejects multiple application roots instead of silently keeping the last one', () => {
    expect(() =>
      parseApp({
        'application.apx': 'app first (\n runtime {\n  friendlyUrls: true\n }\n)\n',
        'other-application.apx': 'app second (\n runtime {\n  friendlyUrls: true\n }\n)\n',
      }),
    ).toThrow(/duplicate app component/);
  });
});

describe('quoted multi-word component identifiers (Interactive Grid row-selector column)', () => {
  // Reproduces a real bug found via Oracle's "Sample Interactive Grids" gallery
  // app: `column "Row Header" (` -- a quoted, space-containing identifier --
  // didn't match COMPONENT_OPEN (identifier alternative was a single \S+
  // token), which desynced parseBody: the column's own `type: rowSelector`
  // and `layout { sequence }` props leaked onto the ENCLOSING region
  // (silently overwriting the region's real `type`), and the column's
  // closing `)` was consumed as the region's own closer, orphaning
  // everything declared after it (here: the `next` button).
  const apxWithQuotedColumnIdentifier = `page 6 (
  page: 6
  name: Row Header
  alias: ROW-HEADER
  region grid (
    type: interactiveGrid
    column "Row Header" (
      type: rowSelector
      layout {
        sequence: 10
      }
    )
  )
  button next (
    label: Next
    layout {
      region: @grid
    }
  )
)`;

  it('parses with no warnings', () => {
    const warnings: import('../src/index.js').ParseIssue[] = [];
    parseApxFile('p00006-row-header.apx', apxWithQuotedColumnIdentifier, warnings);
    expect(warnings).toEqual([]);
  });

  it('unquotes the identifier on the quoted component itself', () => {
    const warnings: import('../src/index.js').ParseIssue[] = [];
    const [page] = parseApxFile('p00006-row-header.apx', apxWithQuotedColumnIdentifier, warnings);
    const [region] = page.children.filter((c) => c.type === 'region');
    const [column] = region.children.filter((c) => c.type === 'column');
    expect(column.identifier).toBe('Row Header');
  });

  it('does not let the quoted column desync the enclosing region (type stays correct)', () => {
    const result = parseApp({ 'p00006-row-header.apx': apxWithQuotedColumnIdentifier });
    const [page] = result.ast.pages;
    const [region] = page.regions;
    expect(region.type).toBe('interactiveGrid');
  });

  it('does not orphan components declared after the quoted column', () => {
    const result = parseApp({ 'p00006-row-header.apx': apxWithQuotedColumnIdentifier });
    const [page] = result.ast.pages;
    expect(page.buttons.map((b) => b.identifier)).toEqual(['next']);
  });
});

describe('typed Dynamic Action support', () => {
  // Reproduces the real structure found in Oracle's "Sample Dynamic
  // Actions" gallery app (page 3, "commission-for-salesman-only"): a
  // conditional DA with two true-actions and two false-actions.
  const apxWithDynamicAction = `page 3 (
  page: 3
  name: Edit
  alias: EDIT

  dynamicAction commission-for-salesman-only (
    name: Commission for Salesman Only
    execution {
      sequence: 10
    }
    when {
      selectionType: items
      items: P3_JOB
    }
    clientSideCondition {
      type: item=value
      item: P3_JOB
      value: SALESMAN
    }

    action native-disable (
      action: disable
      affectedElements {
        selectionType: items
        items: P3_COMM
      }
      execution {
        sequence: 10
        fireWhenEventResultIs: false
      }
    )

    action native-enable (
      action: enable
      affectedElements {
        selectionType: items
        items: P3_COMM
      }
      execution {
        sequence: 10
      }
    )
  )
)`;

  it('parses with no warnings and removes dynamicAction from unmodeled', () => {
    const result = parseApp({ 'p00003-edit.apx': apxWithDynamicAction });
    expect(result.warnings).toEqual([]);
    expect(result.ast.unmodeled).not.toContain('dynamicAction');
    expect(result.ast.unmodeled).not.toContain('action');
  });

  it('projects the trigger (when block) and clientSideCondition', () => {
    const result = parseApp({ 'p00003-edit.apx': apxWithDynamicAction });
    const [da] = result.ast.pages[0].dynamicActions;
    expect(da.identifier).toBe('commission-for-salesman-only');
    expect(da.name).toBe('Commission for Salesman Only');
    expect(da.when).toEqual({
      selectionType: 'items',
      items: ['P3_JOB'],
      button: null,
      region: null,
      event: null,
      customEvent: null,
    });
    expect(da.clientSideCondition).toEqual({ type: 'item=value', item: 'P3_JOB', value: 'SALESMAN' });
  });

  it('projects customEvent when the trigger event is "custom"', () => {
    // Confirmed live pattern (interactive-grids, sample-calendar):
    // event: custom / customEvent: <the real event name>.
    const apxWithCustomEvent = `page 51 (
  page: 51
  name: Client Validation
  alias: CLIENT-VALIDATION

  dynamicAction refresh-on-record-edit (
    name: Refresh on Record Edit
    execution {
      sequence: 30
    }
    when {
      selectionType: items
      items: P51_ITEM
      event: custom
      customEvent: apexendrecordedit
    }

    action native-refresh (
      action: refresh
      affectedElements {
        selectionType: region
        region: @report
      }
    )
  )
)`;
    const result = parseApp({ 'p00051-client-validation.apx': apxWithCustomEvent });
    expect(result.warnings).toEqual([]);
    const [da] = result.ast.pages[0].dynamicActions;
    expect(da.when.event).toBe('custom');
    expect(da.when.customEvent).toBe('apexendrecordedit');
  });

  it('projects nested actions, including fireWhenEventResultIs', () => {
    const result = parseApp({ 'p00003-edit.apx': apxWithDynamicAction });
    const [da] = result.ast.pages[0].dynamicActions;
    expect(
      da.actions.map((a) => ({ id: a.identifier, name: a.name, action: a.action, fire: a.fireWhenEventResultIs })),
    ).toEqual([
      { id: 'native-disable', name: null, action: 'disable', fire: false },
      { id: 'native-enable', name: null, action: 'enable', fire: null },
    ]);
  });

  it('projects an action-level name, distinct from the parent dynamicAction name', () => {
    // Confirmed real: 56/509 real actions across every export this
    // project has parsed have their own name.
    const apxWithActionName = `page 3 (
  page: 3
  name: Edit
  alias: EDIT4

  dynamicAction commission-for-salesman-only (
    name: Commission for Salesman Only
    when {
      selectionType: items
      items: P3_JOB
    }

    action native-disable (
      name: Disable Commission Field
      action: disable
      affectedElements {
        selectionType: items
        items: P3_COMM
      }
    )
  )
)`;
    const result = parseApp({ 'p00003-edit.apx': apxWithActionName });
    const [da] = result.ast.pages[0].dynamicActions;
    expect(da.actions[0].name).toBe('Disable Commission Field');
  });

  it('reports null clientSideCondition when the DA is unconditional', () => {
    const unconditional = apxWithDynamicAction
      .replace(/clientSideCondition \{[^}]*\}\n\s*/, '')
      .replace('EDIT', 'EDIT2');
    const result = parseApp({ 'p00003-edit.apx': unconditional });
    const [da] = result.ast.pages[0].dynamicActions;
    expect(da.clientSideCondition).toBeNull();
  });
});

describe('typed Calendar region settings', () => {
  // Reproduces the real structure found in Oracle's "Sample Calendar"
  // gallery app (page 32, "sessions" region, WEEKLY-CALENDAR-DRAG-DROP
  // variant, dragAndDrop: true).
  const apxWithCalendar = `page 32 (
  page: 32
  name: Week Calendar
  alias: WEEK-CALENDAR

  region sessions (
    name: Sessions
    type: calendar
    source {
      location: localDatabase
      type: sqlQuery
      sqlQuery:
        \`\`\`sql
        select id, title, start_date, end_date from eba_demo_cal_sessions
        \`\`\`
    }
    settings {
      displayColumn: TITLE
      startDateColumn: START_DATE
      endDateColumn: END_DATE
      pkColumn: ID
      showTime: true
      calendarViewsAndNavigation: [
        week
        day
        list
        navigation
      ]
      dragAndDrop: true
    }
  )
)`;

  it('parses with no warnings and projects calendarSettings for a calendar region', () => {
    const result = parseApp({ 'p00032-week-calendar.apx': apxWithCalendar });
    expect(result.warnings).toEqual([]);
    const [region] = result.ast.pages[0].regions;
    expect(region.type).toBe('calendar');
    expect(region.calendarSettings).toEqual({
      displayColumn: 'TITLE',
      startDateColumn: 'START_DATE',
      endDateColumn: 'END_DATE',
      pkColumn: 'ID',
      showTime: true,
      views: ['week', 'day', 'list', 'navigation'],
      dragAndDrop: true,
    });
  });

  it('does not populate calendarSettings for a non-calendar region, even with a settings group', () => {
    const apxWithOtherSettings = apxWithCalendar.replace('type: calendar', 'type: interactiveGrid');
    const result = parseApp({ 'p00032-week-calendar.apx': apxWithOtherSettings });
    const [region] = result.ast.pages[0].regions;
    expect(region.type).toBe('interactiveGrid');
    expect(region.calendarSettings).toBeNull();
  });
});

describe('typed Chart region settings', () => {
  it('projects an explicit chart type', () => {
    const apx = `page 1 (
  page: 1
  name: Test
  alias: TEST
  region r (
    type: chart
    chart {
      type: pie
    }
  )
)`;
    const result = parseApp({ 'p1.apx': apx });
    expect(result.warnings).toEqual([]);
    const [region] = result.ast.pages[0].regions;
    expect(region.chartSettings).toEqual({ type: 'pie' });
  });

  it('defaults to "bar" when the chart {} group is entirely omitted', () => {
    // Confirmed live: Oracle's own "Sample Charts" gallery app has 16 bar
    // chart regions, none of which have a chart {} group at all.
    const apx = `page 1 (
  page: 1
  name: Test
  alias: TEST
  region r (
    type: chart
    layout {
      sequence: 10
    }
  )
)`;
    const result = parseApp({ 'p1.apx': apx });
    expect(result.warnings).toEqual([]);
    const [region] = result.ast.pages[0].regions;
    expect(region.chartSettings).toEqual({ type: 'bar' });
  });

  it('does not populate chartSettings for a non-chart region', () => {
    const apx = `page 1 (
  page: 1
  name: Test
  alias: TEST
  region r (
    type: interactiveReport
  )
)`;
    const result = parseApp({ 'p1.apx': apx });
    const [region] = result.ast.pages[0].regions;
    expect(region.chartSettings).toBeNull();
  });
});

describe('region.htmlDomId (advanced { htmlDomId: ... })', () => {
  // Confirmed live against the real "Sample Charts" app: this is the
  // deterministic root cause of the previously-open "runtime region id
  // differs from .apx identifier" question (docs/quirks/26.1.json
  // 'region-id-not-static-id') -- when set, it predicts the widget
  // container id (`<htmlDomId>_jet` for Chart, `<htmlDomId>_ig` for
  // Interactive Grid).
  it('projects an explicit htmlDomId override', () => {
    const apx = `page 1 (
  page: 1
  name: Test
  alias: TEST
  region pie-chart (
    type: chart
    advanced {
      htmlDomId: pie1
      regionDisplaySelector: true
    }
    chart {
      type: pie
    }
  )
)`;
    const result = parseApp({ 'p1.apx': apx });
    expect(result.warnings).toEqual([]);
    const [region] = result.ast.pages[0].regions;
    expect(region.htmlDomId).toBe('pie1');
  });

  it('is null when no advanced { } group is present', () => {
    // Confirmed live: 66/97 real chart regions in Oracle's own "Sample
    // Charts" app have no advanced { } override at all -- the runtime id
    // for these is an APEX-internal auto-generated numeric id with no
    // corresponding field anywhere in the static .apx export.
    const apx = `page 1 (
  page: 1
  name: Test
  alias: TEST
  region colors-set-via-js-code (
    type: chart
    chart {
      type: pie
    }
  )
)`;
    const result = parseApp({ 'p1.apx': apx });
    expect(result.warnings).toEqual([]);
    const [region] = result.ast.pages[0].regions;
    expect(region.htmlDomId).toBeNull();
  });

  it('is not gated on region type -- applies equally to Interactive Grid', () => {
    const apx = `page 1 (
  page: 1
  name: Test
  alias: TEST
  region basic-editing (
    type: interactiveGrid
    advanced {
      htmlDomId: emp
    }
  )
)`;
    const result = parseApp({ 'p1.apx': apx });
    expect(result.warnings).toEqual([]);
    const [region] = result.ast.pages[0].regions;
    expect(region.htmlDomId).toBe('emp');
  });
});

describe('button.htmlDomId (advanced { htmlDomId: ... })', () => {
  // Confirmed against the official EBNF's button-advanced-property
  // production -- the SAME advanced { htmlDomId } shape already confirmed
  // for regions (ADR-003), applied to buttons. UNLIKE the region case, no
  // real button anywhere in this project's local corpus (46+ real
  // exports) has ever been found to actually set this -- see the doc
  // comment on ApexButton.htmlDomId and docs/quirks/26.1.json
  // `button-id-not-static-id`. These tests cover the field mechanically
  // (populated + absent), matching the same shape already tested for
  // region.htmlDomId, not a live-verified positive case.
  it('projects an explicit htmlDomId override when present', () => {
    const apx = `page 1 (
  page: 1
  name: Test
  alias: TEST
  region employee (
    type: form
    button save (
      label: Save
      action: submit
      advanced {
        htmlDomId: mySaveButton
      }
    )
  )
)`;
    const result = parseApp({ 'p1.apx': apx });
    expect(result.warnings).toEqual([]);
    const [button] = result.ast.pages[0].regions[0].buttons;
    expect(button.htmlDomId).toBe('mySaveButton');
  });

  it('is null when no advanced { } group is present -- the confirmed-common real-world case', () => {
    const apx = `page 1 (
  page: 1
  name: Test
  alias: TEST
  region employee (
    type: form
    button save (
      label: Save
      action: submit
    )
  )
)`;
    const result = parseApp({ 'p1.apx': apx });
    expect(result.warnings).toEqual([]);
    const [button] = result.ast.pages[0].regions[0].buttons;
    expect(button.htmlDomId).toBeNull();
  });
});

describe('typed button redirect target (behavior.target / behavior.targetUrl)', () => {
  // Navigation Graph prerequisite pass (Thirteenth round's Decision 2,
  // docs/ecosystem-roadmap.md, 2026-08-12): the same `{ page, items,
  // clearCache }` nested shape already confirmed for
  // branch/column/regionAction `target`, applied to buttons via the same
  // shared `projectPageTarget()` helper, per apexlang.ebnf:2578-2589
  // (`button-behavior-property`, full production checked).
  it('projects a nested page-redirect target for behavior.action = redirectThisApp', () => {
    // NOT re-witnessed live this pass -- no real redirectThisApp/
    // redirectOtherApp button was found anywhere in this session's one
    // directly-accessible corpus app (ux-pattern-catalog, matching the
    // Eleventh round's identical finding). Typed on the strength of the
    // EBNF production + the already-proven projectPageTarget() shape
    // (see ApexButtonTarget's doc comment for the full evidence tiering).
    // UPDATE (Fourteenth round, docs/ecosystem-roadmap.md): redirectThisApp
    // WAS since real-data-confirmed via concurrent-manager (17 occurrences,
    // 12 pages) -- see ApexButtonTarget's corrected doc comment. This test
    // fixture itself was never inaccurate, only the "not yet witnessed"
    // framing above is now historical, not current.
    const apx = `page 1 (
  page: 1
  name: Test
  alias: TEST
  region employee (
    type: form
    button view-employee (
      label: View Employee
      behavior {
        action: redirectThisApp
        target: {
          page: 3
          items: {
            P3_EMPNO: &EMPNO.
          }
          clearCache: 3
        }
      }
    )
  )
)`;
    const result = parseApp({ 'p1.apx': apx });
    expect(result.warnings).toEqual([]);
    const [button] = result.ast.pages[0].regions[0].buttons;
    expect(button.action).toBe('redirectThisApp');
    expect(button.target).toEqual({ page: 3, items: { P3_EMPNO: '&EMPNO.' }, clearCache: '3' });
    expect(button.url).toBeNull();
  });

  it('projects a flat url (behavior.targetUrl) for behavior.action = redirectUrl, with target null -- reproduces ux-pattern-catalog, pages/p00110-dashboard-simple.apx:1120-1141, button view-details', () => {
    const apx = `page 110 (
  page: 110
  name: Dashboard Simple
  alias: DASHBOARD-SIMPLE
  region chart-1 (
    type: chart
    button view-details (
      buttonName: VIEW_DETAILS_LINK
      label: View Details Link
      behavior {
        action: redirectUrl
        targetUrl: #
      }
    )
  )
)`;
    const result = parseApp({ 'p00110-dashboard-simple.apx': apx });
    expect(result.warnings).toEqual([]);
    const [button] = result.ast.pages[0].regions[0].buttons;
    expect(button.action).toBe('redirectUrl');
    expect(button.url).toBe('#');
    expect(button.target).toBeNull();
  });

  it('is null for both target and url when behavior has neither (e.g. a plain submitPage button)', () => {
    const apx = `page 1 (
  page: 1
  name: Test
  alias: TEST
  region employee (
    type: form
    button save (
      label: Save
      behavior {
        warnOnUnsavedChanges: doNotCheck
      }
    )
  )
)`;
    const result = parseApp({ 'p1.apx': apx });
    expect(result.warnings).toEqual([]);
    const [button] = result.ast.pages[0].regions[0].buttons;
    expect(button.target).toBeNull();
    expect(button.url).toBeNull();
  });
});

describe('multi-line array parsing (bug: first element dropped)', () => {
  // Reproduces a real, wide-reaching bug found via a calendar region's
  // `calendarViewsAndNavigation` array: when '[' is the LAST character on
  // the property line (nothing inline -- the array's own items and
  // closing ']' are each on their own line), the array's FIRST element
  // was silently dropped. Root cause: parseBody's PROPERTY branch already
  // advances the line index past the property line before calling
  // parseValue()/parseArray(), so the index already points at the array's
  // first content line -- but parseArray's loop did an unconditional
  // extra advance on its first (empty-inlineRest) iteration, skipping
  // that line. This exact shape (`templateOptions: [` with items on
  // following lines) appears 1500+ times across every real export this
  // project has parsed -- `#DEFAULT#`, almost always the first
  // templateOption, was silently missing from `raw` bags project-wide
  // until this fix.
  const apxWithMultilineArray = `page 1 (
  page: 1
  name: Test
  alias: TEST
  region r (
    type: static
    appearance {
      templateOptions: [
        #DEFAULT#
        t-Region--noPadding
      ]
    }
  )
)`;

  it('keeps the first array element when the opening bracket has nothing after it on its line', () => {
    const result = parseApp({ 'p1.apx': apxWithMultilineArray });
    expect(result.warnings).toEqual([]);
    const [region] = result.ast.pages[0].regions;
    expect(region.raw['appearance.templateOptions']).toEqual(['#DEFAULT#', 't-Region--noPadding']);
  });

  it('still parses correctly when the first element IS inline with the bracket', () => {
    const apxInline = `page 1 (
  page: 1
  name: Test
  alias: TEST
  region r (
    type: static
    appearance {
      templateOptions: [#DEFAULT#
        t-Region--noPadding
      ]
    }
  )
)`;
    const result = parseApp({ 'p1.apx': apxInline });
    expect(result.warnings).toEqual([]);
    const [region] = result.ast.pages[0].regions;
    expect(region.raw['appearance.templateOptions']).toEqual(['#DEFAULT#', 't-Region--noPadding']);
  });

  it('still parses correctly when the whole array is on one line', () => {
    const apxOneLine = `page 1 (
  page: 1
  name: Test
  alias: TEST
  region r (
    type: static
    appearance {
      templateOptions: [#DEFAULT# t-Region--noPadding]
    }
  )
)`;
    const result = parseApp({ 'p1.apx': apxOneLine });
    expect(result.warnings).toEqual([]);
    const [region] = result.ast.pages[0].regions;
    expect(region.raw['appearance.templateOptions']).toEqual(['#DEFAULT#', 't-Region--noPadding']);
  });
});

describe('typed branch support (branch (...))', () => {
  // Reproduces real structure found in Oracle's own "customers" starter app
  // (github.com/oracle/apex, 26.1 branch, p00002-customer-details.apx:1848+):
  // three branches on one page, one with an alias-string page target and a
  // whenButtonPressed condition, one with a numeric page target + carried
  // items + clearCache/action, and one entirely unconditional with an
  // item-substitution-token page target (`&LAST_VIEW.`).
  const apxWithBranches = `page 2 (
  page: 2
  name: Customer Details
  alias: CUSTOMER-DETAILS

  branch (
    name: Go To CUSTOMERS after delete
    execution {
      sequence: 10
    }
    behavior {
      target: {
        page: CUSTOMERS
        successMessage: false
      }
    }
    serverSideCondition {
      whenButtonPressed: @delete
    }
  )

  branch (
    name: goto edit customer on create
    execution {
      sequence: 20
    }
    behavior {
      target: {
        page: 50
        items: {
          P50_ID: &P2_ID.
        }
        clearCache: 50
        action: resetPagination
        successMessage: false
      }
    }
    serverSideCondition {
      whenButtonPressed: @create
    }
  )

  branch (
    execution {
      sequence: 30
    }
    behavior {
      target: {
        page: &LAST_VIEW.
        request: &P2_REQUEST.
      }
      saveStateBeforeBranching: true
    }
  )
)`;

  it('parses with no warnings and removes branch from unmodeled', () => {
    const result = parseApp({ 'p00002-customer-details.apx': apxWithBranches });
    expect(result.warnings).toEqual([]);
    expect(result.ast.unmodeled).not.toContain('branch');
  });

  it('always has a null identifier -- confirmed real (branches never carry a component-id)', () => {
    const result = parseApp({ 'p00002-customer-details.apx': apxWithBranches });
    for (const branch of result.ast.pages[0].branches) {
      expect(branch.identifier).toBeNull();
    }
  });

  it('projects a page-alias-string target alongside a whenButtonPressed condition', () => {
    const result = parseApp({ 'p00002-customer-details.apx': apxWithBranches });
    const [first] = result.ast.pages[0].branches;
    expect(first.name).toBe('Go To CUSTOMERS after delete');
    expect(first.sequence).toBe(10);
    expect(first.target).toEqual({ page: 'CUSTOMERS', url: null, items: null, clearCache: null });
    expect(first.condition).toEqual({
      whenButtonPressed: 'delete',
      type: null,
      item: null,
      value: null,
      plsqlExpression: null,
    });
  });

  it('projects a numeric page target with carried items', () => {
    const result = parseApp({ 'p00002-customer-details.apx': apxWithBranches });
    const [, second] = result.ast.pages[0].branches;
    // This fixture's own `clearCache: 50` line was already present above
    // (customers starter app shape) but, before ApexBranchTarget.clearCache
    // was typed, was silently un-projected -- now asserted for real.
    expect(second.target).toEqual({ page: 50, url: null, items: { P50_ID: '&P2_ID.' }, clearCache: '50' });
  });

  it('projects an item-substitution-token page target with a null (unconditional) condition', () => {
    const result = parseApp({ 'p00002-customer-details.apx': apxWithBranches });
    const [, , third] = result.ast.pages[0].branches;
    expect(third.name).toBeNull();
    expect(third.target).toEqual({ page: '&LAST_VIEW.', url: null, items: null, clearCache: null });
    expect(third.condition).toBeNull();
  });

  it('projects an external URL redirect target (apextogo sign-out branch shape)', () => {
    const apx = `page 20000 (
  page: 20000
  name: Account
  alias: ACCOUNT

  branch (
    name: Go To Page &LOGOUT_URL.
    execution {
      sequence: 10
    }
    behavior {
      target: {
        type: url
        url: &LOGOUT_URL.
      }
    }
    serverSideCondition {
      whenButtonPressed: @sign-out
    }
  )
)`;
    const result = parseApp({ 'p20000-account.apx': apx });
    expect(result.warnings).toEqual([]);
    const [branch] = result.ast.pages[0].branches;
    expect(branch.target).toEqual({ page: null, url: '&LOGOUT_URL.', items: null, clearCache: null });
  });

  it('projects clearCache on a branch target -- reproduces concurrent-manager, pages/p00351-lookup-manager1.apx:960-975, branches "Redirect to new" (no clearCache) and "Redirect to all" (clearCache: 350)', () => {
    // Verbatim real structure re-confirmed directly against the raw export
    // text before this test was written -- see docs/grammar-assumptions.md
    // "Still open" -> resolved entry and ApexBranchTarget.clearCache's own
    // doc comment (packages/parser/src/ast.ts) for the full evidence trail.
    // This was a genuine parser gap: ApexBranchTarget never typed
    // `clearCache` at all, unlike its three siblings sharing
    // projectPageTarget() (ApexButtonTarget/ApexColumnLinkTarget/
    // ApexRegionActionTarget), even though real branches carry one.
    const apx = `page 351 (
  page: 351
  name: Lookup Manager
  alias: LOOKUP-MANAGER1

  branch (
    name: Redirect to new
    execution {
      sequence: 10
    }
    behavior {
      target: {
        page: 350
        items: {
          P350_LOOKUP_TYPE: &P351_LOOKUP_TYPE.
        }
        action: resetPagination
      }
    }
    serverSideCondition {
      whenButtonPressed: @create
    }
  )

  branch (
    name: Redirect to all
    execution {
      sequence: 20
    }
    behavior {
      target: {
        page: 350
        clearCache: 350
        action: resetPagination
      }
    }
    serverSideCondition {
      whenButtonPressed: @delete
    }
  )
)`;
    const result = parseApp({ 'p00351-lookup-manager1.apx': apx });
    expect(result.warnings).toEqual([]);
    const [redirectToNew, redirectToAll] = result.ast.pages[0].branches;
    expect(redirectToNew.target).toEqual({
      page: 350,
      url: null,
      items: { P350_LOOKUP_TYPE: '&P351_LOOKUP_TYPE.' },
      clearCache: null,
    });
    expect(redirectToAll.target).toEqual({ page: 350, url: null, items: null, clearCache: '350' });
  });
});

describe('typed validation support (validation <id> (...))', () => {
  // Reproduces real structure found in the user's own "concurrent-manager"
  // app (pages/p00010-request-submission.apx:530+): an itemIsNotNull
  // validation gated on whenButtonPressed, and a functionBody validation
  // whose error has no errorMessage of its own (associatedItem only).
  const apxWithValidations = `page 10 (
  page: 10
  name: Request Submission
  alias: REQUEST-SUBMISSION

  validation job-selected (
    name: Job selected
    execution {
      sequence: 10
    }
    validation {
      type: itemIsNotNull
      item: P10_JOB_CODE
      alwaysExecute: true
    }
    error {
      errorMessage: Program Should Have Value
      associatedItem: @P10_JOB_CODE
    }
    serverSideCondition {
      whenButtonPressed: @submit-request
    }
  )

  validation schedule-interval-required (
    name: "Schedule interval required "
    execution {
      sequence: 30
    }
    validation {
      type: itemIsNotNull
      item: P10_SCHEDULE_INTERVAL
      alwaysExecute: true
    }
    error {
      errorMessage: Interval / Expression Cannot be Null
      associatedItem: @P10_SCHEDULE_INTERVAL
    }
    serverSideCondition {
      whenButtonPressed: @submit-request
      type: item!=value
      item: P10_SCHEDULE_TYPE
      value: ONCE
    }
  )
)`;

  it('parses with no warnings and removes validation from unmodeled', () => {
    const result = parseApp({ 'p00010-request-submission.apx': apxWithValidations });
    expect(result.warnings).toEqual([]);
    expect(result.ast.unmodeled).not.toContain('validation');
  });

  it('always has a real identifier -- confirmed real (unlike branch, validation always carries a component-id)', () => {
    const result = parseApp({ 'p00010-request-submission.apx': apxWithValidations });
    expect(result.ast.pages[0].validations.map((v) => v.identifier)).toEqual([
      'job-selected',
      'schedule-interval-required',
    ]);
  });

  it('projects the rule (type/item), error, and whenButtonPressed-only condition', () => {
    const result = parseApp({ 'p00010-request-submission.apx': apxWithValidations });
    const [first] = result.ast.pages[0].validations;
    expect(first.type).toBe('itemIsNotNull');
    expect(first.item).toBe('P10_JOB_CODE');
    expect(first.column).toBeNull();
    expect(first.error).toEqual({
      message: 'Program Should Have Value',
      displayLocation: null,
      associatedItem: 'P10_JOB_CODE',
      associatedColumn: null,
    });
    expect(first.condition).toEqual({
      whenButtonPressed: 'submit-request',
      type: null,
      item: null,
      value: null,
      plsqlExpression: null,
    });
  });

  it('projects a compound condition (whenButtonPressed AND item!=value together)', () => {
    const result = parseApp({ 'p00010-request-submission.apx': apxWithValidations });
    const [, second] = result.ast.pages[0].validations;
    expect(second.name).toBe('Schedule interval required ');
    expect(second.condition).toEqual({
      whenButtonPressed: 'submit-request',
      type: 'item!=value',
      item: 'P10_SCHEDULE_TYPE',
      value: 'ONCE',
      plsqlExpression: null,
    });
  });

  it('reports null error and condition when neither block is present', () => {
    const apx = `page 1 (
  page: 1
  name: Test
  alias: TEST

  validation always-true (
    name: Always true
    validation {
      type: expression
      plsqlExpression: 1 = 1
    }
  )
)`;
    const result = parseApp({ 'p1.apx': apx });
    expect(result.warnings).toEqual([]);
    const [v] = result.ast.pages[0].validations;
    expect(v.error).toBeNull();
    expect(v.condition).toBeNull();
    expect(v.type).toBe('expression');
  });
});

describe('Oracle-documented page identity and lexical values', () => {
  it('projects application runtime metadata as first-class AST fields', () => {
    const result = parseApp({
      'application.apx': `app example (
  name: Example
  alias: EXAMPLE
  version: "1.0"
  type: standard
  runtime {
    friendlyUrls: false
    compatibilityMode: "26.1"
  }
)`,
    });
    expect(result.ast.application).toMatchObject({
      identifier: 'example',
      alias: 'EXAMPLE',
      runtime: { friendlyUrls: false, compatibilityMode: '26.1' },
      staticSubstitutions: [],
    });
  });

  it('projects Oracle-documented static application substitutions from top-level components', () => {
    // Raw APEX 26.1 EBNF: substitution-a has required `name` plus optional
    // `value.staticValue`. Real Oracle exports also use the component id as
    // the name and omit the direct property, reproduced by APP_NAME below.
    const result = parseApp({
      'application.apx': `app sample-reporting (
  name: Sample Reporting
  alias: SAMPLE-REPORTING
)
substitution APP_NAME (
  value {
    staticValue: Sample Reporting
  }
)
substitution product-label (
  name: PRODUCT_LABEL
  value {
    staticValue:
    \`\`\`text
    Sample
    Reporting
    \`\`\`
  }
)`,
    });

    expect(result.warnings).toEqual([]);
    expect(result.ast.application?.staticSubstitutions).toEqual([
      {
        identifier: 'APP_NAME',
        name: 'APP_NAME',
        staticValue: 'Sample Reporting',
        loc: { file: 'application.apx', line: 5 },
        raw: { 'value.staticValue': 'Sample Reporting' },
      },
      {
        identifier: 'product-label',
        name: 'PRODUCT_LABEL',
        staticValue: 'Sample\nReporting',
        loc: { file: 'application.apx', line: 10 },
        raw: {
          name: 'PRODUCT_LABEL',
          'value.staticValue': { lang: 'text', code: 'Sample\nReporting' },
        },
      },
    ]);
    expect(result.ast.unmodeled).not.toContain('substitution');
  });

  it('rejects duplicate static substitution names case-insensitively', () => {
    expect(() => parseApp({
      'application.apx': `app example (
  name: Example
)
substitution first (
  name: APP_NAME
  value {
    staticValue: First
  }
)
substitution second (
  name: app_name
  value {
    staticValue: Second
  }
)`,
    })).toThrow(/duplicate static application substitution name 'app_name'/);
  });

  it('represents friendlyUrls as null (unknown), never a guessed boolean, when the runtime group is absent or malformed', () => {
    // `runtime { }` is one of many OPTIONAL group blocks under `app` in the
    // EBNF (siblings: javaScript, css, authentication, ...) -- confirmed
    // real: oracle/apex's own 26.1 sample-reporting app export has no
    // `runtime { }` block at all (GitHub issue #21's reported app). This
    // must NOT throw; friendlyUrls must NOT be silently coerced to a
    // boolean either. See docs/grammar-assumptions.md
    // `app-runtime-group-is-optional`.
    expect(parseApp({
      'application.apx': 'app example (\n  name: Example\n  alias: EXAMPLE\n)',
    }).ast.application).toMatchObject({ runtime: { friendlyUrls: null } });
    expect(parseApp({
      'application.apx': 'app example (\n  runtime {\n    compatibilityMode: "26.1"\n  }\n)',
    }).ast.application).toMatchObject({ runtime: { friendlyUrls: null, compatibilityMode: '26.1' } });
    expect(parseApp({
      'application.apx': 'app example (\n  runtime {\n    friendlyUrls: "false"\n    compatibilityMode: "26.1"\n  }\n)',
    }).ast.application).toMatchObject({ runtime: { friendlyUrls: null } });
  });

  it('uses the required page property rather than the component identifier', () => {
    const result = parseApp({
      'page.apx': `page "example" (
  page: 42
  name: exampleName
  alias: value
  title: "Page title"
)`,
    });
    expect(result.ast.pages[0]).toMatchObject({ identifier: 'example', id: 42, title: 'Page title' });
  });

  it('decodes escaped quotes in component identifiers and quoted property keys', () => {
    const result = parseApp({
      'page.apx': `page "exa\\\"mple" (
  page: 42
  name: Example
  alias: EXAMPLE
  "P#EDIT\\\"PAGE#_ID": value
)`,
    });
    expect(result.ast.pages[0].identifier).toBe('exa"mple');
    expect(result.ast.pages[0].raw['P#EDIT"PAGE#_ID']).toBe('value');
  });

  it('rejects a page with no derivable page number', () => {
    expect(() => parseApp({ 'missing.apx': 'page example (\n  name: Example\n)' })).toThrow(/no derivable page number/);
    expect(() => parseApp({ 'invalid.apx': 'page example (\n  page: nope\n  name: Example\n)' })).toThrow(/no derivable page number/);
  });

  it('rejects a page whose component-id contradicts its interior page: property', () => {
    expect(() => parseApp({ 'contradiction.apx': 'page 1 (\n  page: 2\n  name: Example\n)' }))
      .toThrow(/component-id \(1\) contradicts its interior 'page:' property \(2\)/);
  });

  it('derives the page number from the component-id alone, matching real Oracle-generated exports', () => {
    // Real Oracle SQLcl/APEX exports never include an interior `page: N`
    // property -- confirmed against oracle/apex's own 26.1 sample-reporting
    // app (pages/p00001-interactive-report.apx opens `page 1 (` directly
    // followed by `name: ...`, no interior `page:` line). See
    // docs/quirks/26.1.json `page-number-not-required-property`.
    const result = parseApp({
      'p00001-interactive-report.apx': `page 1 (
    name: Interactive Report
    alias: INTERACTIVE-REPORT
    title: Interactive Report
)`,
    });
    expect(result.ast.pages[0]).toMatchObject({ identifier: '1', id: 1, alias: 'INTERACTIVE-REPORT' });
  });

  it('decodes quoted scalars and keeps whitespace inside quoted array values', () => {
    const result = parseApp({
      'quoted.apx': `page example (
  page: 42
  name: "Page \\"quoted\\" name"
  alias: VALUE
  appearance {
    cssClasses: [ "Some Value" "Another Value" plain ]
  }
)`,
    });
    expect(result.ast.pages[0].name).toBe('Page "quoted" name');
    expect(result.ast.pages[0].raw['appearance.cssClasses']).toEqual(['Some Value', 'Another Value', 'plain']);
  });

  it('accepts and losslessly preserves line and block comments without warnings', () => {
    const result = parseApp({
      'comments.apx': `// export note
/* multi
   line */
page example (
  page: 42
  name: Example
  // page note
  alias: VALUE
)`,
    });
    expect(result.warnings).toEqual([]);
    expect(result.tree.filter((node) => node.type === '#comment').map((node) => node.props.text)).toEqual([
      '// export note',
      '/* multi\n   line */',
    ]);
    expect(result.tree.find((node) => node.type === 'page')?.children.some((node) => node.type === '#comment')).toBe(true);
  });
});

describe('item.lovName (lov { type: sharedComponent, lov: @name })', () => {
  // Reproduces real structure found in the user's own "concurrent-manager"
  // app (pages/p00010-request-submission.apx:280+).
  it('projects the named LOV reference for a gated item type (selectList)', () => {
    const apx = `page 10 (
  page: 10
  name: Request Submission
  alias: REQUEST-SUBMISSION

  pageItem P10_SCHEDULE_TYPE (
    type: selectList
    lov {
      type: sharedComponent
      lov: @schedule-type-lov
    }
  )
)`;
    const result = parseApp({ 'p00010-request-submission.apx': apx });
    expect(result.warnings).toEqual([]);
    const [item] = result.ast.pages[0].items;
    expect(item.lovName).toBe('schedule-type-lov');
  });

  it('is null for an inline (non-shared) LOV, even on a gated item type', () => {
    const apx = `page 10 (
  page: 10
  name: Test
  alias: TEST

  pageItem P10_TEMPLATE_ID (
    type: selectList
    lov {
      type: staticValues
      staticValues:
        \`\`\`
        FOO;foo
        \`\`\`
    }
  )
)`;
    const result = parseApp({ 'p1.apx': apx });
    const [item] = result.ast.pages[0].items;
    expect(item.lovName).toBeNull();
  });

  it('is null for a shared LOV on an item type outside the gated scope', () => {
    // Confirmed real (not gated by this project's own choice): the
    // identical shape also occurs on checkboxGroup/selectOne/displayOnly/
    // shuttle/textFieldWithAutocomplete items. Stays in raw only.
    const apx = `page 10 (
  page: 10
  name: Test
  alias: TEST

  pageItem P10_STATUS (
    type: checkboxGroup
    lov {
      type: sharedComponent
      lov: @status-lov
    }
  )
)`;
    const result = parseApp({ 'p1.apx': apx });
    const [item] = result.ast.pages[0].items;
    expect(item.lovName).toBeNull();
    expect(item.raw['lov.lov']).toEqual({ ref: 'status-lov', standard: false });
  });
});

describe('typed process support (process <id> (...))', () => {
  // Reproduces real structure found in Oracle's own "customers" starter app
  // (github.com/oracle/apex, 26.1 branch, p00002-customer-details.apx:1801+):
  // an autoRowFetch process with no condition, and an autoRowProcessing
  // process (whose EBNF-undocumented `target { }` group is confirmed real
  // and now typed on ApexProcess.target -- see GitHub issue #5) gated on an
  // authorization scheme rather than a serverSideCondition.
  const apxWithProcesses = `page 2 (
  page: 2
  name: Customer Details
  alias: CUSTOMER-DETAILS

  process fetch-row-from-eba-cust-customers (
    name: Fetch Row from EBA_CUST_CUSTOMERS
    type: autoRowFetch
    source {
      tableName: EBA_CUST_CUSTOMERS
      pkColumn: ID
      pkItem: P2_ID
    }
    execution {
      sequence: 10
      point: afterHeader
    }
    error {
      errorMessage: Unable to fetch row.
    }
  )

  process process-row-of-eba-cust-customers (
    name: Process Row of EBA_CUST_CUSTOMERS
    type: autoRowProcessing
    target {
      tableName: EBA_CUST_CUSTOMERS
      pkColumn: ID
      pkItem: P2_ID
      returnKeyIntoItem: P2_ID
    }
    execution {
      sequence: 20
    }
    security {
      authorizationScheme: @contribution-rights
    }
  )
)`;

  it('parses with no warnings and removes process from unmodeled', () => {
    const result = parseApp({ 'p00002-customer-details.apx': apxWithProcesses });
    expect(result.warnings).toEqual([]);
    expect(result.ast.unmodeled).not.toContain('process');
  });

  it('always has a real identifier -- confirmed real (like validation, unlike branch)', () => {
    const result = parseApp({ 'p00002-customer-details.apx': apxWithProcesses });
    expect(result.ast.pages[0].processes.map((p) => p.identifier)).toEqual([
      'fetch-row-from-eba-cust-customers',
      'process-row-of-eba-cust-customers',
    ]);
  });

  it('projects type/sequence/point and reports a null condition when no serverSideCondition block exists', () => {
    const result = parseApp({ 'p00002-customer-details.apx': apxWithProcesses });
    const [first] = result.ast.pages[0].processes;
    expect(first.name).toBe('Fetch Row from EBA_CUST_CUSTOMERS');
    expect(first.type).toBe('autoRowFetch');
    expect(first.sequence).toBe(10);
    expect(first.point).toBe('afterHeader');
    expect(first.condition).toBeNull();
  });

  it('types the EBNF-undocumented target {} group on autoRowProcessing (GitHub issue #5)', () => {
    const result = parseApp({ 'p00002-customer-details.apx': apxWithProcesses });
    const [first, second] = result.ast.pages[0].processes;
    expect(second.type).toBe('autoRowProcessing');
    expect(second.condition).toBeNull();
    expect(second.target).toEqual({
      tableName: 'EBA_CUST_CUSTOMERS',
      pkColumn: 'ID',
      pkItem: 'P2_ID',
      returnKeyIntoItem: 'P2_ID',
    });
    // still preserved in raw too -- typing is additive, never destructive (ADR-001)
    expect(second.raw['target.tableName']).toBe('EBA_CUST_CUSTOMERS');
    // autoRowFetch's group is named `source {}`, not `target {}` -- a
    // DIFFERENT real group (own pkColumn/pkItem, no returnKeyIntoItem) that
    // this field must not conflate with target.
    expect(first.target).toBeNull();
  });

  it('projects a whenButtonPressed-gated process condition', () => {
    const apx = `page 10 (
  page: 10
  name: Request Submission
  alias: REQUEST-SUBMISSION

  process new (
    name: New_1
    type: executeCode
    execution {
      sequence: 10
    }
    serverSideCondition {
      whenButtonPressed: @submit-request
    }
  )
)`;
    const result = parseApp({ 'p10.apx': apx });
    expect(result.warnings).toEqual([]);
    const [p] = result.ast.pages[0].processes;
    expect(p.condition).toEqual({
      whenButtonPressed: 'submit-request',
      type: null,
      item: null,
      value: null,
      plsqlExpression: null,
    });
  });
});

describe('typed computation support (computation <id> (...))', () => {
  // Reproduces real structure found in Oracle's own "customers" starter app
  // (p00001-dashboard.apx:3456+): an explicit staticValue computation, and
  // (p00050-customer.apx:5058+) a real computation whose `computation {}`
  // group has NO `type:` line at all -- only `sqlQuery` -- confirmed real,
  // an implicit sqlQuerySingleValue default (see ApexComputation's doc
  // comment).
  const apxWithComputations = `page 1 (
  page: 1
  name: Dashboard
  alias: DASHBOARD

  computation last-view (
    itemName: LAST_VIEW
    execution {
      sequence: 10
      point: beforeHeader
    }
    computation {
      type: staticValue
      staticValue: 1
    }
  )
)`;

  it('parses with no warnings and removes computation from unmodeled', () => {
    const result = parseApp({ 'p00001-dashboard.apx': apxWithComputations });
    expect(result.warnings).toEqual([]);
    expect(result.ast.unmodeled).not.toContain('computation');
  });

  it('always has a real identifier -- confirmed real (like validation/process, unlike branch)', () => {
    const result = parseApp({ 'p00001-dashboard.apx': apxWithComputations });
    const [c] = result.ast.pages[0].computations;
    expect(c.identifier).toBe('last-view');
    expect(c.itemName).toBe('LAST_VIEW');
    expect(c.sequence).toBe(10);
    expect(c.type).toBe('staticValue');
    expect(c.condition).toBeNull();
  });

  it('projects type as null when the computation {} group has no type line (confirmed real omission, implicit sqlQuerySingleValue default)', () => {
    const apx = `page 50 (
  page: 50
  name: Customer
  alias: CUSTOMER

  computation customer (
    itemName: CUSTOMER
    execution {
      sequence: 10
      point: beforeHeader
    }
    computation {
      sqlQuery:
        \`\`\`sql
        select apex_escape.html(customer_name) from eba_cust_customers where id = :P50_ID
        \`\`\`
    }
  )
)`;
    const result = parseApp({ 'p50.apx': apx });
    expect(result.warnings).toEqual([]);
    const [c] = result.ast.pages[0].computations;
    expect(c.type).toBeNull();
    expect(c.raw['computation.sqlQuery']).toEqual({
      lang: 'sql',
      code: 'select apex_escape.html(customer_name) from eba_cust_customers where id = :P50_ID',
    });
  });
});

describe('typed report column support (column <id> (...), nested inside a region)', () => {
  // Reproduces real structure found in Oracle's own "opportunities" starter
  // app (p00002-accounts.apx:740+): a link-type column whose `link.target`
  // is a nested object (page/items/clearCache/action), the same real-
  // data-vs-opaque-EBNF-<value> shape already confirmed for branch.target.
  const apxWithColumns = `page 2 (
  page: 2
  name: Accounts
  alias: ACCOUNTS

  region accounts-report (
    name: Accounts
    type: interactiveReport

    column CUSTOMER_NAME (
      type: link
      heading {
        heading: Account
      }
      layout {
        sequence: 30
      }
      link {
        target: {
          page: 94
          items: {
            P94_ID: #ID#
          }
          clearCache: 94
          action: resetPagination
        }
        linkText: #CUSTOMER_NAME#
      }
    )

    column CUSTOMER_TERRITORY_ID (
      type: hidden
    )
  )
)`;

  it('parses with no warnings and removes column from unmodeled', () => {
    const result = parseApp({ 'p00002-accounts.apx': apxWithColumns });
    expect(result.warnings).toEqual([]);
    expect(result.ast.unmodeled).not.toContain('column');
  });

  it('the identifier IS the columnName -- confirmed real (columnName is never a real body property)', () => {
    const result = parseApp({ 'p00002-accounts.apx': apxWithColumns });
    const [region] = result.ast.pages[0].regions;
    expect(region.columns.map((c) => c.identifier)).toEqual([
      'CUSTOMER_NAME',
      'CUSTOMER_TERRITORY_ID',
    ]);
    expect(region.columns[0]!.raw['columnName']).toBeUndefined();
  });

  it('projects heading/sequence/type and a nested link.target', () => {
    const result = parseApp({ 'p00002-accounts.apx': apxWithColumns });
    const [region] = result.ast.pages[0].regions;
    const [first] = region.columns;
    expect(first!.type).toBe('link');
    expect(first!.heading).toBe('Account');
    expect(first!.sequence).toBe(30);
    expect(first!.linkTarget).toEqual({
      page: 94,
      items: { P94_ID: '#ID#' },
      clearCache: '94',
      url: null,
    });
  });

  it('reports a null linkTarget/heading for a hidden column with no link/heading group', () => {
    const result = parseApp({ 'p00002-accounts.apx': apxWithColumns });
    const [region] = result.ast.pages[0].regions;
    const [, second] = region.columns;
    expect(second!.type).toBe('hidden');
    expect(second!.linkTarget).toBeNull();
    expect(second!.heading).toBeNull();
  });

  it('projects a flat, external-URL link.target (bug fix: ApexColumnLinkTarget.url) -- reproduces ux-pattern-catalog, pages/p00320-item-detail-full.apx:459-464, region child-records, column CHILD_RECORD_NAME', () => {
    // Before this fix, `ApexColumnLinkTarget`'s own doc comment claimed "no
    // external-URL variant is defined anywhere in any column-link
    // production" -- WRONG, per this real counter-example (Navigation Graph
    // prerequisite pass, Eleventh round, docs/ecosystem-roadmap.md,
    // 2026-08-11/12). `projectColumn()`/`projectPageTarget()` used to
    // silently return `{page:null, items:null, clearCache:null}` for this
    // shape (the `url` value stayed in `raw`, ADR-001-compliant, but the
    // typed field was empty/misleading). Confirmed against the FULL
    // `link.target` shape, including the sibling `linkText` property outside
    // `target` -- matches the real export exactly, not a narrowed
    // reproduction.
    const apx = `page 320 (
  page: 320
  name: Item Detail Full
  alias: ITEM-DETAIL-FULL

  region child-records (
    name: Child Records
    type: classicReport

    column CHILD_RECORD_NAME (
      type: link
      layout {
        sequence: 20
      }
      link {
        target: {
          type: url
          url: #
        }
        linkText: #CHILD_RECORD_NAME#
      }
    )
  )
)`;
    const result = parseApp({ 'p00320-item-detail-full.apx': apx });
    expect(result.warnings).toEqual([]);
    const [region] = result.ast.pages[0].regions;
    const [column] = region.columns;
    expect(column!.identifier).toBe('CHILD_RECORD_NAME');
    expect(column!.linkTarget).toEqual({ page: null, items: null, clearCache: null, url: '#' });
    // The url value was always present in raw (ADR-001) -- confirming this
    // fix is additive, not a change to raw's own contents.
    expect(column!.raw['link.target.url']).toBe('#');
  });
});

describe('typed region action support (action <id> (...), nested inside Cards/List regions)', () => {
  // Reproduces real structure found in Oracle's own "sample-cards" gallery
  // app: a Cards-region action with an explicit `type` and a page-target
  // redirect (p00002-blob-column.apx:118), a label-only action with NO
  // `type`/`position` line at all (p00002-blob-column.apx:185, confirmed
  // real omission), and (p00004-home.apx:151) a `redirectUrl`-type action
  // using the flat `targetUrl` property instead of a nested target.
  it('is distinct from the Dynamic-Action action -- a dynamicAction-nested action is NOT collected here', () => {
    const apx = `page 1 (
  page: 1
  name: Test
  alias: TEST

  dynamicAction refresh-on-click (
    when {
      event: click
    }
    action refresh-region (
      action: refresh
    )
  )
)`;
    const result = parseApp({ 'p1.apx': apx });
    expect(result.warnings).toEqual([]);
    expect(result.ast.pages[0].regions).toEqual([]);
    expect(result.ast.pages[0].dynamicActions[0]!.actions[0]!.identifier).toBe('refresh-region');
  });

  it('parses with no warnings, removes action from unmodeled, and projects type/target', () => {
    const apx = `page 2 (
  page: 2
  name: Blob Column
  alias: BLOB-COLUMN

  region media-image (
    name: Media Image
    type: cards

    action action (
      type: fullCard
      layout {
        sequence: 10
      }
      behavior {
        target: {
          page: 14
          items: {
            P14_EMPNO: &EMPNO.
          }
          clearCache: 14
        }
      }
    )
  )
)`;
    const result = parseApp({ 'p00002-blob-column.apx': apx });
    expect(result.warnings).toEqual([]);
    expect(result.ast.unmodeled).not.toContain('action');
    const [region] = result.ast.pages[0].regions;
    const [action] = region.actions;
    expect(action!.identifier).toBe('action');
    expect(action!.kind).toBe('fullCard');
    expect(action!.target).toEqual({ page: 14, items: { P14_EMPNO: '&EMPNO.' }, clearCache: '14' });
    expect(action!.url).toBeNull();
  });

  it('projects a null kind when neither type nor position is set (confirmed real, label-only action)', () => {
    const apx = `page 2 (
  page: 2
  name: Blob Column
  alias: BLOB-COLUMN

  region media-image (
    name: Media Image
    type: cards

    action action (
      label: Edit
      layout {
        sequence: 10
      }
      behavior {
        target: {
          page: 14
          items: {
            P14_EMPNO: &EMPNO.
          }
        }
      }
    )
  )
)`;
    const result = parseApp({ 'p00002-blob-column.apx': apx });
    const [region] = result.ast.pages[0].regions;
    const [action] = region.actions;
    expect(action!.label).toBe('Edit');
    expect(action!.kind).toBeNull();
  });

  it('projects a flat url (behavior.targetUrl) for a redirectUrl action, with target null', () => {
    const apx = `page 4 (
  page: 4
  name: Home
  alias: HOME

  region categories (
    name: Categories
    type: cards

    action action (
      type: fullCard
      behavior {
        type: redirectUrl
        targetUrl: #action$open-search?category=&NAME.
      }
    )
  )
)`;
    const result = parseApp({ 'p00004-home.apx': apx });
    expect(result.warnings).toEqual([]);
    const [region] = result.ast.pages[0].regions;
    const [action] = region.actions;
    expect(action!.url).toBe('#action$open-search?category=&NAME.');
    expect(action!.target).toBeNull();
  });
});

describe('region.source.sql (bug: read the wrong raw key)', () => {
  // Reproduces a real bug found by cross-checking against Oracle's
  // official EBNF: the SQL source property is named `sqlQuery`, not
  // `sql` -- the parser was reading `source.sql` (which never exists in
  // any real export) instead of `source.sqlQuery`, so region.source.sql
  // was silently `null` for every SQL-backed region, always, since this
  // field was first added. Confirmed live: only the committed test
  // fixture (a table-based form, which never populates `sqlQuery` at
  // all) happened to never exercise this path, which is why it went
  // unnoticed. Also confirmed live: `sqlQuery` appears BOTH as a bare
  // single-line value AND as a fenced multiline block -- despite the
  // grammar typing it as `<multiline-string>` only -- so the fix must
  // handle both shapes.
  it('reads a fenced multiline sqlQuery', () => {
    const apx = `page 1 (
  page: 1
  name: Test
  alias: TEST
  region r (
    type: classicReport
    source {
      location: localDatabase
      type: sqlQuery
      sqlQuery:
        \`\`\`sql
        select empno, ename from emp
        \`\`\`
    }
  )
)`;
    const result = parseApp({ 'p1.apx': apx });
    expect(result.warnings).toEqual([]);
    const [region] = result.ast.pages[0].regions;
    expect(region.source?.sql).toBe('select empno, ename from emp');
  });

  it('reads a bare single-line sqlQuery', () => {
    const apx = `page 1 (
  page: 1
  name: Test
  alias: TEST
  region r (
    type: classicReport
    source {
      location: localDatabase
      type: sqlQuery
      sqlQuery: select empno, ename from emp
    }
  )
)`;
    const result = parseApp({ 'p1.apx': apx });
    expect(result.warnings).toEqual([]);
    const [region] = result.ast.pages[0].regions;
    expect(region.source?.sql).toBe('select empno, ename from emp');
  });
});

describe('quoted, substitution-embedding PROPERTY keys (link.target.items)', () => {
  // Reproduces a real, previously-unhandled construct found in Oracle's own
  // "strategic-planner" starter app (github.com/oracle/apex, 26.1 branch,
  // pages/p00003-project-details.apx:2154 and 7 more identical-shape
  // occurrences across that page + p00094-initiative.apx): a quoted string
  // used as a PROPERTY key inside an opaque `link.target.items { }` object
  // literal, where the quoted string itself embeds a `#substitution#` token
  // (a dynamically-computed page-item name: `P` + a page-number substitution
  // + `_ID`). The official EBNF types `target`/`LINK` as an opaque `<value>`
  // everywhere (every one of the 30 `"target" ":" <ws> <value>` productions
  // across the whole grammar, e.g. `<entry-b-link-property>`,
  // `<column-b-link-property>`, `<column-c-link-property>`,
  // `<column-g-link-property>`) -- it never defines `items`'s internal key
  // shape, so real data is the only source here (ADR-004). The bare
  // `<identifier>` production cannot contain `#`
  // (`<identifier-start> ::= "A".."Z" | "a".."z" | "0".."9" | "_"`), which is
  // exactly why the exporter quotes this specific key -- the same reason
  // quoted, space-containing COMPONENT identifiers exist (see the
  // "quoted multi-word component identifiers" describe block above). Before
  // the fix, the PROPERTY regex required a bare-identifier-style key, so
  // this line fell through to "Unrecognized line" and the value was lost to
  // `#unparsed` instead of `link.target.items.*`.
  const apxWithQuotedSubstitutionKey = `page 3 (
  page: 3
  name: Project Details
  alias: PROJECT-DETAILS
  region documents (
    type: interactiveReport
    link {
      linkColumn: customTarget
      target: {
        page: #EDIT_PAGE#
        items: {
          "P#EDIT_PAGE#_ID": #DOCUMENT_ID#
        }
        clearCache: #EDIT_PAGE#
        anchor: #DOCUMENT_ID#
      }
    }
  )
)`;

  it('parses with no warnings', () => {
    const warnings: import('../src/index.js').ParseIssue[] = [];
    parseApxFile('p00003-project-details.apx', apxWithQuotedSubstitutionKey, warnings);
    expect(warnings).toEqual([]);
  });

  it('unquotes the key and preserves the embedded #substitution# token literally', () => {
    const result = parseApp({ 'p00003-project-details.apx': apxWithQuotedSubstitutionKey });
    const [region] = result.ast.pages[0].regions;
    expect(region.raw['link.target.items.P#EDIT_PAGE#_ID']).toBe('#DOCUMENT_ID#');
  });

  it('does not desync the surrounding link.target group (sibling keys stay intact)', () => {
    const result = parseApp({ 'p00003-project-details.apx': apxWithQuotedSubstitutionKey });
    const [region] = result.ast.pages[0].regions;
    expect(region.raw['link.target.page']).toBe('#EDIT_PAGE#');
    expect(region.raw['link.target.clearCache']).toBe('#EDIT_PAGE#');
    expect(region.raw['link.target.anchor']).toBe('#DOCUMENT_ID#');
  });

  it('still parses a normal, bare-identifier key in the same items block unaffected', () => {
    const apx = `page 1 (
  page: 1
  name: Test
  alias: TEST
  region r (
    type: interactiveReport
    link {
      target: {
        page: 66
        items: {
          P66_AREA_ID: #AREA_ID#
        }
      }
    }
  )
)`;
    const result = parseApp({ 'p1.apx': apx });
    expect(result.warnings).toEqual([]);
    const [region] = result.ast.pages[0].regions;
    expect(region.raw['link.target.items.P66_AREA_ID']).toBe('#AREA_ID#');
  });
});
