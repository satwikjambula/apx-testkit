import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseApp } from '../src/index.js';

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
