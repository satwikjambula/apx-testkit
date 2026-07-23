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
