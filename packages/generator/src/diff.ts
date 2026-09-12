/**
 * Regression detection between two APEXlang exports -- pure AST-to-AST
 * comparison. No live app, no browser, no DOM involved: this carries none
 * of the verification risk everything else in this project does, because
 * there's nothing to verify against a running instance -- it's a
 * structural diff of two parses.
 *
 * Scope is deliberately honest about what the AST actually tracks today
 * (see docs/ecosystem-roadmap.md "needs parser extension first"): items,
 * regions, buttons, dynamic actions, branches, validations, processes,
 * computations, report columns, region actions, and a handful of
 * page-level fields are typed and diffed field-by-field with old/new
 * values shown (branches and validations added in the "Seventh round"
 * pass; processes/computations/columns/region-actions added in the
 * "Continuation" pass -- see docs/grammar-assumptions.md). An item's LOV
 * *reference* (`ApexItem.lovName`) is also diffed field-by-field; the LOV
 * *definition* itself (`shared-components/lovs.apx`'s actual values)
 * remains untyped, living in `raw` bags. Rather than silently missing
 * changes to what's still untyped, every item/region/button/
 * dynamicAction/branch/validation/process/computation/column/
 * regionAction/page also gets an order-independent structural comparison
 * of its full `raw` bag; if anything in there differs, that's reported as
 * "other metadata changed" WITHOUT claiming to know what specifically
 * changed. That's the honest signal this can give for untyped constructs:
 * "something changed here, go look," not a specific claim this project
 * cannot back up yet.
 *
 * Each added/removed/changed page also lists the generated `.page.ts`/
 * `.spec.ts` filenames a regeneration would touch -- computed from the
 * same `pageObjectFileName()`/`specFileName()` helpers `generate()` itself
 * uses (single source of truth, so this can never drift from what the
 * generator actually names things), closing the loop from "what changed"
 * to "which generated files need re-review" without any new
 * infrastructure.
 *
 * The per-type `diffXFields` functions and `diffPageContents` below are
 * exported (beyond just `computeDiff`) specifically so
 * `test/diff-field-coverage.test.ts` can call them directly with
 * synthetic, fully-populated fixtures and mutate one field at a time --
 * this is what catches a NEW typed AST field being added without a
 * matching `if (a.field !== b.field)`/`JSON.stringify` line here (this has
 * happened twice for real: `calendarSettings`, then `chartSettings`/
 * `htmlDomId`, both silently un-diffed until noticed by hand). See that
 * test file for the exact mechanism and its documented, deliberate
 * exclusions (`identifier`/`loc`/`raw` and a couple of structurally
 * redundant fields).
 */
import {
  parseApp,
  type ApexApplication,
  type ApexBranch,
  type ApexButton,
  type ApexComputation,
  type ApexDAAction,
  type ApexDynamicAction,
  type ApexItem,
  type ApexPage,
  type ApexProcess,
  type ApexRegion,
  type ApexRegionAction,
  type ApexReportColumn,
  type ApexValidation,
  loadApexlangExport,
  type RawBag,
} from '@apx/parser';
import { resolve } from 'node:path';
import { pageObjectFileName, specFileName } from './page-object.js';

export type ChangeKind = 'added' | 'removed' | 'changed';

export interface ComponentDiff {
  kind: ChangeKind;
  identifier: string;
  /** Human-readable field-level changes; empty for added/removed (nothing to compare against). */
  changes: string[];
}

export interface PageDiff {
  kind: ChangeKind;
  id: number;
  alias: string | null;
  name: string | null;
  /**
   * Generated `.page.ts`/`.spec.ts` filenames a regeneration touches for
   * this page -- computed from the same naming helpers `generate()` uses.
   * For 'removed' pages these are the files a prior generation would have
   * produced (and that regenerating against the new export will no longer
   * emit); for 'added'/'changed', the files the new export will produce.
   */
  affectedFiles: string[];
  /** Page-level field changes (alias/name/title/authentication); empty for added/removed. */
  pageChanges: string[];
  items: ComponentDiff[];
  regions: ComponentDiff[];
  buttons: ComponentDiff[];
  dynamicActions: ComponentDiff[];
  branches: ComponentDiff[];
  validations: ComponentDiff[];
  processes: ComponentDiff[];
  computations: ComponentDiff[];
}

export interface DiffSummary {
  pagesAdded: number;
  pagesRemoved: number;
  pagesChanged: number;
  pagesUnchanged: number;
}

export interface DiffReport {
  oldExportDir: string;
  newExportDir: string;
  applicationChanges: string[];
  manifestChanges: string[];
  pages: PageDiff[];
  summary: DiffSummary;
}

/** Order-independent structural equality for a raw bag -- avoids false positives from mere key reordering. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = canonical((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

export function rawEqual(a: RawBag, b: RawBag): boolean {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

export const RAW_CHANGED_NOTE =
  'other metadata changed (raw properties differ -- may include LOV value/process changes, not individually tracked yet)';

export function diffApplicationFields(a: ApexApplication | null, b: ApexApplication | null): string[] {
  if (a === null || b === null) return a === b ? [] : [`application: ${a === null ? 'missing' : 'present'} -> ${b === null ? 'missing' : 'present'}`];
  const changes: string[] = [];
  if (a.identifier !== b.identifier) changes.push(`identifier: ${JSON.stringify(a.identifier)} -> ${JSON.stringify(b.identifier)}`);
  if (a.name !== b.name) changes.push(`name: ${JSON.stringify(a.name)} -> ${JSON.stringify(b.name)}`);
  if (a.alias !== b.alias) changes.push(`alias: ${JSON.stringify(a.alias)} -> ${JSON.stringify(b.alias)}`);
  if (a.version !== b.version) changes.push(`version: ${JSON.stringify(a.version)} -> ${JSON.stringify(b.version)}`);
  if (a.type !== b.type) changes.push(`type: ${JSON.stringify(a.type)} -> ${JSON.stringify(b.type)}`);
  if (a.runtime.friendlyUrls !== b.runtime.friendlyUrls) {
    changes.push(`runtime.friendlyUrls: ${a.runtime.friendlyUrls} -> ${b.runtime.friendlyUrls}`);
  }
  if (a.runtime.compatibilityMode !== b.runtime.compatibilityMode) {
    changes.push(
      `runtime.compatibilityMode: ${JSON.stringify(a.runtime.compatibilityMode)} -> ${JSON.stringify(b.runtime.compatibilityMode)}`,
    );
  }
  const substitutionSemantics = (application: ApexApplication) =>
    application.staticSubstitutions
      .map(({ identifier, name, staticValue, raw }) => ({ identifier, name, staticValue, raw: canonical(raw) }))
      .sort((left, right) => left.name.localeCompare(right.name));
  if (JSON.stringify(substitutionSemantics(a)) !== JSON.stringify(substitutionSemantics(b))) {
    // Do not echo static values: application substitutions can contain
    // deployment-specific text that should not be copied into CI logs.
    changes.push('static application substitutions changed');
  }
  if (!rawEqual(a.raw, b.raw)) changes.push(RAW_CHANGED_NOTE);
  return changes;
}

export function diffItemFields(a: ApexItem, b: ApexItem): string[] {
  const changes: string[] = [];
  if (a.type !== b.type) changes.push(`type: ${a.type ?? 'null'} -> ${b.type ?? 'null'}`);
  if (a.label !== b.label) changes.push(`label: ${JSON.stringify(a.label)} -> ${JSON.stringify(b.label)}`);
  if (a.required !== b.required) changes.push(`required: ${a.required} -> ${b.required}`);
  if (a.sourceColumn !== b.sourceColumn) {
    changes.push(`sourceColumn: ${JSON.stringify(a.sourceColumn)} -> ${JSON.stringify(b.sourceColumn)}`);
  }
  if (a.lovName !== b.lovName) {
    changes.push(`lovName: ${JSON.stringify(a.lovName)} -> ${JSON.stringify(b.lovName)}`);
  }
  if (!rawEqual(a.raw, b.raw)) changes.push(RAW_CHANGED_NOTE);
  return changes;
}

/** `column <id> (...)` -- see `ApexReportColumn`'s doc comment. */
export function diffColumnFields(a: ApexReportColumn, b: ApexReportColumn): string[] {
  const changes: string[] = [];
  if (a.type !== b.type) changes.push(`type: ${a.type ?? 'null'} -> ${b.type ?? 'null'}`);
  if (a.heading !== b.heading) changes.push(`heading: ${JSON.stringify(a.heading)} -> ${JSON.stringify(b.heading)}`);
  if (a.sequence !== b.sequence) changes.push(`sequence: ${a.sequence} -> ${b.sequence}`);
  const linkA = JSON.stringify(a.linkTarget);
  const linkB = JSON.stringify(b.linkTarget);
  if (linkA !== linkB) changes.push(`linkTarget: ${linkA} -> ${linkB}`);
  if (!rawEqual(a.raw, b.raw)) changes.push(RAW_CHANGED_NOTE);
  return changes;
}

/** Region-nested `action <id> (...)` -- see `ApexRegionAction`'s doc
 * comment (NOT the Dynamic-Action `action`, already diffed via
 * `diffDAActionFields`). */
export function diffRegionActionFields(a: ApexRegionAction, b: ApexRegionAction): string[] {
  const changes: string[] = [];
  if (a.label !== b.label) changes.push(`label: ${JSON.stringify(a.label)} -> ${JSON.stringify(b.label)}`);
  if (a.kind !== b.kind) changes.push(`kind: ${JSON.stringify(a.kind)} -> ${JSON.stringify(b.kind)}`);
  const targetA = JSON.stringify(a.target);
  const targetB = JSON.stringify(b.target);
  if (targetA !== targetB) changes.push(`target: ${targetA} -> ${targetB}`);
  if (a.url !== b.url) changes.push(`url: ${JSON.stringify(a.url)} -> ${JSON.stringify(b.url)}`);
  if (!rawEqual(a.raw, b.raw)) changes.push(RAW_CHANGED_NOTE);
  return changes;
}

export function diffRegionFields(a: ApexRegion, b: ApexRegion): string[] {
  const changes: string[] = [];
  if (a.type !== b.type) changes.push(`type: ${a.type ?? 'null'} -> ${b.type ?? 'null'}`);
  if (a.name !== b.name) changes.push(`name: ${JSON.stringify(a.name)} -> ${JSON.stringify(b.name)}`);
  const sourceA = JSON.stringify(a.source);
  const sourceB = JSON.stringify(b.source);
  if (sourceA !== sourceB) changes.push(`source: ${sourceA} -> ${sourceB}`);
  const calA = JSON.stringify(a.calendarSettings);
  const calB = JSON.stringify(b.calendarSettings);
  if (calA !== calB) changes.push(`calendarSettings: ${calA} -> ${calB}`);
  const chartA = JSON.stringify(a.chartSettings);
  const chartB = JSON.stringify(b.chartSettings);
  if (chartA !== chartB) changes.push(`chartSettings: ${chartA} -> ${chartB}`);
  if (a.htmlDomId !== b.htmlDomId) changes.push(`htmlDomId: ${JSON.stringify(a.htmlDomId)} -> ${JSON.stringify(b.htmlDomId)}`);

  const columnDiffs = diffByIdentifier(a.columns, b.columns, diffColumnFields);
  for (const d of columnDiffs) {
    if (d.kind === 'added') changes.push(`column ${d.identifier} added`);
    else if (d.kind === 'removed') changes.push(`column ${d.identifier} removed`);
    else changes.push(`column ${d.identifier}: ${d.changes.join('; ')}`);
  }
  const actionDiffs = diffByIdentifier(a.actions, b.actions, diffRegionActionFields);
  for (const d of actionDiffs) {
    if (d.kind === 'added') changes.push(`action ${d.identifier} added`);
    else if (d.kind === 'removed') changes.push(`action ${d.identifier} removed`);
    else changes.push(`action ${d.identifier}: ${d.changes.join('; ')}`);
  }

  if (!rawEqual(a.raw, b.raw)) changes.push(RAW_CHANGED_NOTE);
  return changes;
}

export function diffButtonFields(a: ApexButton, b: ApexButton): string[] {
  const changes: string[] = [];
  if (a.label !== b.label) changes.push(`label: ${JSON.stringify(a.label)} -> ${JSON.stringify(b.label)}`);
  if (a.action !== b.action) changes.push(`action: ${JSON.stringify(a.action)} -> ${JSON.stringify(b.action)}`);
  const targetA = JSON.stringify(a.target);
  const targetB = JSON.stringify(b.target);
  if (targetA !== targetB) changes.push(`target: ${targetA} -> ${targetB}`);
  if (a.url !== b.url) changes.push(`url: ${JSON.stringify(a.url)} -> ${JSON.stringify(b.url)}`);
  if (a.htmlDomId !== b.htmlDomId) {
    changes.push(`htmlDomId: ${JSON.stringify(a.htmlDomId)} -> ${JSON.stringify(b.htmlDomId)}`);
  }
  if (!rawEqual(a.raw, b.raw)) changes.push(RAW_CHANGED_NOTE);
  return changes;
}

export function diffDAActionFields(a: ApexDAAction, b: ApexDAAction): string[] {
  const changes: string[] = [];
  if (a.name !== b.name) changes.push(`name: ${JSON.stringify(a.name)} -> ${JSON.stringify(b.name)}`);
  if (a.action !== b.action) changes.push(`action: ${JSON.stringify(a.action)} -> ${JSON.stringify(b.action)}`);
  if (a.fireWhenEventResultIs !== b.fireWhenEventResultIs) {
    changes.push(`fireWhenEventResultIs: ${a.fireWhenEventResultIs} -> ${b.fireWhenEventResultIs}`);
  }
  if (!rawEqual(a.raw, b.raw)) changes.push(RAW_CHANGED_NOTE);
  return changes;
}

export function diffDynamicActionFields(a: ApexDynamicAction, b: ApexDynamicAction): string[] {
  const changes: string[] = [];
  if (a.name !== b.name) changes.push(`name: ${JSON.stringify(a.name)} -> ${JSON.stringify(b.name)}`);
  if (a.when.selectionType !== b.when.selectionType) {
    changes.push(`when.selectionType: ${JSON.stringify(a.when.selectionType)} -> ${JSON.stringify(b.when.selectionType)}`);
  }
  if (a.when.event !== b.when.event) {
    changes.push(`when.event: ${JSON.stringify(a.when.event)} -> ${JSON.stringify(b.when.event)}`);
  }
  if (a.when.customEvent !== b.when.customEvent) {
    changes.push(`when.customEvent: ${JSON.stringify(a.when.customEvent)} -> ${JSON.stringify(b.when.customEvent)}`);
  }
  const itemsA = JSON.stringify(a.when.items);
  const itemsB = JSON.stringify(b.when.items);
  if (itemsA !== itemsB) changes.push(`when.items: ${itemsA} -> ${itemsB}`);
  if (a.when.button !== b.when.button) {
    changes.push(`when.button: ${JSON.stringify(a.when.button)} -> ${JSON.stringify(b.when.button)}`);
  }
  if (a.when.region !== b.when.region) {
    changes.push(`when.region: ${JSON.stringify(a.when.region)} -> ${JSON.stringify(b.when.region)}`);
  }
  const condA = JSON.stringify(a.clientSideCondition);
  const condB = JSON.stringify(b.clientSideCondition);
  if (condA !== condB) changes.push(`clientSideCondition: ${condA} -> ${condB}`);

  const actionDiffs = diffByIdentifier(a.actions, b.actions, diffDAActionFields);
  for (const d of actionDiffs) {
    if (d.kind === 'added') changes.push(`action ${d.identifier} added`);
    else if (d.kind === 'removed') changes.push(`action ${d.identifier} removed`);
    else changes.push(`action ${d.identifier}: ${d.changes.join('; ')}`);
  }

  if (!rawEqual(a.raw, b.raw)) changes.push(RAW_CHANGED_NOTE);
  return changes;
}

export function diffByIdentifier<T extends { identifier: string; raw: RawBag }>(
  oldList: readonly T[],
  newList: readonly T[],
  diffFields: (a: T, b: T) => string[],
): ComponentDiff[] {
  const oldMap = new Map(oldList.map((x) => [x.identifier, x]));
  const newMap = new Map(newList.map((x) => [x.identifier, x]));
  const diffs: ComponentDiff[] = [];
  const identifiers = new Set([...oldMap.keys(), ...newMap.keys()]);
  for (const id of identifiers) {
    const oldItem = oldMap.get(id);
    const newItem = newMap.get(id);
    if (oldItem && !newItem) {
      diffs.push({ kind: 'removed', identifier: id, changes: [] });
    } else if (!oldItem && newItem) {
      diffs.push({ kind: 'added', identifier: id, changes: [] });
    } else if (oldItem && newItem) {
      const changes = diffFields(oldItem, newItem);
      if (changes.length > 0) diffs.push({ kind: 'changed', identifier: id, changes });
    }
  }
  return diffs.sort((a, b) => a.identifier.localeCompare(b.identifier));
}

export function diffValidationFields(a: ApexValidation, b: ApexValidation): string[] {
  const changes: string[] = [];
  if (a.name !== b.name) changes.push(`name: ${JSON.stringify(a.name)} -> ${JSON.stringify(b.name)}`);
  if (a.type !== b.type) changes.push(`type: ${JSON.stringify(a.type)} -> ${JSON.stringify(b.type)}`);
  if (a.item !== b.item) changes.push(`item: ${JSON.stringify(a.item)} -> ${JSON.stringify(b.item)}`);
  if (a.column !== b.column) changes.push(`column: ${JSON.stringify(a.column)} -> ${JSON.stringify(b.column)}`);
  const errA = JSON.stringify(a.error);
  const errB = JSON.stringify(b.error);
  if (errA !== errB) changes.push(`error: ${errA} -> ${errB}`);
  const condA = JSON.stringify(a.condition);
  const condB = JSON.stringify(b.condition);
  if (condA !== condB) changes.push(`condition: ${condA} -> ${condB}`);
  if (!rawEqual(a.raw, b.raw)) changes.push(RAW_CHANGED_NOTE);
  return changes;
}

/** `process <id> (...)` -- see `ApexProcess`'s doc comment. Reuses
 * `diffByIdentifier` directly (every real process carries an identifier,
 * unlike `branch`). */
export function diffProcessFields(a: ApexProcess, b: ApexProcess): string[] {
  const changes: string[] = [];
  if (a.name !== b.name) changes.push(`name: ${JSON.stringify(a.name)} -> ${JSON.stringify(b.name)}`);
  if (a.type !== b.type) changes.push(`type: ${JSON.stringify(a.type)} -> ${JSON.stringify(b.type)}`);
  if (a.sequence !== b.sequence) changes.push(`sequence: ${a.sequence} -> ${b.sequence}`);
  if (a.point !== b.point) changes.push(`point: ${JSON.stringify(a.point)} -> ${JSON.stringify(b.point)}`);
  const condA = JSON.stringify(a.condition);
  const condB = JSON.stringify(b.condition);
  if (condA !== condB) changes.push(`condition: ${condA} -> ${condB}`);
  const targetA = JSON.stringify(a.target);
  const targetB = JSON.stringify(b.target);
  if (targetA !== targetB) changes.push(`target: ${targetA} -> ${targetB}`);
  if (!rawEqual(a.raw, b.raw)) changes.push(RAW_CHANGED_NOTE);
  return changes;
}

/** `computation <id> (...)` -- see `ApexComputation`'s doc comment. Reuses
 * `diffByIdentifier` directly (every real computation carries an
 * identifier, unlike `branch`). */
export function diffComputationFields(a: ApexComputation, b: ApexComputation): string[] {
  const changes: string[] = [];
  if (a.itemName !== b.itemName) changes.push(`itemName: ${JSON.stringify(a.itemName)} -> ${JSON.stringify(b.itemName)}`);
  if (a.type !== b.type) changes.push(`type: ${JSON.stringify(a.type)} -> ${JSON.stringify(b.type)}`);
  if (a.sequence !== b.sequence) changes.push(`sequence: ${a.sequence} -> ${b.sequence}`);
  const condA = JSON.stringify(a.condition);
  const condB = JSON.stringify(b.condition);
  if (condA !== condB) changes.push(`condition: ${condA} -> ${condB}`);
  if (!rawEqual(a.raw, b.raw)) changes.push(RAW_CHANGED_NOTE);
  return changes;
}

export function diffBranchFields(a: ApexBranch, b: ApexBranch): string[] {
  const changes: string[] = [];
  if (a.name !== b.name) changes.push(`name: ${JSON.stringify(a.name)} -> ${JSON.stringify(b.name)}`);
  if (a.sequence !== b.sequence) changes.push(`sequence: ${a.sequence} -> ${b.sequence}`);
  if (a.point !== b.point) changes.push(`point: ${JSON.stringify(a.point)} -> ${JSON.stringify(b.point)}`);
  const targetA = JSON.stringify(a.target);
  const targetB = JSON.stringify(b.target);
  if (targetA !== targetB) changes.push(`target: ${targetA} -> ${targetB}`);
  const condA = JSON.stringify(a.condition);
  const condB = JSON.stringify(b.condition);
  if (condA !== condB) changes.push(`condition: ${condA} -> ${condB}`);
  if (!rawEqual(a.raw, b.raw)) changes.push(RAW_CHANGED_NOTE);
  return changes;
}

/**
 * Branches have NO stable identifier in real APEXlang data (0/325 real
 * branches across this project's full corpus carry a component-id -- see
 * `ApexBranch`'s doc comment) -- unlike every other diffed construct here,
 * `diffByIdentifier` cannot be reused. Matched positionally instead:
 * branch order within a page is stable across regenerations of the SAME
 * export (confirmed by the determinism check), which is exact for that
 * question. A genuine REORDERING between two different export versions
 * would show as spurious per-position "changed" entries rather than a
 * true add/remove -- an honest, documented limitation (labeled with the
 * branch's own `name` when present, or a positional `branch #N` fallback
 * when not, matching how anonymous branches are the norm, not the
 * exception -- 127/325 real branches have no `name` either).
 */
export function diffBranches(oldList: readonly ApexBranch[], newList: readonly ApexBranch[]): ComponentDiff[] {
  const diffs: ComponentDiff[] = [];
  const max = Math.max(oldList.length, newList.length);
  const label = (br: ApexBranch, idx: number): string => br.name ?? `branch #${idx}`;
  for (let idx = 0; idx < max; idx++) {
    const a = oldList[idx];
    const b = newList[idx];
    if (a && !b) diffs.push({ kind: 'removed', identifier: label(a, idx), changes: [] });
    else if (!a && b) diffs.push({ kind: 'added', identifier: label(b, idx), changes: [] });
    else if (a && b) {
      const changes = diffBranchFields(a, b);
      if (changes.length > 0) diffs.push({ kind: 'changed', identifier: label(b, idx), changes });
    }
  }
  return diffs;
}

/**
 * `page`'s own typed scalar properties. Every OTHER page-level construct
 * (items, regions,
 * buttons, dynamicActions, branches, validations, processes, computations)
 * is intentionally NOT diffed here -- each gets its own dedicated top-level
 * diff call inside `diffPageContents` below instead (a page can have
 * hundreds of items across many regions; folding that into a single
 * `changes: string[]` here would lose the per-construct add/removed/changed
 * structure `PageDiff` exposes). The final `rawEqual` fallback below is
 * still real and necessary despite that -- it catches anything about the
 * PAGE ITSELF (not its children) that isn't one of the four fields above
 * (e.g. `page.mode`/`includeInMenu`/other direct or grouped page
 * properties never promoted to a typed field), matching the same
 * raw-bag-fallback discipline every other diffed construct in this file
 * already has.
 */
export function diffPageFields(a: ApexPage, b: ApexPage): string[] {
  const changes: string[] = [];
  if (a.identifier !== b.identifier) changes.push(`identifier: ${JSON.stringify(a.identifier)} -> ${JSON.stringify(b.identifier)}`);
  if (a.alias !== b.alias) changes.push(`alias: ${JSON.stringify(a.alias)} -> ${JSON.stringify(b.alias)}`);
  if (a.name !== b.name) changes.push(`name: ${JSON.stringify(a.name)} -> ${JSON.stringify(b.name)}`);
  if (a.title !== b.title) changes.push(`title: ${JSON.stringify(a.title)} -> ${JSON.stringify(b.title)}`);
  if (a.pageMode !== b.pageMode) changes.push(`pageMode: ${JSON.stringify(a.pageMode)} -> ${JSON.stringify(b.pageMode)}`);
  if (a.pageAccessProtection !== b.pageAccessProtection) {
    changes.push(`pageAccessProtection: ${JSON.stringify(a.pageAccessProtection)} -> ${JSON.stringify(b.pageAccessProtection)}`);
  }
  if (a.authentication !== b.authentication) {
    changes.push(`authentication: ${JSON.stringify(a.authentication)} -> ${JSON.stringify(b.authentication)}`);
  }
  if (a.isPublic !== b.isPublic) changes.push(`isPublic: ${a.isPublic} -> ${b.isPublic}`);
  if (!rawEqual(a.raw, b.raw)) changes.push(RAW_CHANGED_NOTE);
  return changes;
}

export interface PageContentsDiff {
  pageChanges: string[];
  items: ComponentDiff[];
  regions: ComponentDiff[];
  buttons: ComponentDiff[];
  dynamicActions: ComponentDiff[];
  branches: ComponentDiff[];
  validations: ComponentDiff[];
  processes: ComponentDiff[];
  computations: ComponentDiff[];
}

/**
 * Every top-level, per-page construct this file knows how to diff, in one
 * place -- factored out of `computeDiff`'s per-page loop so it can be
 * exercised directly (two `ApexPage` objects in, no export directory or
 * filesystem needed) by `test/diff-field-coverage.test.ts`, which mutates
 * one `ApexPage` field at a time and confirms a change surfaces somewhere
 * in this return value. If a NEW page-level construct array is ever added
 * to `ApexPage` without a matching call added here, that test fails.
 */
export function diffPageContents(a: ApexPage, b: ApexPage): PageContentsDiff {
  return {
    pageChanges: diffPageFields(a, b),
    items: diffByIdentifier(a.items, b.items, diffItemFields),
    regions: diffByIdentifier(a.regions, b.regions, diffRegionFields),
    buttons: diffByIdentifier(a.buttons, b.buttons, diffButtonFields),
    dynamicActions: diffByIdentifier(a.dynamicActions, b.dynamicActions, diffDynamicActionFields),
    branches: diffBranches(a.branches, b.branches),
    validations: diffByIdentifier(a.validations, b.validations, diffValidationFields),
    processes: diffByIdentifier(a.processes, b.processes, diffProcessFields),
    computations: diffByIdentifier(a.computations, b.computations, diffComputationFields),
  };
}

/**
 * Human-readable/prose formatting over an already-computed `DiffReport` --
 * a templating layer, not new analysis (see docs/ecosystem-roadmap.md
 * "Ninth round", "Human-readable export diff"). Every fact rendered here
 * already exists on `DiffReport`/`PageDiff`/`ComponentDiff`; this only
 * turns it into sentences instead of the CLI's indented `+`/`-`/`~` tree.
 * Kept alongside the existing structured output (`diff-cli.ts`'s default
 * behavior), never replacing it -- other tooling/tests may depend on the
 * structured shape staying exactly as it is.
 */
const CATEGORY_LABELS: ReadonlyArray<{ key: keyof PageContentsDiff; label: string }> = [
  { key: 'items', label: 'item' },
  { key: 'regions', label: 'region' },
  { key: 'buttons', label: 'button' },
  { key: 'dynamicActions', label: 'dynamic action' },
  { key: 'branches', label: 'branch' },
  { key: 'validations', label: 'validation' },
  { key: 'processes', label: 'process' },
  { key: 'computations', label: 'computation' },
];

const VERB_BY_KIND: Record<ChangeKind, 'Added' | 'Removed' | 'Changed'> = {
  added: 'Added',
  removed: 'Removed',
  changed: 'Changed',
};

/**
 * One clause for a single added/removed/changed item/region/button/etc,
 * e.g. `Added button SAVE` or `Changed item P3_ENAME (label: "Name" ->
 * "Full Name")`. For 'changed', the already-computed field-level changes
 * are folded in parenthetically rather than dropped -- losing that detail
 * would make prose mode strictly less informative than structured mode,
 * which this project's "never lose information" discipline (see
 * DESIGN_GUARDRAILS.md) argues against.
 */
export function describeComponentChange(categoryLabel: string, d: ComponentDiff): string {
  const base = `${VERB_BY_KIND[d.kind]} ${categoryLabel} ${d.identifier}`;
  if (d.kind === 'changed' && d.changes.length > 0) return `${base} (${d.changes.join('; ')})`;
  return base;
}

/**
 * One prose sentence (or two, for added/removed pages) per `PageDiff`.
 * `report.pages` only ever contains added/removed/changed pages
 * (`computeDiff` never pushes an unchanged one), so every entry here has
 * something to say.
 */
export function formatPageHuman(p: PageDiff): string {
  const header = `Page ${p.id}: ${p.name ?? p.alias} (${p.alias})`;

  if (p.kind === 'added') {
    return `${header} -- added. Will generate: ${p.affectedFiles.join(', ')}.`;
  }
  if (p.kind === 'removed') {
    return `${header} -- removed. No longer generates: ${p.affectedFiles.join(', ')}.`;
  }

  const clauses: string[] = [];
  for (const change of p.pageChanges) clauses.push(`Changed ${change}`);
  for (const { key, label } of CATEGORY_LABELS) {
    for (const d of p[key] as ComponentDiff[]) {
      clauses.push(describeComponentChange(label, d));
    }
  }

  const body = clauses.length > 0 ? clauses.join(', ') : 'changed (see raw diff)';
  return `${header}: ${body}. Affects: ${p.affectedFiles.join(', ')}.`;
}

/**
 * The full report as prose -- one line per changed/added/removed page plus
 * the same summary line the structured CLI output ends with. This is the
 * function `--format human` in `diff-cli.ts` calls; also usable directly
 * by anything importing `@apx/testgen/diff` (e.g. `@apx/mcp`, a future CI
 * comment bot) without going through the CLI at all.
 */
export function formatDiffHuman(report: DiffReport): string {
  const lines: string[] = [];
  lines.push('Regression report (human-readable)');
  lines.push(`  old: ${report.oldExportDir}`);
  lines.push(`  new: ${report.newExportDir}`);
  lines.push('');

  for (const change of report.manifestChanges ?? []) lines.push(`Manifest: ${change}.`);
  for (const change of report.applicationChanges ?? []) lines.push(`Application: ${change}.`);
  if ((report.manifestChanges?.length ?? 0) + (report.applicationChanges?.length ?? 0) > 0) lines.push('');

  if (report.pages.length === 0) {
    lines.push('No page changes detected.');
  } else {
    for (const p of report.pages) lines.push(formatPageHuman(p));
  }

  lines.push('');
  const s = report.summary;
  lines.push(
    `Summary: ${s.pagesAdded} added, ${s.pagesRemoved} removed, ${s.pagesChanged} changed, ${s.pagesUnchanged} unchanged`,
  );
  return lines.join('\n');
}

/** Deterministic tree formatter used by the default `apx-diff` CLI mode. */
export function formatDiffStructured(report: DiffReport): string {
  const lines: string[] = [
    'Regression report',
    `  old: ${report.oldExportDir}`,
    `  new: ${report.newExportDir}`,
    '',
  ];
  const symbol: Record<ComponentDiff['kind'], string> = { added: '+', removed: '-', changed: '~' };
  const addComponentDiffs = (label: string, diffs: ComponentDiff[]): void => {
    for (const d of diffs) {
      lines.push(`  ${symbol[d.kind]} ${label} ${d.identifier}`);
      for (const change of d.changes) lines.push(`      ${change}`);
    }
  };

  for (const change of report.manifestChanges) lines.push(`~ manifest: ${change}`);
  for (const change of report.applicationChanges) lines.push(`~ application: ${change}`);
  if (report.manifestChanges.length + report.applicationChanges.length > 0) lines.push('');

  for (const p of report.pages) {
    if (p.kind === 'added') {
      lines.push(`+ page ${p.id}: ${p.name ?? p.alias} (${p.alias})`);
      lines.push(`    generated: ${p.affectedFiles.join(', ')}`, '');
      continue;
    }
    if (p.kind === 'removed') {
      lines.push(`- page ${p.id}: ${p.name ?? p.alias} (${p.alias})`);
      lines.push(`    no longer generated: ${p.affectedFiles.join(', ')}`, '');
      continue;
    }
    lines.push(`~ page ${p.id}: ${p.name ?? p.alias} (${p.alias})`);
    for (const change of p.pageChanges) lines.push(`    ${change}`);
    addComponentDiffs('item', p.items);
    addComponentDiffs('region', p.regions);
    addComponentDiffs('button', p.buttons);
    addComponentDiffs('dynamicAction', p.dynamicActions);
    addComponentDiffs('branch', p.branches);
    addComponentDiffs('validation', p.validations);
    addComponentDiffs('process', p.processes);
    addComponentDiffs('computation', p.computations);
    lines.push(`    affected: ${p.affectedFiles.join(', ')}`, '');
  }

  const s = report.summary;
  lines.push(`Summary: ${s.pagesAdded} added, ${s.pagesRemoved} removed, ${s.pagesChanged} changed, ${s.pagesUnchanged} unchanged`);
  return lines.join('\n');
}

export function computeDiff(oldExportDir: string, newExportDir: string): DiffReport {
  const oldResult = parseApp(loadApexlangExport(resolve(oldExportDir)));
  const newResult = parseApp(loadApexlangExport(resolve(newExportDir)));

  const oldPages = new Map(
    oldResult.ast.pages.filter((p) => p.id !== 0 && p.alias).map((p) => [p.id, p]),
  );
  const newPages = new Map(
    newResult.ast.pages.filter((p) => p.id !== 0 && p.alias).map((p) => [p.id, p]),
  );
  const ids = [...new Set([...oldPages.keys(), ...newPages.keys()])].sort((a, b) => a - b);

  const pages: PageDiff[] = [];
  const summary: DiffSummary = { pagesAdded: 0, pagesRemoved: 0, pagesChanged: 0, pagesUnchanged: 0 };

  const filesFor = (page: ApexPage): string[] => [pageObjectFileName(page), specFileName(page)];

  for (const id of ids) {
    const oldPage = oldPages.get(id);
    const newPage = newPages.get(id);

    if (oldPage && !newPage) {
      summary.pagesRemoved++;
      pages.push({
        kind: 'removed',
        id,
        alias: oldPage.alias,
        name: oldPage.name,
        affectedFiles: filesFor(oldPage),
        pageChanges: [],
        items: [],
        regions: [],
        buttons: [],
        dynamicActions: [],
        branches: [],
        validations: [],
        processes: [],
        computations: [],
      });
      continue;
    }
    if (!oldPage && newPage) {
      summary.pagesAdded++;
      pages.push({
        kind: 'added',
        id,
        alias: newPage.alias,
        name: newPage.name,
        affectedFiles: filesFor(newPage),
        pageChanges: [],
        items: [],
        regions: [],
        buttons: [],
        dynamicActions: [],
        branches: [],
        validations: [],
        processes: [],
        computations: [],
      });
      continue;
    }
    if (oldPage && newPage) {
      const contents = diffPageContents(oldPage, newPage);
      const { pageChanges, items, regions, buttons, dynamicActions, branches, validations, processes, computations } =
        contents;
      const hasChanges =
        pageChanges.length > 0 ||
        items.length > 0 ||
        regions.length > 0 ||
        buttons.length > 0 ||
        dynamicActions.length > 0 ||
        branches.length > 0 ||
        validations.length > 0 ||
        processes.length > 0 ||
        computations.length > 0;
      if (hasChanges) {
        summary.pagesChanged++;
        pages.push({
          kind: 'changed',
          id,
          alias: newPage.alias,
          name: newPage.name,
          affectedFiles: filesFor(newPage),
          pageChanges,
          items,
          regions,
          buttons,
          dynamicActions,
          branches,
          validations,
          processes,
          computations,
        });
      } else {
        summary.pagesUnchanged++;
      }
    }
  }

  return {
    oldExportDir: resolve(oldExportDir),
    newExportDir: resolve(newExportDir),
    applicationChanges: diffApplicationFields(oldResult.ast.application, newResult.ast.application),
    manifestChanges:
      oldResult.ast.manifest?.mmdVersion === newResult.ast.manifest?.mmdVersion
        ? []
        : [`mmdVersion: ${JSON.stringify(oldResult.ast.manifest?.mmdVersion ?? null)} -> ${JSON.stringify(newResult.ast.manifest?.mmdVersion ?? null)}`],
    pages,
    summary,
  };
}
