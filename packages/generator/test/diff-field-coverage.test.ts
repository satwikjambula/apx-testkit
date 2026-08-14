/**
 * Regression test for a real, documented incident (see
 * DESIGN_GUARDRAILS.md, .ai/checklists/parser-change.md): a field typed
 * out of `raw` into the semantic AST but never wired into `apx-diff`'s
 * field-by-field diffing (`packages/generator/src/diff.ts`). This has
 * happened twice for real -- `ApexRegion.calendarSettings`, then
 * `ApexRegion.chartSettings`/`htmlDomId` -- both silently un-diffed until
 * noticed by hand, because a typed field that's promoted OUT of `raw` is
 * no longer covered by `diff.ts`'s raw-bag fallback (`rawEqual`) either:
 * once a field graduates to a real property, a change to it becomes
 * invisible to `apx-diff` from BOTH directions unless someone remembers to
 * add an explicit line for it.
 *
 * MECHANISM: rather than a hand-written registry that itself could go
 * stale, this constructs one fully-populated, realistic fixture per typed
 * AST record `diff.ts` knows how to diff, then -- for every own key on
 * that REAL fixture object except a short, individually-justified
 * exclusion list -- produces a clone differing in exactly that one field
 * and asserts the type's `diffXFields` function (exported from `diff.ts`
 * specifically for this) reports a change. Because the field list being
 * iterated is `Object.keys(fixture)`, not a hand-typed array of field
 * names, a BRAND NEW field added to any of these AST types is
 * automatically picked up and tested the next time this suite runs, with
 * zero new test code required -- exactly the property the historical
 * "update the checklist" approach lacked. The only manual step a future
 * change requires is keeping each fixture's object literal complete
 * (matching its full `ast.ts` interface) -- the same discipline this
 * project's `coverage.test.ts` fixture already relies on.
 *
 * EXCLUSIONS (kept short and each individually justified, not a blanket
 * escape hatch):
 *   - `identifier` -- the matching KEY `diffByIdentifier`/positional
 *     matching (branches) uses to pair old/new records; never itself a
 *     "changed" field.
 *   - `loc` -- source location bookkeeping (file/line), not semantic data;
 *     nothing in `diff.ts` compares it and nothing should.
 *   - `ApexRegion.items`/`ApexRegion.buttons` -- these are the SAME item/
 *     button objects also present in `ApexPage.items`/`ApexPage.buttons`
 *     (confirmed in packages/parser/src/parser.ts: a region-nested item is
 *     pushed onto both the page's flat list and its owning region's list).
 *     `apx-diff` already diffs the page-level flat lists directly
 *     (`diffByIdentifier(oldPage.items, ...)`) -- diffing them AGAIN
 *     per-region would be redundant, not a coverage gap. Covered by a
 *     dedicated integration-style check below instead of the per-field
 *     loop.
 *   - `ApexDynamicAction.when` -- diffed field-by-field internally
 *     (`when.selectionType`/`when.event`/...), not as one JSON-compared
 *     unit, so mutating the whole object with an unrelated extra property
 *     would produce a false failure. Tested via its own nested subject
 *     (`ApexDATrigger` fields) below instead, using the exact same
 *     generic, key-driven mechanism.
 *   - `ApexPage`'s child-construct arrays (`items`/`regions`/`buttons`/
 *     `dynamicActions`/`branches`/`validations`/`processes`/
 *     `computations`) -- each gets its OWN top-level diff call inside
 *     `diffPageContents` (page-level, not folded into `diffPageFields`'s
 *     `string[]`), verified by a dedicated subject below, plus one
 *     completeness check that every one of `ApexPage`'s own keys is
 *     accounted for by either that subject or the scalar-field subject --
 *     closing the gap between the two so a genuinely new `ApexPage` field
 *     can't fall through the crack between them unnoticed.
 */
import { describe, expect, it } from 'vitest';
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
import {
  diffBranchFields,
  diffButtonFields,
  diffColumnFields,
  diffComputationFields,
  diffDAActionFields,
  diffDynamicActionFields,
  diffItemFields,
  diffPageContents,
  diffPageFields,
  diffProcessFields,
  diffRegionActionFields,
  diffRegionFields,
  diffValidationFields,
} from '../src/diff.js';

const LOC = { file: 'p1.apx', line: 1 };

/**
 * Produces a value guaranteed to differ from `value` (and to be JSON-
 * distinguishable from it), generic enough to cover every field shape
 * `ast.ts` actually uses: nullable strings/numbers/booleans, plain nested
 * objects compared via `JSON.stringify` (e.g. `source`, `calendarSettings`,
 * `condition`, `target`), and arrays of identifier-keyed records diffed via
 * `diffByIdentifier`/`diffBranches` (e.g. `columns`, `actions`).
 */
function mutateLeaf(value: unknown, seed: string): unknown {
  if (typeof value === 'string') return `${value}__mutated_${seed}__`;
  if (typeof value === 'number') return value + 1;
  if (typeof value === 'boolean') return !value;
  if (value === null) return `__mutated_from_null_${seed}__`;
  if (Array.isArray(value)) {
    if (value.length > 0 && typeof value[0] === 'object' && value[0] !== null && 'identifier' in (value[0] as object)) {
      const first = value[0] as { identifier: string };
      return [...value, { ...(first as object), identifier: `${first.identifier}__extra_${seed}__` }];
    }
    if (value.length > 0 && typeof value[0] === 'string') return [...(value as string[]), `__extra_${seed}__`];
    return [...(value as unknown[]), `__extra_${seed}__`];
  }
  if (typeof value === 'object') return { ...(value as object), __mutated_marker__: seed };
  return value;
}

function withMutatedKey<T extends object>(base: T, key: string): T {
  const current = (base as Record<string, unknown>)[key];
  return { ...base, [key]: mutateLeaf(current, key) } as T;
}

/**
 * Registers one `it()` per non-excluded own key of `base`, each asserting
 * `diffFn(base, <base with only that key mutated>)` reports a change. This
 * is the core generic mechanism -- see this file's module doc comment.
 */
function describeFieldCoverage<T extends object>(
  typeName: string,
  base: T,
  diffFn: (a: T, b: T) => string[],
  excludedKeys: readonly string[],
): void {
  const keys = Object.keys(base).filter((k) => !excludedKeys.includes(k));
  describe(`${typeName} field coverage (apx-diff)`, () => {
    // Guards the mechanism itself: if the exclusion list ever grows to
    // swallow every real field, the loop below silently registers zero
    // tests and this whole subject would go quiet -- fail loudly instead.
    it(`has at least one non-excluded field to check (found ${keys.length}: ${keys.join(', ')})`, () => {
      expect(keys.length).toBeGreaterThan(0);
    });

    for (const key of keys) {
      it(`detects a change to '${key}'`, () => {
        const mutated = withMutatedKey(base, key);
        const changes = diffFn(base, mutated);
        expect(
          changes.length,
          `apx-diff reported NO change for ${typeName}.${key} -- this field exists on the typed AST but has ` +
            'no diff handling in packages/generator/src/diff.ts (the exact shape of the calendarSettings / ' +
            'chartSettings+htmlDomId incidents). Wire it into the matching diffXFields function.',
        ).toBeGreaterThan(0);
      });
    }
  });
}

/** Same mechanism as `describeFieldCoverage`, scoped to a nested struct reached via a fixed path (e.g. `dynamicAction.when.*`). */
function describeNestedFieldCoverage<T extends object, N extends object>(
  typeName: string,
  nestedFieldName: string,
  base: T,
  getNested: (t: T) => N,
  withNested: (t: T, nested: N) => T,
  diffFn: (a: T, b: T) => string[],
): void {
  const nestedBase = getNested(base);
  const keys = Object.keys(nestedBase);
  describe(`${typeName}.${nestedFieldName} field coverage (apx-diff)`, () => {
    it(`has at least one field to check (found ${keys.length}: ${keys.join(', ')})`, () => {
      expect(keys.length).toBeGreaterThan(0);
    });
    for (const key of keys) {
      it(`detects a change to '${nestedFieldName}.${key}'`, () => {
        const mutatedNested = withMutatedKey(nestedBase, key);
        const mutated = withNested(base, mutatedNested);
        const changes = diffFn(base, mutated);
        expect(
          changes.length,
          `apx-diff reported NO change for ${typeName}.${nestedFieldName}.${key}. Wire it into the matching ` +
            'diffXFields function.',
        ).toBeGreaterThan(0);
      });
    }
  });
}

// ---------------------------------------------------------------------------
// Fixtures -- each intentionally fully populated (no field left null/empty
// that doesn't have to be) so every field actually participates in the
// per-key mutation loop above. Kept in sync with ast.ts BY HAND (same
// discipline as this package's existing coverage.test.ts fixture) --
// the mechanism this test proves is "no new TEST needs hand-writing when a
// field is added", not "no fixture maintenance is ever needed".
// ---------------------------------------------------------------------------

const itemFixture: ApexItem = {
  identifier: 'P1_ITEM',
  type: 'textField',
  label: 'Item Label',
  required: true,
  sourceColumn: 'SOME_COLUMN',
  lovName: 'MY_LOV',
  loc: LOC,
  raw: { 'some.rawKey': 'raw value' },
};

const buttonFixture: ApexButton = {
  identifier: 'BTN1',
  label: 'Save',
  action: 'SUBMIT',
  target: { page: 5, items: { P5_ID: '#ID#' }, clearCache: '5' },
  url: 'https://example.com',
  htmlDomId: 'btn1_dom',
  loc: LOC,
  raw: { 'some.rawKey': 'raw value' },
};

const daActionFixture: ApexDAAction = {
  identifier: 'daaction1',
  name: 'DA Action Name',
  action: 'show',
  fireWhenEventResultIs: true,
  loc: LOC,
  raw: { 'some.rawKey': 'raw value' },
};

const dynamicActionFixture: ApexDynamicAction = {
  identifier: 'da1',
  name: 'My Dynamic Action',
  when: {
    selectionType: 'items',
    items: ['P1_ITEM'],
    button: 'BTN1',
    region: 'r1',
    event: 'click',
    customEvent: 'apexcustomevent',
  },
  clientSideCondition: { type: 'item=value', item: 'P1_ITEM', value: '1' },
  actions: [daActionFixture],
  loc: LOC,
  raw: { 'some.rawKey': 'raw value' },
};

const validationFixture: ApexValidation = {
  identifier: 'val1',
  name: 'My Validation',
  type: 'itemIsNotNull',
  item: 'P1_ITEM',
  column: 'SOME_COLUMN',
  error: { message: 'Required', displayLocation: 'inline', associatedItem: 'P1_ITEM', associatedColumn: null },
  condition: { whenButtonPressed: 'BTN1', type: 'expression', item: 'P1_ITEM', value: '1', plsqlExpression: '1=1' },
  loc: LOC,
  raw: { 'some.rawKey': 'raw value' },
};

const processFixture: ApexProcess = {
  identifier: 'proc1',
  name: 'My Process',
  type: 'executeCode',
  sequence: 10,
  point: 'afterSubmit',
  condition: { whenButtonPressed: 'BTN1', type: 'expression', item: 'P1_ITEM', value: '1', plsqlExpression: '1=1' },
  loc: LOC,
  raw: { 'some.rawKey': 'raw value' },
};

const computationFixture: ApexComputation = {
  identifier: 'comp1',
  itemName: 'P1_ITEM',
  type: 'staticValue',
  sequence: 10,
  condition: { whenButtonPressed: 'BTN1', type: 'expression', item: 'P1_ITEM', value: '1', plsqlExpression: '1=1' },
  loc: LOC,
  raw: { 'some.rawKey': 'raw value' },
};

const branchFixture: ApexBranch = {
  identifier: null,
  name: 'My Branch',
  sequence: 10,
  point: 'afterSubmit',
  // clearCache added per ApexBranchTarget.clearCache (packages/parser/src/ast.ts) --
  // real evidence: concurrent-manager, pages/p00351-lookup-manager1.apx:960-968.
  target: { page: 5, url: null, items: { P5_ID: '&P1_ID.' }, clearCache: '5' },
  condition: { whenButtonPressed: 'BTN1', type: 'expression', item: 'P1_ITEM', value: '1', plsqlExpression: '1=1' },
  loc: LOC,
  raw: { 'some.rawKey': 'raw value' },
};

const columnFixture: ApexReportColumn = {
  identifier: 'ENAME',
  type: 'plainText',
  heading: 'Name',
  sequence: 10,
  linkTarget: { page: 5, items: { P5_ID: '#ID#' }, clearCache: '5', url: null },
  loc: LOC,
  raw: { 'some.rawKey': 'raw value' },
};

const regionActionFixture: ApexRegionAction = {
  identifier: 'action1',
  label: 'Edit',
  kind: 'button',
  target: { page: 5, items: { P5_ID: '#ID#' }, clearCache: '5' },
  url: 'https://example.com',
  loc: LOC,
  raw: { 'some.rawKey': 'raw value' },
};

const regionFixture: ApexRegion = {
  identifier: 'r1',
  name: 'My Region',
  type: 'chart',
  source: { location: 'local', tableName: 'EMP', sql: 'select * from emp' },
  calendarSettings: null,
  chartSettings: { type: 'bar' },
  htmlDomId: 'r1_dom',
  items: [itemFixture],
  buttons: [buttonFixture],
  columns: [columnFixture],
  actions: [regionActionFixture],
  loc: LOC,
  raw: { 'some.rawKey': 'raw value' },
};

const pageFixture: ApexPage = {
  id: 1,
  alias: 'MY_PAGE',
  name: 'My Page',
  title: 'My Page Title',
  regions: [regionFixture],
  items: [itemFixture],
  buttons: [buttonFixture],
  dynamicActions: [dynamicActionFixture],
  branches: [branchFixture],
  validations: [validationFixture],
  processes: [processFixture],
  computations: [computationFixture],
  loc: LOC,
  raw: { 'security.authentication': 'MY_SCHEME', 'some.other.rawKey': 'value' },
};

// ---------------------------------------------------------------------------
// Subjects
// ---------------------------------------------------------------------------

describeFieldCoverage('ApexItem', itemFixture, diffItemFields, ['identifier', 'loc']);
describeFieldCoverage('ApexButton', buttonFixture, diffButtonFields, ['identifier', 'loc']);
describeFieldCoverage('ApexDAAction', daActionFixture, diffDAActionFields, ['identifier', 'loc']);
describeFieldCoverage('ApexValidation', validationFixture, diffValidationFields, ['identifier', 'loc']);
describeFieldCoverage('ApexProcess', processFixture, diffProcessFields, ['identifier', 'loc']);
describeFieldCoverage('ApexComputation', computationFixture, diffComputationFields, ['identifier', 'loc']);
describeFieldCoverage('ApexBranch', branchFixture, diffBranchFields, ['identifier', 'loc']);
describeFieldCoverage('ApexReportColumn', columnFixture, diffColumnFields, ['identifier', 'loc']);
describeFieldCoverage('ApexRegionAction', regionActionFixture, diffRegionActionFields, ['identifier', 'loc']);

describeFieldCoverage('ApexRegion', regionFixture, diffRegionFields, [
  'identifier',
  'loc',
  // Covered at the page level instead -- see this file's module doc comment.
  'items',
  'buttons',
]);

describeFieldCoverage('ApexDynamicAction', dynamicActionFixture, diffDynamicActionFields, [
  'identifier',
  'loc',
  // Diffed field-by-field, not as one JSON-compared unit -- see the nested subject below.
  'when',
]);
describeNestedFieldCoverage(
  'ApexDynamicAction',
  'when',
  dynamicActionFixture,
  (da) => da.when,
  (da, when) => ({ ...da, when }),
  diffDynamicActionFields,
);

// ApexPage's own scalar fields, diffed inline by diffPageFields.
describeFieldCoverage('ApexPage', pageFixture, diffPageFields, [
  'id',
  'loc',
  // Each of these gets its own dedicated top-level diff call inside
  // diffPageContents, not diffPageFields -- see the subject below.
  'regions',
  'items',
  'buttons',
  'dynamicActions',
  'branches',
  'validations',
  'processes',
  'computations',
]);

describe("ApexPage's child-construct arrays are wired into diffPageContents", () => {
  const childArrayKeys: ReadonlyArray<{ key: keyof ApexPage; diffKey: keyof ReturnType<typeof diffPageContents> }> = [
    { key: 'items', diffKey: 'items' },
    { key: 'regions', diffKey: 'regions' },
    { key: 'buttons', diffKey: 'buttons' },
    { key: 'dynamicActions', diffKey: 'dynamicActions' },
    { key: 'branches', diffKey: 'branches' },
    { key: 'validations', diffKey: 'validations' },
    { key: 'processes', diffKey: 'processes' },
    { key: 'computations', diffKey: 'computations' },
  ];

  for (const { key, diffKey } of childArrayKeys) {
    it(`a change to page.${key} surfaces in diffPageContents().${diffKey}`, () => {
      const mutatedPage = withMutatedKey(pageFixture, key as string);
      const result = diffPageContents(pageFixture, mutatedPage);
      const changesForKey = result[diffKey] as unknown[];
      expect(
        changesForKey.length,
        `apx-diff reported NO change for ApexPage.${key} via diffPageContents().${diffKey} -- this ` +
          'page-level construct array exists on the typed AST but has no diff call wired into ' +
          'diffPageContents in packages/generator/src/diff.ts.',
      ).toBeGreaterThan(0);
    });
  }

  it("every one of ApexPage's own keys is covered by either the scalar-field subject above or this child-array list", () => {
    const accountedFor = new Set<string>(['id', 'loc', 'alias', 'name', 'title', 'raw', ...childArrayKeys.map((c) => c.key as string)]);
    const unaccounted = Object.keys(pageFixture).filter((k) => !accountedFor.has(k));
    expect(
      unaccounted,
      'ApexPage gained a new own field that this test suite does not know how to classify. Add it to either ' +
        "the diffPageFields subject's exclusion list removal (scalar/JSON field diffed inline) or the " +
        'childArrayKeys list above (a new page-level construct array needing its own diffPageContents call), ' +
        'matching how apx-diff actually needs to handle it.',
    ).toEqual([]);
  });
});

describe('ApexRegion.items/buttons redundancy with page-level diffing (documents the exclusion above)', () => {
  it('a region-nested item change surfaces via page-level items diff, not a separate region-level check', () => {
    const changedItem: ApexItem = { ...itemFixture, label: 'Changed Label' };
    const mutatedRegion: ApexRegion = { ...regionFixture, items: [changedItem] };
    const mutatedPage: ApexPage = { ...pageFixture, regions: [mutatedRegion], items: [changedItem] };
    const result = diffPageContents(pageFixture, mutatedPage);
    expect(result.items.length).toBeGreaterThan(0);
  });
});
