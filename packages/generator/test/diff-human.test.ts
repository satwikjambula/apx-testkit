import { describe, expect, it } from 'vitest';
import type { ComponentDiff, DiffReport, PageDiff } from '../src/diff.js';
import { describeComponentChange, formatDiffHuman, formatPageHuman } from '../src/diff.js';

/**
 * Regression tests for the human-readable/prose formatter over an
 * already-computed `DiffReport` (see docs/ecosystem-roadmap.md "Ninth
 * round", GitHub issue #1 "Human-readable apx-diff output"). This is pure
 * templating over data `diff-field-coverage.test.ts` already proves
 * `computeDiff`/`diffPageContents` compute correctly -- these tests only
 * check the sentence shape, not the underlying diff logic, so synthetic
 * `PageDiff`/`DiffReport` fixtures (no export directories, no filesystem)
 * are constructed directly.
 */

const LOC_FREE_PAGE_BASE: Omit<PageDiff, 'kind' | 'pageChanges' | 'items' | 'regions' | 'buttons' | 'dynamicActions' | 'branches' | 'validations' | 'processes' | 'computations'> = {
  id: 3,
  alias: 'EMPLOYEE',
  name: 'Employee',
  affectedFiles: ['p00003-employee.page.ts', 'p00003-employee.spec.ts'],
};

function emptyPage(overrides: Partial<PageDiff>): PageDiff {
  return {
    ...LOC_FREE_PAGE_BASE,
    kind: 'changed',
    pageChanges: [],
    items: [],
    regions: [],
    buttons: [],
    dynamicActions: [],
    branches: [],
    validations: [],
    processes: [],
    computations: [],
    ...overrides,
  };
}

function componentDiff(overrides: Partial<ComponentDiff>): ComponentDiff {
  return { kind: 'added', identifier: 'X', changes: [], ...overrides };
}

describe('describeComponentChange', () => {
  it('renders an added component with no field detail', () => {
    expect(describeComponentChange('button', componentDiff({ kind: 'added', identifier: 'SAVE' }))).toBe(
      'Added button SAVE',
    );
  });

  it('renders a removed component with no field detail', () => {
    expect(describeComponentChange('validation', componentDiff({ kind: 'removed', identifier: 'val1' }))).toBe(
      'Removed validation val1',
    );
  });

  it('renders a changed component with field-level detail folded in parenthetically', () => {
    const d = componentDiff({
      kind: 'changed',
      identifier: 'P3_ENAME',
      changes: ['label: "Name" -> "Full Name"'],
    });
    expect(describeComponentChange('item', d)).toBe('Changed item P3_ENAME (label: "Name" -> "Full Name")');
  });

  it('joins multiple field changes with "; " inside the parenthetical', () => {
    const d = componentDiff({
      kind: 'changed',
      identifier: 'BTN1',
      changes: ['label: "Save" -> "Save Changes"', 'action: "SUBMIT" -> "SAVE"'],
    });
    expect(describeComponentChange('button', d)).toBe(
      'Changed button BTN1 (label: "Save" -> "Save Changes"; action: "SUBMIT" -> "SAVE")',
    );
  });

  it('renders a changed component with an empty changes array (e.g. a future category) with no parenthetical', () => {
    const d = componentDiff({ kind: 'changed', identifier: 'br1', changes: [] });
    expect(describeComponentChange('branch', d)).toBe('Changed branch br1');
  });
});

describe('formatPageHuman', () => {
  it('renders an added page as a single sentence naming the files it generates', () => {
    const p = emptyPage({ kind: 'added', id: 7, alias: 'REPORTS', name: 'Reports', affectedFiles: ['p00007-reports.page.ts', 'p00007-reports.spec.ts'] });
    expect(formatPageHuman(p)).toBe(
      'Page 7: Reports (REPORTS) -- added. Will generate: p00007-reports.page.ts, p00007-reports.spec.ts.',
    );
  });

  it('renders a removed page as a single sentence naming the files it no longer generates', () => {
    const p = emptyPage({ kind: 'removed', id: 5, alias: 'LEGACY', name: 'Legacy Page', affectedFiles: ['p00005-legacy.page.ts', 'p00005-legacy.spec.ts'] });
    expect(formatPageHuman(p)).toBe(
      'Page 5: Legacy Page (LEGACY) -- removed. No longer generates: p00005-legacy.page.ts, p00005-legacy.spec.ts.',
    );
  });

  it('falls back to the alias when name is null', () => {
    const p = emptyPage({ kind: 'added', id: 9, alias: 'NO_NAME', name: null });
    expect(formatPageHuman(p)).toContain('Page 9: NO_NAME (NO_NAME) -- added.');
  });

  it('renders page-level field changes as their own clause', () => {
    const p = emptyPage({ pageChanges: ['title: "Employee" -> "Employee Record"'] });
    expect(formatPageHuman(p)).toBe(
      'Page 3: Employee (EMPLOYEE): Changed title: "Employee" -> "Employee Record". Affects: p00003-employee.page.ts, p00003-employee.spec.ts.',
    );
  });

  it('combines page-level and every component-category change into one comma-joined sentence, in a stable order', () => {
    const p = emptyPage({
      pageChanges: ['title: "Employee" -> "Employee Record"'],
      items: [
        componentDiff({ kind: 'added', identifier: 'P3_EMAIL' }),
        componentDiff({ kind: 'changed', identifier: 'P3_ENAME', changes: ['label: "Name" -> "Full Name"'] }),
        componentDiff({ kind: 'removed', identifier: 'P3_JOB' }),
      ],
      buttons: [componentDiff({ kind: 'changed', identifier: 'save', changes: ['label: "Save" -> "Save Changes"'] })],
      validations: [componentDiff({ kind: 'removed', identifier: 'Salary Required' })],
    });
    expect(formatPageHuman(p)).toBe(
      'Page 3: Employee (EMPLOYEE): Changed title: "Employee" -> "Employee Record", ' +
        'Added item P3_EMAIL, Changed item P3_ENAME (label: "Name" -> "Full Name"), Removed item P3_JOB, ' +
        'Changed button save (label: "Save" -> "Save Changes"), ' +
        'Removed validation Salary Required. ' +
        'Affects: p00003-employee.page.ts, p00003-employee.spec.ts.',
    );
  });

  it('exercises every component category label at least once (items/regions/buttons/dynamicActions/branches/validations/processes/computations)', () => {
    const p = emptyPage({
      items: [componentDiff({ kind: 'added', identifier: 'i1' })],
      regions: [componentDiff({ kind: 'added', identifier: 'r1' })],
      buttons: [componentDiff({ kind: 'added', identifier: 'b1' })],
      dynamicActions: [componentDiff({ kind: 'added', identifier: 'da1' })],
      branches: [componentDiff({ kind: 'added', identifier: 'br1' })],
      validations: [componentDiff({ kind: 'added', identifier: 'v1' })],
      processes: [componentDiff({ kind: 'added', identifier: 'p1' })],
      computations: [componentDiff({ kind: 'added', identifier: 'c1' })],
    });
    const sentence = formatPageHuman(p);
    expect(sentence).toContain('Added item i1');
    expect(sentence).toContain('Added region r1');
    expect(sentence).toContain('Added button b1');
    expect(sentence).toContain('Added dynamic action da1');
    expect(sentence).toContain('Added branch br1');
    expect(sentence).toContain('Added validation v1');
    expect(sentence).toContain('Added process p1');
    expect(sentence).toContain('Added computation c1');
  });
});

describe('formatDiffHuman', () => {
  const baseReport: Omit<DiffReport, 'pages' | 'summary'> = {
    oldExportDir: '/old/export',
    newExportDir: '/new/export',
  };

  it('reports "no page changes" when the report has zero pages (identity diff)', () => {
    const report: DiffReport = {
      ...baseReport,
      pages: [],
      summary: { pagesAdded: 0, pagesRemoved: 0, pagesChanged: 0, pagesUnchanged: 4 },
    };
    const text = formatDiffHuman(report);
    expect(text).toContain('old: /old/export');
    expect(text).toContain('new: /new/export');
    expect(text).toContain('No page changes detected.');
    expect(text).toContain('Summary: 0 added, 0 removed, 0 changed, 4 unchanged');
  });

  it('renders one line per page and ends with the same summary line the structured CLI output uses', () => {
    const added = emptyPage({ kind: 'added', id: 7, alias: 'REPORTS', name: 'Reports' });
    const changed = emptyPage({ pageChanges: ['title: "Employee" -> "Employee Record"'] });
    const report: DiffReport = {
      ...baseReport,
      pages: [changed, added],
      summary: { pagesAdded: 1, pagesRemoved: 0, pagesChanged: 1, pagesUnchanged: 2 },
    };
    const text = formatDiffHuman(report);
    const lines = text.split('\n');
    expect(lines).toContain(formatPageHuman(changed));
    expect(lines).toContain(formatPageHuman(added));
    expect(lines[lines.length - 1]).toBe('Summary: 1 added, 0 removed, 1 changed, 2 unchanged');
  });
});
