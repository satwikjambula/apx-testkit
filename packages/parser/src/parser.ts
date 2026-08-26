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
 *   property  :=  (NAME | QUOTED-NAME) ':' scalar-to-EOL   no commas; spaces/colons legal in
 *                                                    value; QUOTED-NAME only seen inside opaque
 *                                                    object-literal blobs (e.g. `link.target.items`)
 *                                                    whose key isn't a bare identifier -- see PROPERTY
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
  ApexAppAst, ApexBranch, ApexBranchTarget, ApexButton, ApexButtonTarget, ApexColumnLinkTarget,
  ApexComputation, ApexDAAction, ApexDynamicAction, ApexItem, ApexPage, ApexProcess, ApexRegion,
  ApexRegionAction, ApexRegionActionTarget, ApexReportColumn, ApexServerSideCondition,
  ApexValidation, ApexValidationError, ComponentNode, Loc, RawBag, RawValue, RefValue,
} from './ast.js';
import type { LoadedApexlangExport } from './loader.js';

export interface ParseIssue {
  message: string;
  loc: Loc;
  /** Structural errors make typed projection unsafe; warnings remain losslessly preserved. */
  severity: 'warning' | 'error';
}
export interface ParseResult {
  ast: ApexAppAst;
  tree: ComponentNode[];
  warnings: ParseIssue[];
}

const QUOTED_STRING_SOURCE = String.raw`"(?:\\["\\/bfnrt]|\\u[0-9A-Fa-f]{4}|[^"\\\u0000-\u001F])*"`;
const COMPONENT_OPEN = new RegExp(`^([A-Za-z][\\w-]*)(?:\\s+(${QUOTED_STRING_SOURCE}|(?!")\\S+))?\\s*\\($`);
const GROUP_OPEN = /^([A-Za-z][\w-]*)\s*\{$/;
const OBJ_PROP_OPEN = /^([A-Za-z][\w-]*)\s*:\s*\{$/;
/**
 * PROPERTY keys are normally a bare identifier (`[A-Za-z0-9_][\w-]*`), but a
 * quoted-string key alternative is required too -- confirmed real, reproducible
 * APEXlang inside opaque `link.target.items { }` object literals (`target` is
 * typed as `<value>` -- an intentionally opaque blob -- by literally every one
 * of the 30 `"target" ":" <ws> <value>` productions in the official EBNF,
 * e.g. `<entry-b-link-property>`/`<column-b-link-property>`/
 * `<column-c-link-property>`/`<column-g-link-property>`, so the grammar never
 * defines `items`'s internal key shape at all -- real data is the only source
 * here per ADR-004). Real example (`strategic-planner`,
 * `pages/p00003-project-details.apx:2154`, one of 8 identical-shape
 * occurrences across that app's `p00003-project-details.apx`/
 * `p00094-initiative.apx`): `"P#EDIT_PAGE#_ID": #DOCUMENT_ID#` -- a
 * dynamically-computed page-item name (`P` + a `#substitution#` page-number
 * token + `_ID`) used as a column-link target item. The bare `<identifier>`
 * production (`<identifier-start> ::= "A".."Z" | "a".."z" | "0".."9" | "_"`,
 * `<identifier-rest>` adds only "." and "-") cannot contain `#`, which is
 * exactly why the exporter quotes this specific key -- same reason quoted,
 * space-containing COMPONENT identifiers exist (see `unquoteIdentifier()`
 * above `COMPONENT_OPEN`'s doc comment). Unquoted the same way, into the same
 * `props` key space -- the `#substitution#` token inside the key is kept
 * literal (never evaluated), matching how `#substitution#` tokens are already
 * kept literal in property VALUES.
 */
const PROPERTY = new RegExp(`^(${QUOTED_STRING_SOURCE}|[A-Za-z0-9_][\\w-]*)\\s*:\\s*(.*)$`);
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
  function decodeQuotedString(tok: string): string {
    try {
      return JSON.parse(tok) as string;
    } catch {
      warnings.push({ message: `Invalid quoted string: ${tok.slice(0, 70)}`, loc: loc(), severity: 'error' });
      return tok;
    }
  }

  function unquoteIdentifier(tok: string | undefined): string | null {
    if (tok === undefined) return null;
    return tok.length >= 2 && tok.startsWith('"') && tok.endsWith('"') ? decodeQuotedString(tok) : tok;
  }

  function scalar(trimmed: string): RawValue {
    if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) return decodeQuotedString(trimmed);
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
  function closingBracket(text: string): number {
    let quoted = false;
    let escaped = false;
    for (let index = 0; index < text.length; index++) {
      const char = text[index];
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') quoted = false;
      } else if (char === '"') quoted = true;
      else if (char === ']') return index;
    }
    return -1;
  }

  function arrayTokens(text: string): string[] {
    const tokens: string[] = [];
    let index = 0;
    while (index < text.length) {
      while (/\s/.test(text[index] ?? '')) index++;
      if (index >= text.length) break;
      const start = index;
      if (text[index] === '"') {
        index++;
        let escaped = false;
        while (index < text.length) {
          const char = text[index++];
          if (escaped) escaped = false;
          else if (char === '\\') escaped = true;
          else if (char === '"') break;
        }
        tokens.push(text.slice(start, index));
      } else {
        while (index < text.length && !/\s/.test(text[index]!)) index++;
        tokens.push(text.slice(start, index));
      }
    }
    return tokens;
  }

  function parseArray(inlineRest: string): RawValue[] {
    let text = inlineRest;
    for (;;) {
      const end = closingBracket(text);
      if (end >= 0) return arrayTokens(text.slice(0, end)).map(scalar);
      if (i >= lines.length) {
        warnings.push({ message: 'Unterminated array', loc: loc(), severity: 'error' });
        return arrayTokens(text).map(scalar);
      }
      text += `\n${lines[i]}`;
      i++;
    }
  }

  function consumeComment(): ComponentNode | null {
    const start = i;
    const trimmed = lines[i].trim();
    if (trimmed.startsWith('//')) {
      i++;
      return { type: '#comment', identifier: null, props: { text: lines[start] }, children: [], loc: { file, line: start + 1 } };
    }
    if (!trimmed.startsWith('/*')) return null;
    const commentLines: string[] = [];
    while (i < lines.length) {
      commentLines.push(lines[i]);
      const closed = lines[i].includes('*/');
      i++;
      if (closed) {
        return {
          type: '#comment',
          identifier: null,
          props: { text: commentLines.join('\n') },
          children: [],
          loc: { file, line: start + 1 },
        };
      }
    }
    warnings.push({ message: 'Unterminated block comment', loc: { file, line: start + 1 }, severity: 'error' });
    return {
      type: '#comment', identifier: null, props: { text: commentLines.join('\n') }, children: [], loc: { file, line: start + 1 },
    };
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
      warnings.push({ message: 'Unterminated code fence', loc: { file, line: i + 1 }, severity: 'error' });
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
      const comment = consumeComment();
      if (comment) { node.children.push(comment); continue; }
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
        const key = `${prefix}${unquoteIdentifier(m[1])}`;
        i++;
        if (m[2].trim() === '') {
          const fenced = tryFence();
          node.props[key] = fenced ?? '';
        } else {
          node.props[key] = parseValue(m[2]);
        }
        continue;
      }

      warnings.push({ message: `Unrecognized line: "${line.slice(0, 70)}"`, loc: loc(), severity: 'warning' });
      const bucket = (node.props['#unparsed'] as RawValue[] | undefined) ?? [];
      bucket.push(line);
      node.props['#unparsed'] = bucket;
      i++;
    }
    warnings.push({ message: `Unterminated block '${node.type}'`, loc: loc(), severity: 'error' });
  }

  const roots: ComponentNode[] = [];
  while (i < lines.length) {
    const line = lines[i].trim();
    if (line === '') { i++; continue; }
    const comment = consumeComment();
    if (comment) { roots.push(comment); continue; }
    const m = COMPONENT_OPEN.exec(line);
    if (m) {
      const root: ComponentNode = {
        type: m[1], identifier: unquoteIdentifier(m[2]), props: {}, children: [], loc: loc(),
      };
      i++;
      parseBody(root, ')', '');
      roots.push(root);
    } else {
      warnings.push({ message: `Unrecognized top-level line: "${line.slice(0, 70)}"`, loc: loc(), severity: 'warning' });
      roots.push({
        type: '#unparsed',
        identifier: null,
        props: { line: lines[i] },
        children: [],
        loc: loc(),
      });
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
function num(v: RawValue | undefined): number | null {
  return typeof v === 'number' ? v : null;
}
/** `branch.behavior.target.page`-style values: confirmed live to be
 * EITHER a literal page number, a page ALIAS string, or an
 * item-substitution token string (see ApexBranchTarget's doc comment) --
 * kept as the raw number-or-string union rather than coerced. */
function numOrStr(v: RawValue | undefined): number | string | null {
  return typeof v === 'number' || typeof v === 'string' ? v : null;
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

/** Item types Product Architect scoped the `lovName` typed field to (see
 * ApexItem.lovName's doc comment) -- narrower than the full real set of
 * item types that carry the identical shared-LOV-reference shape. */
const LOV_GATED_ITEM_TYPES = new Set(['selectList', 'radioGroup', 'popupLov']);

function projectItem(n: ComponentNode): ApexItem {
  const type = str(n.props['type']);
  return {
    identifier: n.identifier ?? '(anonymous)',
    type,
    label: str(n.props['label.label']) ?? str(n.props['label']),
    required: n.props['validation.valueRequired'] === true || n.props['required'] === true,
    sourceColumn: str(n.props['source.column']),
    lovName:
      type !== null && LOV_GATED_ITEM_TYPES.has(type) && n.props['lov.type'] === 'sharedComponent'
        ? refName(n.props['lov.lov'])
        : null,
    loc: n.loc,
    raw: n.props,
  };
}

function projectButton(n: ComponentNode): ApexButton {
  const target = projectPageTarget(n.props, 'behavior.target') as ApexButtonTarget | null;
  return {
    identifier: n.identifier ?? '(anonymous)',
    label: str(n.props['label']),
    action: str(n.props['behavior.action']) ?? str(n.props['action']),
    target,
    url: str(n.props['behavior.targetUrl']),
    htmlDomId: str(n.props['advanced.htmlDomId']),
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

/** Shared by `branch` and `validation` -- see ApexServerSideCondition's
 * doc comment for why the two EBNF productions are treated as one shape. */
function projectServerSideCondition(props: RawBag): ApexServerSideCondition | null {
  const hasCondition = Object.keys(props).some((k) => k.startsWith('serverSideCondition.'));
  if (!hasCondition) return null;
  return {
    whenButtonPressed: refName(props['serverSideCondition.whenButtonPressed']),
    type: str(props['serverSideCondition.type']),
    item: str(props['serverSideCondition.item']),
    value: str(props['serverSideCondition.value']),
    plsqlExpression: multilineText(props['serverSideCondition.plsqlExpression']),
  };
}

/** `behavior.target.items.<ITEM>`-style flattened keys, collected back
 * into a plain map. Values are kept as their string representation --
 * real data shows plain literals and `&ITEM.` substitution tokens, never
 * numbers or booleans in this position, but coerced defensively either
 * way since the EBNF leaves `target`'s internal shape entirely opaque. */
function targetItems(props: RawBag, keyPrefix: string): Record<string, string> | null {
  const prefix = `${keyPrefix}.`;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(props)) {
    if (!k.startsWith(prefix)) continue;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      out[k.slice(prefix.length)] = String(v);
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

function projectBranchTarget(props: RawBag): ApexBranchTarget | null {
  const hasTarget = Object.keys(props).some((k) => k.startsWith('behavior.target.'));
  if (!hasTarget) return null;
  // clearCache read the identical way projectPageTarget() reads it for
  // ApexButtonTarget/ApexColumnLinkTarget/ApexRegionActionTarget -- see
  // ApexBranchTarget.clearCache's doc comment (packages/parser/src/ast.ts)
  // for the real-data citation (concurrent-manager,
  // pages/p00351-lookup-manager1.apx:960-968) and EBNF cross-check.
  const clearCacheRaw = props['behavior.target.clearCache'];
  return {
    page: numOrStr(props['behavior.target.page']),
    url: str(props['behavior.target.url']),
    items: targetItems(props, 'behavior.target.items'),
    clearCache:
      clearCacheRaw === undefined
        ? null
        : typeof clearCacheRaw === 'string' || typeof clearCacheRaw === 'number'
          ? String(clearCacheRaw)
          : null,
  };
}

function projectBranch(n: ComponentNode): ApexBranch {
  return {
    identifier: n.identifier,
    name: str(n.props['name']),
    sequence: num(n.props['execution.sequence']),
    point: str(n.props['execution.point']),
    target: projectBranchTarget(n.props),
    condition: projectServerSideCondition(n.props),
    loc: n.loc,
    raw: n.props,
  };
}

function projectProcess(n: ComponentNode): ApexProcess {
  return {
    identifier: n.identifier ?? '(anonymous)',
    name: str(n.props['name']),
    type: str(n.props['type']),
    sequence: num(n.props['execution.sequence']),
    point: str(n.props['execution.point']),
    condition: projectServerSideCondition(n.props),
    loc: n.loc,
    raw: n.props,
  };
}

function projectComputation(n: ComponentNode): ApexComputation {
  return {
    identifier: n.identifier ?? '(anonymous)',
    itemName: str(n.props['itemName']),
    sequence: num(n.props['execution.sequence']),
    type: str(n.props['computation.type']),
    condition: projectServerSideCondition(n.props),
    loc: n.loc,
    raw: n.props,
  };
}

/** Shared by `column.link.target`/`action.behavior.target`/
 * `button.behavior.target` -- the same `{ page, items, clearCache }`
 * nested-object shape already confirmed for `ApexBranchTarget` (see that
 * type's doc comment), minus the `url` variant: `action`/`button` never
 * carry a nested `url` at all (they carry it as a separate FLAT
 * `targetUrl` property instead -- see `ApexRegionActionTarget`/
 * `ApexButtonTarget`'s doc comments), while `column` DOES carry a nested
 * `url` (see `ApexColumnLinkTarget`'s doc comment, corrected 2026-08-12) --
 * read separately by `projectColumn()` below rather than folded into this
 * shared helper, specifically so `action`/`button`'s target objects never
 * pick up a spurious always-`null` `url` key their own declared types
 * don't have. */
function projectPageTarget(props: RawBag, keyPrefix: string): { page: number | string | null; items: Record<string, string> | null; clearCache: string | null } | null {
  const prefix = `${keyPrefix}.`;
  const hasTarget = Object.keys(props).some((k) => k.startsWith(prefix));
  if (!hasTarget) return null;
  const clearCacheRaw = props[`${keyPrefix}.clearCache`];
  return {
    page: numOrStr(props[`${keyPrefix}.page`]),
    items: targetItems(props, `${keyPrefix}.items`),
    clearCache:
      clearCacheRaw === undefined
        ? null
        : typeof clearCacheRaw === 'string' || typeof clearCacheRaw === 'number'
          ? String(clearCacheRaw)
          : null,
  };
}

function projectColumn(n: ComponentNode): ApexReportColumn {
  const pageTarget = projectPageTarget(n.props, 'link.target');
  // `url` is read separately -- see projectPageTarget()'s doc comment for
  // why it isn't folded into the shared helper. Confirmed live:
  // ux-pattern-catalog, pages/p00320-item-detail-full.apx:460-462.
  const linkTarget: ApexColumnLinkTarget | null = pageTarget
    ? { ...pageTarget, url: str(n.props['link.target.url']) }
    : null;
  return {
    identifier: n.identifier ?? '(anonymous)',
    type: str(n.props['type']),
    heading: str(n.props['heading.heading']),
    sequence: num(n.props['layout.sequence']),
    linkTarget,
    loc: n.loc,
    raw: n.props,
  };
}

function projectRegionAction(n: ComponentNode): ApexRegionAction {
  const target = projectPageTarget(n.props, 'behavior.target') as ApexRegionActionTarget | null;
  return {
    identifier: n.identifier ?? '(anonymous)',
    label: str(n.props['label']),
    kind: str(n.props['type']) ?? str(n.props['position']),
    target,
    url: str(n.props['behavior.targetUrl']),
    loc: n.loc,
    raw: n.props,
  };
}

function projectValidation(n: ComponentNode): ApexValidation {
  const hasError = Object.keys(n.props).some((k) => k.startsWith('error.'));
  const error: ApexValidationError | null = hasError
    ? {
        message: multilineText(n.props['error.errorMessage']),
        displayLocation: str(n.props['error.displayLocation']),
        associatedItem: refName(n.props['error.associatedItem']),
        associatedColumn: str(n.props['error.associatedColumn']),
      }
    : null;
  return {
    identifier: n.identifier ?? '(anonymous)',
    name: str(n.props['name']),
    sequence: num(n.props['execution.sequence']),
    type: str(n.props['validation.type']),
    item: str(n.props['validation.item']),
    column: str(n.props['validation.column']),
    error,
    condition: projectServerSideCondition(n.props),
    loc: n.loc,
    raw: n.props,
  };
}

export function projectPages(roots: ComponentNode[]): {
  application: ApexAppAst['application'];
  pages: ApexPage[];
  unmodeled: string[];
} {
  const pages: ApexPage[] = [];
  const unmodeled = new Set<string>();
  let application: ApexAppAst['application'] = null;
  const pageIds = new Map<number, Loc>();

  function assertUniqueIdentifiers(
    scope: string,
    components: readonly { identifier: string | null; loc: Loc }[],
  ): void {
    const seen = new Map<string, Loc>();
    for (const component of components) {
      // Anonymous is the projection fallback for constructs whose source did
      // not contain an identifier. Do not turn multiple independently
      // diagnosable missing identifiers into a misleading duplicate error.
      if (component.identifier === null || component.identifier === '(anonymous)') continue;
      const first = seen.get(component.identifier);
      if (first) {
        throw new Error(
          `${component.loc.file}:${component.loc.line}: duplicate ${scope} identifier ` +
            `'${component.identifier}' (first declared at ${first.file}:${first.line}).`,
        );
      }
      seen.set(component.identifier, component.loc);
    }
  }

  // Oracle's raw 26.1 EBNF has two top-level `substitution` productions:
  // application static substitutions (`substitution-a`, carrying
  // `value.staticValue`) and supporting-object installation substitutions
  // (`substitution-b`, carrying `installation.*`). Only the former is safe
  // to attach to ApexApplication and resolve statically. Real Oracle exports
  // have also been observed omitting substitution-a's EBNF-required `name`
  // property while using the component id as the name, e.g.
  // `substitution APP_NAME ( value { staticValue: ... } )`; prefer the
  // direct property when present and fall back to that witnessed id shape.
  const staticSubstitutions = roots
    .filter((node) => node.type === 'substitution' && 'value.staticValue' in node.props)
    .map((node) => {
      const name = str(node.props['name']) ?? node.identifier;
      if (!name) {
        throw new Error(
          `${node.loc.file}:${node.loc.line}: static application substitution has neither a 'name:' property nor a component identifier.`,
        );
      }
      return {
        identifier: node.identifier,
        name,
        staticValue: multilineText(node.props['value.staticValue']),
        loc: node.loc,
        raw: node.props,
      };
    });
  const substitutionNames = new Map<string, Loc>();
  for (const substitution of staticSubstitutions) {
    const key = substitution.name.toUpperCase();
    const first = substitutionNames.get(key);
    if (first) {
      throw new Error(
        `${substitution.loc.file}:${substitution.loc.line}: duplicate static application substitution name ` +
          `'${substitution.name}' (first declared at ${first.file}:${first.line}).`,
      );
    }
    substitutionNames.set(key, substitution.loc);
  }

  for (const n of roots) {
    if (n.type === 'app') {
      if (application) {
        throw new Error(
          `${n.loc.file}:${n.loc.line}: duplicate app component ` +
            `(first declared at ${application.loc.file}:${application.loc.line}).`,
        );
      }
      // `runtime { }` is one of many OPTIONAL group blocks under `app` in
      // the EBNF (siblings: javaScript, css, authentication, ...) -- not
      // every real export declares it. Confirmed absent entirely in
      // oracle/apex's own 26.1 sample-reporting app. `friendlyUrls: null`
      // means "not declared," never coerced to a guessed boolean -- see
      // ApexApplication.runtime's doc comment and docs/grammar-assumptions.md
      // `app-runtime-group-is-optional`.
      const friendlyUrls = bool(n.props['runtime.friendlyUrls']);
      application = {
        identifier: n.identifier,
        name: str(n.props['name']),
        alias: str(n.props['alias']),
        version: str(n.props['version']),
        type: str(n.props['type']),
        runtime: {
          friendlyUrls,
          compatibilityMode: str(n.props['runtime.compatibilityMode']),
        },
        staticSubstitutions,
        loc: n.loc,
        raw: n.props,
      };
      continue;
    }
    if (n.type === '#comment') continue;
    if (n.type === 'substitution' && 'value.staticValue' in n.props) continue;
    if (n.type !== 'page') { unmodeled.add(n.type); continue; }

    // Page number derivation: `page <N> (` -- the component-id captured as
    // `n.identifier` -- confirmed live to BE the page's own numeric page
    // number (e.g. `page 1 (` -> identifier "1"). The official EBNF marks an
    // interior `page: N` direct property "required", but real Oracle-generated
    // exports never include it -- confirmed against oracle/apex's own 26.1
    // sample-reporting app (`pages/p00001-interactive-report.apx`), which
    // opens with `page 1 (` followed immediately by `name: ...`, no interior
    // `page:` line anywhere in the file except unrelated branch/link redirect
    // targets (`target: { page: N }`). See docs/quirks/26.1.json
    // `page-number-not-required-property`. The interior property is used only
    // as an optional consistency cross-check when present (this project's own
    // hand-written fixtures redundantly set both).
    const idFromComponentId = n.identifier !== null && /^\d+$/.test(n.identifier) ? Number(n.identifier) : null;
    const idFromInteriorProp = num(n.props['page']);
    if (idFromComponentId !== null && idFromInteriorProp !== null && idFromComponentId !== idFromInteriorProp) {
      throw new Error(`${n.loc.file}:${n.loc.line}: page's component-id (${idFromComponentId}) contradicts its interior 'page:' property (${idFromInteriorProp}) -- these must agree.`);
    }
    const pageId = idFromComponentId ?? idFromInteriorProp;
    if (pageId === null || !Number.isInteger(pageId) || pageId < 0) {
      throw new Error(`${n.loc.file}:${n.loc.line}: page '${n.identifier ?? '(anonymous)'}' has no derivable page number -- its component-id is not a plain non-negative integer, and no interior 'page:' property provides one either.`);
    }
    const firstPage = pageIds.get(pageId);
    if (firstPage) {
      throw new Error(
        `${n.loc.file}:${n.loc.line}: duplicate page id ${pageId} ` +
          `(first declared at ${firstPage.file}:${firstPage.line}).`,
      );
    }
    pageIds.set(pageId, n.loc);

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
        columns: [],
        actions: [],
        loc: r.loc,
        raw: r.props,
      };
    });
    const byId = new Map(regions.map((r) => [r.identifier, r]));

    const items: ApexItem[] = [];
    const buttons: ApexButton[] = [];
    const dynamicActions: ApexDynamicAction[] = [];
    const branches: ApexBranch[] = [];
    const validations: ApexValidation[] = [];
    const processes: ApexProcess[] = [];
    const computations: ApexComputation[] = [];
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
      } else if (c.type === 'branch') {
        branches.push(projectBranch(c));
      } else if (c.type === 'validation') {
        validations.push(projectValidation(c));
      } else if (c.type === 'process') {
        processes.push(projectProcess(c));
      } else if (c.type === 'computation') {
        computations.push(projectComputation(c));
      } else if (c.type !== 'region' && c.type !== '#comment') {
        unmodeled.add(c.type);
      }
    }
    // Nested lexical items/buttons/columns/actions (docs-style) — also attach.
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
        } else if (c.type === 'column') {
          byId.get(r.identifier ?? '')?.columns.push(projectColumn(c));
        } else if (c.type === 'action') {
          byId.get(r.identifier ?? '')?.actions.push(projectRegionAction(c));
        } else if (c.type !== '#comment') unmodeled.add(c.type);
      }
    }

    assertUniqueIdentifiers(`page ${pageId} region`, regions);
    assertUniqueIdentifiers(`page ${pageId} item`, items);
    assertUniqueIdentifiers(`page ${pageId} button`, buttons);
    assertUniqueIdentifiers(`page ${pageId} dynamic action`, dynamicActions);
    for (const dynamicAction of dynamicActions) {
      assertUniqueIdentifiers(`dynamic action '${dynamicAction.identifier}' action`, dynamicAction.actions);
    }
    assertUniqueIdentifiers(`page ${pageId} branch`, branches);
    assertUniqueIdentifiers(`page ${pageId} validation`, validations);
    assertUniqueIdentifiers(`page ${pageId} process`, processes);
    assertUniqueIdentifiers(`page ${pageId} computation`, computations);
    for (const region of regions) {
      assertUniqueIdentifiers(`region '${region.identifier}' column`, region.columns);
      assertUniqueIdentifiers(`region '${region.identifier}' action`, region.actions);
    }

    pages.push({
      identifier: n.identifier,
      id: pageId,
      alias: str(n.props['alias']),
      name: str(n.props['name']),
      title: str(n.props['title']),
      pageMode: str(n.props['appearance.pageMode']) as ApexPage['pageMode'],
      pageAccessProtection: str(n.props['security.pageAccessProtection']) as ApexPage['pageAccessProtection'],
      authentication: str(n.props['security.authentication']) as ApexPage['authentication'],
      isPublic: n.props['security.authentication'] === 'public',
      regions, items, buttons, dynamicActions, branches, validations, processes, computations,
      loc: n.loc,
      raw: n.props,
    });
  }
  // A partial source set may contain substitutions without application.apx.
  // The generic tree/raw data remains lossless, but do not claim the typed
  // projection consumed them when there is no application to own them.
  if (!application && staticSubstitutions.length > 0) unmodeled.add('substitution');
  return { application, pages, unmodeled: [...unmodeled].sort() };
}

export function parseApp(input: Record<string, string> | LoadedApexlangExport): ParseResult {
  const loaded =
    'sources' in input && typeof input.sources === 'object' ? (input as LoadedApexlangExport) : null;
  const files: Record<string, string> = loaded?.sources ?? (input as Record<string, string>);
  const warnings: ParseIssue[] = (loaded?.warnings ?? []).map((message) => ({
    message,
    loc: { file: '.apex/apexlang.json', line: 1 },
    severity: 'warning',
  }));
  const tree: ComponentNode[] = [];
  const sourceFiles: string[] = [];
  for (const [file, text] of Object.entries(files)) {
    sourceFiles.push(file);
    tree.push(...parseApxFile(file, text, warnings));
  }
  const { application, pages, unmodeled } = projectPages(tree);
  return {
    ast: { astVersion: '0.1.0-provisional', application, manifest: loaded?.manifest ?? null, pages, sourceFiles, unmodeled },
    tree,
    warnings,
  };
}
