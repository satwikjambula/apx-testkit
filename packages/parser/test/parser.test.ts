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
  // deterministic root cause of the previously-open "runtime static id
  // differs from .apx identifier" question (docs/quirks/26.1.json
  // 'region-id-not-static-id') -- when set, it predicts the widget
  // container id (`<htmlDomId>_jet` for Chart, `<htmlDomId>_ig` for
  // Interactive Grid).
  it('projects an explicit htmlDomId override', () => {
    const apx = `page 1 (
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
    expect(first.target).toEqual({ page: 'CUSTOMERS', url: null, items: null });
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
    expect(second.target).toEqual({ page: 50, url: null, items: { P50_ID: '&P2_ID.' } });
  });

  it('projects an item-substitution-token page target with a null (unconditional) condition', () => {
    const result = parseApp({ 'p00002-customer-details.apx': apxWithBranches });
    const [, , third] = result.ast.pages[0].branches;
    expect(third.name).toBeNull();
    expect(third.target).toEqual({ page: '&LAST_VIEW.', url: null, items: null });
    expect(third.condition).toBeNull();
  });

  it('projects an external URL redirect target (apextogo sign-out branch shape)', () => {
    const apx = `page 20000 (
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
    expect(branch.target).toEqual({ page: null, url: '&LOGOUT_URL.', items: null });
  });
});

describe('typed validation support (validation <id> (...))', () => {
  // Reproduces real structure found in the user's own "concurrent-manager"
  // app (pages/p00010-request-submission.apx:530+): an itemIsNotNull
  // validation gated on whenButtonPressed, and a functionBody validation
  // whose error has no errorMessage of its own (associatedItem only).
  const apxWithValidations = `page 10 (
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
    // Real value is quoted in the export (trailing space forces quoting);
    // property-value quote-stripping is a separately-tracked open item
    // (docs/grammar-assumptions.md "Still open" -- unrelated to this
    // change), so the literal quotes are preserved as-is, matching
    // current parser behavior for quoted PROPERTY VALUES.
    expect(second.name).toBe('"Schedule interval required "');
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

describe('item.lovName (lov { type: sharedComponent, lov: @name })', () => {
  // Reproduces real structure found in the user's own "concurrent-manager"
  // app (pages/p00010-request-submission.apx:280+).
  it('projects the named LOV reference for a gated item type (selectList)', () => {
    const apx = `page 10 (
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
