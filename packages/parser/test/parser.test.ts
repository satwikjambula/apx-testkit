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
    });
    expect(da.clientSideCondition).toEqual({ type: 'item=value', item: 'P3_JOB', value: 'SALESMAN' });
  });

  it('projects nested actions, including fireWhenEventResultIs', () => {
    const result = parseApp({ 'p00003-edit.apx': apxWithDynamicAction });
    const [da] = result.ast.pages[0].dynamicActions;
    expect(da.actions.map((a) => ({ id: a.identifier, action: a.action, fire: a.fireWhenEventResultIs }))).toEqual([
      { id: 'native-disable', action: 'disable', fire: false },
      { id: 'native-enable', action: 'enable', fire: null },
    ]);
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
