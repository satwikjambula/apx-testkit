/**
 * Regression detection between two APEXlang exports -- pure AST-to-AST
 * comparison. No live app, no browser, no DOM involved: this carries none
 * of the verification risk everything else in this project does, because
 * there's nothing to verify against a running instance -- it's a
 * structural diff of two parses.
 *
 * Scope is deliberately honest about what the AST actually tracks today
 * (see docs/ecosystem-roadmap.md "needs parser extension first"): items,
 * regions, buttons, and a handful of page-level fields are typed and
 * diffed field-by-field with old/new values shown. LOVs, validations,
 * Dynamic Actions, processes, and branches are NOT typed AST fields --
 * they live in `raw` bags. Rather than silently missing changes to them,
 * every item/region/button/page also gets an order-independent structural
 * comparison of its full `raw` bag; if anything in there differs, that's
 * reported as "other metadata changed" WITHOUT claiming to know what
 * specifically changed. That's the honest signal this can give for
 * untyped constructs: "something changed here, go look," not "the LOV
 * changed" (which would be a claim this project cannot back up yet).
 */
import { parseApp, type ApexButton, type ApexItem, type ApexPage, type ApexRegion, type RawBag } from '@apx/parser';
import { resolve } from 'node:path';
import { loadExport } from './lib.js';

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
  /** Page-level field changes (alias/name/title/authentication); empty for added/removed. */
  pageChanges: string[];
  items: ComponentDiff[];
  regions: ComponentDiff[];
  buttons: ComponentDiff[];
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

function rawEqual(a: RawBag, b: RawBag): boolean {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

const RAW_CHANGED_NOTE =
  'other metadata changed (raw properties differ -- may include LOV/validation/Dynamic Action/process changes, not individually tracked yet)';

function diffItemFields(a: ApexItem, b: ApexItem): string[] {
  const changes: string[] = [];
  if (a.type !== b.type) changes.push(`type: ${a.type ?? 'null'} -> ${b.type ?? 'null'}`);
  if (a.label !== b.label) changes.push(`label: ${JSON.stringify(a.label)} -> ${JSON.stringify(b.label)}`);
  if (a.required !== b.required) changes.push(`required: ${a.required} -> ${b.required}`);
  if (a.sourceColumn !== b.sourceColumn) {
    changes.push(`sourceColumn: ${JSON.stringify(a.sourceColumn)} -> ${JSON.stringify(b.sourceColumn)}`);
  }
  if (!rawEqual(a.raw, b.raw)) changes.push(RAW_CHANGED_NOTE);
  return changes;
}

function diffRegionFields(a: ApexRegion, b: ApexRegion): string[] {
  const changes: string[] = [];
  if (a.type !== b.type) changes.push(`type: ${a.type ?? 'null'} -> ${b.type ?? 'null'}`);
  if (a.name !== b.name) changes.push(`name: ${JSON.stringify(a.name)} -> ${JSON.stringify(b.name)}`);
  const sourceA = JSON.stringify(a.source);
  const sourceB = JSON.stringify(b.source);
  if (sourceA !== sourceB) changes.push(`source: ${sourceA} -> ${sourceB}`);
  if (!rawEqual(a.raw, b.raw)) changes.push(RAW_CHANGED_NOTE);
  return changes;
}

function diffButtonFields(a: ApexButton, b: ApexButton): string[] {
  const changes: string[] = [];
  if (a.label !== b.label) changes.push(`label: ${JSON.stringify(a.label)} -> ${JSON.stringify(b.label)}`);
  if (a.action !== b.action) changes.push(`action: ${JSON.stringify(a.action)} -> ${JSON.stringify(b.action)}`);
  if (!rawEqual(a.raw, b.raw)) changes.push(RAW_CHANGED_NOTE);
  return changes;
}

function diffByIdentifier<T extends { identifier: string; raw: RawBag }>(
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

function diffPageFields(a: ApexPage, b: ApexPage): string[] {
  const changes: string[] = [];
  if (a.alias !== b.alias) changes.push(`alias: ${JSON.stringify(a.alias)} -> ${JSON.stringify(b.alias)}`);
  if (a.name !== b.name) changes.push(`name: ${JSON.stringify(a.name)} -> ${JSON.stringify(b.name)}`);
  if (a.title !== b.title) changes.push(`title: ${JSON.stringify(a.title)} -> ${JSON.stringify(b.title)}`);
  const authA = JSON.stringify(a.raw['security.authentication'] ?? null);
  const authB = JSON.stringify(b.raw['security.authentication'] ?? null);
  if (authA !== authB) changes.push(`security.authentication: ${authA} -> ${authB}`);
  return changes;
}

export function computeDiff(oldExportDir: string, newExportDir: string): DiffReport {
  const oldResult = parseApp(loadExport(resolve(oldExportDir)));
  const newResult = parseApp(loadExport(resolve(newExportDir)));

  const oldPages = new Map(
    oldResult.ast.pages.filter((p) => p.id !== 0 && p.alias).map((p) => [p.id, p]),
  );
  const newPages = new Map(
    newResult.ast.pages.filter((p) => p.id !== 0 && p.alias).map((p) => [p.id, p]),
  );
  const ids = [...new Set([...oldPages.keys(), ...newPages.keys()])].sort((a, b) => a - b);

  const pages: PageDiff[] = [];
  const summary: DiffSummary = { pagesAdded: 0, pagesRemoved: 0, pagesChanged: 0, pagesUnchanged: 0 };

  for (const id of ids) {
    const oldPage = oldPages.get(id);
    const newPage = newPages.get(id);

    if (oldPage && !newPage) {
      summary.pagesRemoved++;
      pages.push({ kind: 'removed', id, alias: oldPage.alias, name: oldPage.name, pageChanges: [], items: [], regions: [], buttons: [] });
      continue;
    }
    if (!oldPage && newPage) {
      summary.pagesAdded++;
      pages.push({ kind: 'added', id, alias: newPage.alias, name: newPage.name, pageChanges: [], items: [], regions: [], buttons: [] });
      continue;
    }
    if (oldPage && newPage) {
      const pageChanges = diffPageFields(oldPage, newPage);
      const items = diffByIdentifier(oldPage.items, newPage.items, diffItemFields);
      const regions = diffByIdentifier(oldPage.regions, newPage.regions, diffRegionFields);
      const buttons = diffByIdentifier(oldPage.buttons, newPage.buttons, diffButtonFields);
      const hasChanges = pageChanges.length > 0 || items.length > 0 || regions.length > 0 || buttons.length > 0;
      if (hasChanges) {
        summary.pagesChanged++;
        pages.push({ kind: 'changed', id, alias: newPage.alias, name: newPage.name, pageChanges, items, regions, buttons });
      } else {
        summary.pagesUnchanged++;
      }
    }
  }

  return {
    oldExportDir: resolve(oldExportDir),
    newExportDir: resolve(newExportDir),
    pages,
    summary,
  };
}
