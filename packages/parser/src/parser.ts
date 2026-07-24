/**
 * APEXlang parser — grammar verified against a real 26.1 export
 * (UX Pattern Catalog, mmdVersion 26.1.0+3102). See docs/grammar-assumptions.md
 * for the ledger of confirmed vs. still-open behaviors.
 *
 * Verified grammar:
 *   component :=  TYPE [IDENTIFIER] '(' body ')'     app | page | region | pageItem |
 *                                                    button | column | facet | process | ...
 *   group     :=  NAME '{' body '}'                  e.g. `layout {`, `label {`
 *   objProp   :=  NAME ':' '{' body '}'              e.g. `homeUrl: {`, `target: {`
 *   property  :=  NAME ':' scalar-to-EOL             no commas; spaces/colons legal in value
 *   fenceProp :=  NAME ':' NEWLINE ```lang ... ```   embedded css/html/sql/js/markdown
 *   value     :=  ref | array | number | boolean | scalar
 *   ref       :=  '@' name | '@/' name               local vs standard-theme
 *   array     :=  '[' items... ']'                   whitespace/newline separated
 *
 * Structural fact (matters for consumers): regions/items/buttons are SIBLINGS
 * under the page; containment is expressed by layout.parentRegion / layout.region
 * @references, not lexical nesting. projectPages() resolves those references.
 */

import type {
  ApexAppAst, ApexButton, ApexDAAction, ApexDynamicAction, ApexItem, ApexPage, ApexRegion,
  ComponentNode, Loc, RawValue, RefValue,
} from './ast.js';

export interface ParseIssue { message: string; loc: Loc; }
export interface ParseResult {
  ast: ApexAppAst;
  tree: ComponentNode[];
  warnings: ParseIssue[];
}

const COMPONENT_OPEN = /^([A-Za-z][\w-]*)(?:\s+("[^"]*"|\S+))?\s*\($/;
const GROUP_OPEN = /^([A-Za-z][\w-]*)\s*\{$/;
const OBJ_PROP_OPEN = /^([A-Za-z][\w-]*)\s*:\s*\{$/;
const PROPERTY = /^([A-Za-z0-9_][\w-]*)\s*:\s*(.*)$/;
const FENCE_OPEN = /^```([A-Za-z0-9_-]*)\s*$/;

export function parseApxFile(file: string, text: string, warnings: ParseIssue[]): ComponentNode[] {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  let i = 0;

  const loc = (): Loc => ({ file, line: i + 1 });

  function refValue(tok: string): RefValue {
    const body = tok.slice(1);
    return { ref: body, standard: body.startsWith('/') };
  }

  /** Component identifiers may be a quoted, multi-word display name (e.g. an
   * Interactive Grid row-selector pseudo-column: `column "Row Header" (`) --
   * strip the surrounding quotes so the AST identifier is the plain string. */
  function unquoteIdentifier(tok: string | undefined): string | null {
    if (tok === undefined) return null;
    return tok.length >= 2 && tok.startsWith('"') && tok.endsWith('"') ? tok.slice(1, -1) : tok;
  }

  function scalar(trimmed: string): RawValue {
    if (trimmed.startsWith('@') && !/\s/.test(trimmed)) return refValue(trimmed);
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;
    return trimmed;
  }

  /**
   * '[' consumed; read whitespace-separated atoms across lines until ']'.
   *
   * BUG FIXED: the caller (parseBody's PROPERTY branch) always advances
   * `i` past the property line BEFORE calling parseValue()/parseArray() --
   * regardless of whether anything followed '[' inline on that line. So
   * by the time this function starts, `i` already points at the correct
   * next line to read; the FIRST loop iteration's `chunk` (the inline
   * remainder, possibly empty) has already been fully captured and must
   * NOT trigger its own advance. The old code unconditionally did `i++`
   * whenever no ']' was found yet, on every iteration including the
   * first -- silently skipping one real content line in TWO shapes:
   * (1) `foo: [` with nothing inline, items each on their own line
   * (dropped the array's first element -- confirmed live impact:
   * `templateOptions: [` alone on its line appears ~1550+ times across
   * real exports this project has parsed, meaning `#DEFAULT#`, almost
   * always the first templateOption, was silently missing from `raw`
   * bags project-wide until this fix); and (2) `foo: [bar` (first
   * element inline) continued on following lines (dropped the SECOND
   * element, the first full continuation line). Both are the same root
   * confusion: advance `i` only when a chunk was actually read via
   * `lines[i]` -- exactly what `consumedLine` already tracks, and exactly
   * the guard the `end >= 0` branch already used below. Making the
   * `end < 0` branch use the identical guard fixes both shapes at once.
   */
  function parseArray(inlineRest: string): RawValue[] {
    const out: RawValue[] = [];
    let chunk = inlineRest;
    let consumedLine = false; // true once we're reading lines beyond the property line
    for (;;) {
      const end = chunk.indexOf(']');
      const body = end >= 0 ? chunk.slice(0, end) : chunk;
      for (const tok of body.split(/\s+/).filter(Boolean)) out.push(scalar(tok));
      if (end >= 0) {
        if (consumedLine) i++; // step past the line holding ']'
        return out;
      }
      if (consumedLine) i++;
      if (i >= lines.length) {
        warnings.push({ message: 'Unterminated array', loc: loc() });
        return out;
      }
      chunk = lines[i];
      consumedLine = true;
    }
  }

  /** Property with empty value: check for a fenced code block on following lines. */
  function tryFence(): RawValue | undefined {
    let j = i;
    while (j < lines.length && lines[j].trim() === '') j++;
    if (j >= lines.length) return undefined;
    const openLine = lines[j];
    const m = FENCE_OPEN.exec(openLine.trim());
    if (!m) return undefined;
    const indent = openLine.length - openLine.trimStart().length;
    const lang = m[1] || null;
    const body: string[] = [];
    j++;
    while (j < lines.length && lines[j].trim() !== '```') {
      const l = lines[j];
      body.push(l.length >= indent ? l.slice(indent) : l.trimStart());
      j++;
    }
    if (j >= lines.length) {
      warnings.push({ message: 'Unterminated code fence', loc: { file, line: i + 1 } });
    }
    i = Math.min(j + 1, lines.length);
    return { lang: lang as RawValue, code: body.join('\n') };
  }

  function parseValue(rest: string): RawValue {
    const trimmed = rest.trim();
    if (trimmed.startsWith('[')) return parseArray(trimmed.slice(1));
    return scalar(trimmed);
  }

  function parseBody(node: ComponentNode, closer: ')' | '}', prefix: string): void {
    while (i < lines.length) {
      const line = lines[i].trim();
      if (line === '') { i++; continue; }
      if (line === closer) { i++; return; }

      let m = COMPONENT_OPEN.exec(line);
      if (m && !line.includes(':')) {
        const child: ComponentNode = {
          type: m[1], identifier: unquoteIdentifier(m[2]), props: {}, children: [], loc: loc(),
        };
        i++;
        parseBody(child, ')', '');
        node.children.push(child);
        continue;
      }

      m = GROUP_OPEN.exec(line) ?? OBJ_PROP_OPEN.exec(line);
      if (m) {
        const groupName = m[1];
        i++;
        const holder: ComponentNode = {
          type: '#group', identifier: groupName, props: {}, children: [], loc: loc(),
        };
        parseBody(holder, '}', '');
        for (const [k, v] of Object.entries(holder.props)) {
          node.props[`${prefix}${groupName}.${k}`] = v;
        }
        for (const c of holder.children) node.children.push(c);
        continue;
      }

      m = PROPERTY.exec(line);
      if (m) {
        const key = `${prefix}${m[1]}`;
        i++;
        if (m[2].trim() === '') {
          const fenced = tryFence();
          node.props[key] = fenced ?? '';
        } else {
          node.props[key] = parseValue(m[2]);
        }
        continue;
      }

      warnings.push({ message: `Unrecognized line: "${line.slice(0, 70)}"`, loc: loc() });
      const bucket = (node.props['#unparsed'] as RawValue[] | undefined) ?? [];
      bucket.push(line);
      node.props['#unparsed'] = bucket;
      i++;
    }
    warnings.push({ message: `Unterminated block '${node.type}'`, loc: loc() });
  }

  const roots: ComponentNode[] = [];
  while (i < lines.length) {
    const line = lines[i].trim();
    if (line === '') { i++; continue; }
    const m = COMPONENT_OPEN.exec(line);
    if (m) {
      const root: ComponentNode = {
        type: m[1], identifier: unquoteIdentifier(m[2]), props: {}, children: [], loc: loc(),
      };
      i++;
      parseBody(root, ')', '');
      roots.push(root);
    } else {
      warnings.push({ message: `Unrecognized top-level line: "${line.slice(0, 70)}"`, loc: loc() });
      i++;
    }
  }
  return roots;
}

/* ---------- typed projection ---------- */

function str(v: RawValue | undefined): string | null {
  return typeof v === 'string' && v !== '' ? v : null;
}
function refName(v: RawValue | undefined): string | null {
  return v && typeof v === 'object' && 'ref' in v ? String((v as RefValue).ref) : null;
}
function bool(v: RawValue | undefined): boolean | null {
  return typeof v === 'boolean' ? v : null;
}
/** `when.items`/`affectedElements.items`-style values: a single identifier or an array of them. */
function stringArray(v: RawValue | undefined): string[] | null {
  if (v === undefined) return null;
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string');
  if (typeof v === 'string') return [v];
  return null;
}
/** Properties typed `<multiline-string>` in the grammar (e.g. `sqlQuery`) --
 * confirmed live to appear BOTH as a fenced block (tryFence()'s `{ lang,
 * code }` shape) AND as a bare single-line string, despite the grammar
 * typing them as multiline-string only. Handles both. */
function multilineText(v: RawValue | undefined): string | null {
  if (typeof v === 'string' && v !== '') return v;
  if (v && typeof v === 'object' && !Array.isArray(v) && !('ref' in v) && typeof (v as { code?: unknown }).code === 'string') {
    return (v as { code: string }).code;
  }
  return null;
}

const ITEM_TYPES = new Set(['pageItem', 'item']);

function projectItem(n: ComponentNode): ApexItem {
  return {
    identifier: n.identifier ?? '(anonymous)',
    type: str(n.props['type']),
    label: str(n.props['label.label']) ?? str(n.props['label']),
    required: n.props['validation.valueRequired'] === true || n.props['required'] === true,
    sourceColumn: str(n.props['source.column']),
    loc: n.loc,
    raw: n.props,
  };
}

function projectButton(n: ComponentNode): ApexButton {
  return {
    identifier: n.identifier ?? '(anonymous)',
    label: str(n.props['label']),
    action: str(n.props['behavior.action']) ?? str(n.props['action']),
    loc: n.loc,
    raw: n.props,
  };
}

function projectDAAction(n: ComponentNode): ApexDAAction {
  return {
    identifier: n.identifier ?? '(anonymous)',
    name: str(n.props['name']),
    action: str(n.props['action']),
    fireWhenEventResultIs: bool(n.props['execution.fireWhenEventResultIs']),
    loc: n.loc,
    raw: n.props,
  };
}

function projectDynamicAction(n: ComponentNode): ApexDynamicAction {
  const hasClientSideCondition = Object.keys(n.props).some((k) => k.startsWith('clientSideCondition.'));
  return {
    identifier: n.identifier ?? '(anonymous)',
    name: str(n.props['name']),
    when: {
      selectionType: str(n.props['when.selectionType']),
      items: stringArray(n.props['when.items']),
      button: refName(n.props['when.button']),
      region: refName(n.props['when.region']),
      event: str(n.props['when.event']),
      customEvent: str(n.props['when.customEvent']),
    },
    clientSideCondition: hasClientSideCondition
      ? {
          type: str(n.props['clientSideCondition.type']),
          item: str(n.props['clientSideCondition.item']),
          value: str(n.props['clientSideCondition.value']),
        }
      : null,
    actions: n.children.filter((c) => c.type === 'action').map(projectDAAction),
    loc: n.loc,
    raw: n.props,
  };
}

export function projectPages(roots: ComponentNode[]): { pages: ApexPage[]; unmodeled: string[] } {
  const pages: ApexPage[] = [];
  const unmodeled = new Set<string>();
  for (const n of roots) {
    if (n.type === 'app') { continue; }
    if (n.type !== 'page') { unmodeled.add(n.type); continue; }

    const regionNodes = n.children.filter((c) => c.type === 'region');
    const regions: ApexRegion[] = regionNodes.map((r) => {
      const hasSource = Object.keys(r.props).some((k) => k.startsWith('source.'));
      const type = str(r.props['type']);
      return {
        identifier: r.identifier ?? '(anonymous)',
        name: str(r.props['name']),
        type,
        source: hasSource
          ? {
              location: str(r.props['source.location']),
              tableName: str(r.props['source.tableName']),
              sql: multilineText(r.props['source.sqlQuery']),
            }
          : null,
        calendarSettings:
          type === 'calendar'
            ? {
                displayColumn: str(r.props['settings.displayColumn']),
                startDateColumn: str(r.props['settings.startDateColumn']),
                endDateColumn: str(r.props['settings.endDateColumn']),
                pkColumn: str(r.props['settings.pkColumn']),
                showTime: bool(r.props['settings.showTime']),
                views: stringArray(r.props['settings.calendarViewsAndNavigation']),
                dragAndDrop: bool(r.props['settings.dragAndDrop']),
              }
            : null,
        chartSettings:
          type === 'chart'
            ? {
                // Omitted 'chart {}' group means 'bar' -- confirmed live,
                // not a null/missing-data case. See ApexChartSettings doc.
                type: str(r.props['chart.type']) ?? 'bar',
              }
            : null,
        htmlDomId: str(r.props['advanced.htmlDomId']),
        items: [],
        buttons: [],
        loc: r.loc,
        raw: r.props,
      };
    });
    const byId = new Map(regions.map((r) => [r.identifier, r]));

    const items: ApexItem[] = [];
    const buttons: ApexButton[] = [];
    const dynamicActions: ApexDynamicAction[] = [];
    for (const c of n.children) {
      if (ITEM_TYPES.has(c.type)) {
        const item = projectItem(c);
        items.push(item);
        const owner = refName(c.props['layout.region']);
        if (owner) byId.get(owner)?.items.push(item);
      } else if (c.type === 'button') {
        const button = projectButton(c);
        buttons.push(button);
        const owner = refName(c.props['layout.region']);
        if (owner) byId.get(owner)?.buttons.push(button);
      } else if (c.type === 'dynamicAction') {
        dynamicActions.push(projectDynamicAction(c));
      } else if (c.type !== 'region') {
        unmodeled.add(c.type);
      }
    }
    // Nested lexical items/buttons (docs-style) — also attach.
    for (const r of regionNodes) {
      for (const c of r.children) {
        if (ITEM_TYPES.has(c.type)) {
          const item = projectItem(c);
          items.push(item);
          byId.get(r.identifier ?? '')?.items.push(item);
        } else if (c.type === 'button') {
          const button = projectButton(c);
          buttons.push(button);
          byId.get(r.identifier ?? '')?.buttons.push(button);
        } else unmodeled.add(c.type);
      }
    }

    pages.push({
      id: Number(n.identifier),
      alias: str(n.props['alias']),
      name: str(n.props['name']),
      title: str(n.props['title']),
      regions, items, buttons, dynamicActions,
      loc: n.loc,
      raw: n.props,
    });
  }
  return { pages, unmodeled: [...unmodeled].sort() };
}

export function parseApp(files: Record<string, string>): ParseResult {
  const warnings: ParseIssue[] = [];
  const tree: ComponentNode[] = [];
  const sourceFiles: string[] = [];
  for (const [file, text] of Object.entries(files)) {
    sourceFiles.push(file);
    tree.push(...parseApxFile(file, text, warnings));
  }
  const { pages, unmodeled } = projectPages(tree);
  return {
    ast: { astVersion: '0.1.0-provisional', pages, sourceFiles, unmodeled },
    tree,
    warnings,
  };
}
