/**
 * apx-docs — deterministic Markdown documentation generated directly from
 * the already-typed AST (`@apx/parser`). Reading already-typed data into a
 * readable format, not new analysis — the same shape as `apx-diff`'s
 * templating layer over already-computed structure (see `diff.ts`'s own
 * module doc comment). See `docs/ecosystem-roadmap.md` "Ninth round", item
 * 4 ("Documentation generator, item 4"), and GitHub issue #4.
 *
 * Explicitly OUT OF SCOPE (same roadmap entry, do not fold in here):
 *   - Business-process docs and navigation maps — need a cross-reference
 *     graph that does not exist in this project yet.
 *   - ER diagrams — need database schema/foreign-key information a `.apx`
 *     export never carries at all; a genuinely different data source, not
 *     a missing feature.
 * This module documents exactly what the typed AST already knows for a
 * page and its regions: items, buttons, regions (including calendar/chart
 * settings, nested columns, nested region actions), dynamic actions,
 * branches, validations, processes, and computations.
 *
 * Determinism contract, identical to `apx-testgen`/`page-object.ts`: same
 * AST in -> byte-identical Markdown out. No timestamps, no non-AST
 * ordering — fields render in the AST's own stable source order, the same
 * discipline `lib.ts`/`page-object.ts`/`diff.ts` already rely on.
 */
import type {
  ApexAppAst,
  ApexBranch,
  ApexBranchTarget,
  ApexButton,
  ApexCalendarSettings,
  ApexComputation,
  ApexDAAction,
  ApexDynamicAction,
  ApexItem,
  ApexPage,
  ApexProcess,
  ApexRegion,
  ApexRegionAction,
  ApexRegionActionTarget,
  ApexReportColumn,
  ApexServerSideCondition,
  ApexValidation,
} from '@apx/parser';
import { loadApexlangExport, parseApp } from '@apx/parser';
import { mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { docsFileName, pageObjectFileName, specFileName } from './page-object.js';

const NA = '—';

/** Markdown-table-safe rendering of a single cell value — `—` for anything empty/null, pipes and newlines escaped otherwise (a raw `|` or newline would corrupt the table). */
function cell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined || value === '') return NA;
  return String(value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

/** GFM table from a header row + data rows; `_(none)_` when there's nothing to show (kept out of the table itself, since a zero-column-body table is not valid Markdown). */
function table(headers: readonly string[], rows: ReadonlyArray<ReadonlyArray<string | number | boolean | null>>): string {
  if (rows.length === 0) return '_(none)_';
  const head = `| ${headers.join(' | ')} |`;
  const sep = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map((r) => `| ${r.map(cell).join(' | ')} |`).join('\n');
  return `${head}\n${sep}\n${body}`;
}

function heading(level: number, text: string): string {
  return `${'#'.repeat(level)} ${text}`;
}

function formatServerSideCondition(c: ApexServerSideCondition | null): string {
  if (!c) return NA;
  const parts: string[] = [];
  if (c.whenButtonPressed) parts.push(`when button pressed: ${c.whenButtonPressed}`);
  if (c.type) parts.push(`type: ${c.type}`);
  if (c.item) parts.push(`item: ${c.item}`);
  if (c.value) parts.push(`value: ${c.value}`);
  if (c.plsqlExpression) parts.push(`expr: ${c.plsqlExpression}`);
  return parts.length > 0 ? parts.join('; ') : NA;
}

function formatItemsMap(items: Record<string, string> | null): string {
  if (!items) return '';
  const pairs = Object.entries(items).map(([k, v]) => `${k}=${v}`);
  return pairs.length > 0 ? ` items: {${pairs.join(', ')}}` : '';
}

function formatBranchTarget(t: ApexBranchTarget | null): string {
  if (!t) return NA;
  if (t.url) return `url: ${t.url}${formatItemsMap(t.items)}`;
  if (t.page !== null) return `page: ${t.page}${formatItemsMap(t.items)}`;
  return NA;
}

function formatRegionActionTarget(a: ApexRegionAction): string {
  if (a.url) return `url: ${a.url}`;
  const t: ApexRegionActionTarget | null = a.target;
  if (t && t.page !== null) return `page: ${t.page}${formatItemsMap(t.items)}`;
  return NA;
}

function formatColumnLink(col: ApexReportColumn): string {
  const t = col.linkTarget;
  if (!t) return NA;
  if (t.page !== null) return `page: ${t.page}${formatItemsMap(t.items)}`;
  return NA;
}

function itemsTable(items: readonly ApexItem[]): string {
  return table(
    ['Identifier', 'Type', 'Label', 'Required', 'Source column', 'LOV'],
    items.map((i) => [i.identifier, i.type, i.label, i.required ? 'yes' : 'no', i.sourceColumn, i.lovName]),
  );
}

function buttonsTable(buttons: readonly ApexButton[]): string {
  return table(
    ['Identifier', 'Label', 'Action', 'Static id'],
    buttons.map((b) => [b.identifier, b.label, b.action, b.htmlDomId]),
  );
}

function columnsTable(columns: readonly ApexReportColumn[]): string {
  return table(
    ['Identifier', 'Type', 'Heading', 'Sequence', 'Link target'],
    columns.map((c) => [c.identifier, c.type, c.heading, c.sequence, formatColumnLink(c)]),
  );
}

function regionActionsTable(actions: readonly ApexRegionAction[]): string {
  return table(
    ['Identifier', 'Label', 'Kind', 'Target'],
    actions.map((a) => [a.identifier, a.label, a.kind, formatRegionActionTarget(a)]),
  );
}

function branchesTable(branches: readonly ApexBranch[]): string {
  return table(
    ['Name', 'Sequence', 'Point', 'Target', 'Condition'],
    branches.map((b, idx) => [
      b.name ?? `branch #${idx}`,
      b.sequence,
      b.point,
      formatBranchTarget(b.target),
      formatServerSideCondition(b.condition),
    ]),
  );
}

function validationsTable(validations: readonly ApexValidation[]): string {
  return table(
    ['Identifier', 'Name', 'Type', 'Item', 'Column', 'Error message', 'Condition'],
    validations.map((v) => [
      v.identifier,
      v.name,
      v.type,
      v.item,
      v.column,
      v.error?.message ?? null,
      formatServerSideCondition(v.condition),
    ]),
  );
}

function processesTable(processes: readonly ApexProcess[]): string {
  return table(
    ['Identifier', 'Name', 'Type', 'Sequence', 'Point', 'Condition'],
    processes.map((p) => [p.identifier, p.name, p.type, p.sequence, p.point, formatServerSideCondition(p.condition)]),
  );
}

function computationsTable(computations: readonly ApexComputation[]): string {
  return table(
    ['Identifier', 'Item', 'Type', 'Sequence', 'Condition'],
    computations.map((c) => [c.identifier, c.itemName, c.type, c.sequence, formatServerSideCondition(c.condition)]),
  );
}

function daActionsTable(actions: readonly ApexDAAction[]): string {
  return table(
    ['Identifier', 'Name', 'Action', 'Fires when'],
    actions.map((a) => [a.identifier, a.name, a.action, a.fireWhenEventResultIs === null ? null : a.fireWhenEventResultIs ? 'true' : 'false']),
  );
}

function formatDATrigger(when: ApexDynamicAction['when']): string {
  const parts: string[] = [when.selectionType ?? 'default selection'];
  if (when.event) parts.push(`event: ${when.event}`);
  if (when.customEvent) parts.push(`custom event: ${when.customEvent}`);
  if (when.items && when.items.length > 0) parts.push(`items: ${when.items.join(', ')}`);
  if (when.button) parts.push(`button: ${when.button}`);
  if (when.region) parts.push(`region: ${when.region}`);
  return parts.join(', ');
}

function dynamicActionSection(level: number, da: ApexDynamicAction): string {
  const cond = da.clientSideCondition;
  const condLine = cond
    ? `- Client-side condition: ${cond.type ?? 'unknown'}${cond.item ? `, item: ${cond.item}` : ''}${cond.value ? `, value: ${cond.value}` : ''}`
    : '- Client-side condition: none (unconditional)';
  return [
    heading(level, `${da.name ?? da.identifier} (\`${da.identifier}\`)`),
    `- When: ${formatDATrigger(da.when)}`,
    condLine,
    '',
    heading(level + 1, `Actions (${da.actions.length})`),
    daActionsTable(da.actions),
  ].join('\n');
}

function formatSource(region: ApexRegion): string {
  const s = region.source;
  if (!s) return NA;
  const lines: string[] = [];
  if (s.tableName) lines.push(`- Table: \`${s.tableName}\`${s.location ? ` (${s.location})` : ''}`);
  else if (s.location) lines.push(`- Location: ${s.location}`);
  if (s.sql) lines.push(`- SQL:\n\n\`\`\`sql\n${s.sql}\n\`\`\``);
  return lines.length > 0 ? lines.join('\n') : NA;
}

function formatCalendarSettings(c: ApexCalendarSettings): string {
  return table(
    ['Display column', 'Start date column', 'End date column', 'PK column', 'Show time', 'Drag and drop', 'Views'],
    [
      [
        c.displayColumn,
        c.startDateColumn,
        c.endDateColumn,
        c.pkColumn,
        c.showTime === null ? null : c.showTime ? 'yes' : 'no',
        c.dragAndDrop === null ? null : c.dragAndDrop ? 'yes' : 'no',
        c.views ? c.views.join(', ') : null,
      ],
    ],
  );
}

function regionSection(region: ApexRegion): string {
  const parts: string[] = [];
  parts.push(heading(3, `\`${region.identifier}\`${region.name ? ` — ${region.name}` : ''}`));
  parts.push(
    table(
      ['Type', 'HTML DOM ID (`advanced.htmlDomId`)'],
      [[region.type, region.htmlDomId]],
    ),
  );

  const sourceText = formatSource(region);
  if (sourceText !== NA) {
    parts.push(heading(4, 'Source'));
    parts.push(sourceText);
  }

  if (region.calendarSettings) {
    parts.push(heading(4, 'Calendar settings'));
    parts.push(formatCalendarSettings(region.calendarSettings));
  }

  if (region.chartSettings) {
    parts.push(heading(4, 'Chart settings'));
    parts.push(`- Declared type: \`${region.chartSettings.type}\``);
  }

  parts.push(heading(4, `Items (${region.items.length})`));
  parts.push(itemsTable(region.items));

  parts.push(heading(4, `Buttons (${region.buttons.length})`));
  parts.push(buttonsTable(region.buttons));

  parts.push(heading(4, `Columns (${region.columns.length})`));
  parts.push(columnsTable(region.columns));

  parts.push(heading(4, `Actions (${region.actions.length})`));
  parts.push(regionActionsTable(region.actions));

  return parts.join('\n\n');
}

/**
 * Page-level items/buttons that don't belong to any region — the
 * `layout.region`-unowned case `ApexPage.items`/`ApexPage.buttons` also
 * carry (see `packages/parser/src/parser.ts`: every item/button lands in
 * BOTH the page's flat list and its owning region's list, when it has
 * one). Region-owned items/buttons are documented once, under their
 * region (`regionSection` above) — repeating them again here would double
 * -document the exact same construct, the same redundancy
 * `test/diff-field-coverage.test.ts` documents for `apx-diff`.
 */
function unownedItems(page: ApexPage): ApexItem[] {
  const owned = new Set(page.regions.flatMap((r) => r.items));
  return page.items.filter((i) => !owned.has(i));
}

function unownedButtons(page: ApexPage): ApexButton[] {
  const owned = new Set(page.regions.flatMap((r) => r.buttons));
  return page.buttons.filter((b) => !owned.has(b));
}

/**
 * Full page documentation — every already-typed construct on `ApexPage`,
 * rendered as Markdown. Exported standalone (not just through
 * `generateDocs`) so tests can call it directly against a synthetic
 * `ApexPage`, the same pattern `diff.ts`'s `diffPageContents` uses for
 * `test/diff-field-coverage.test.ts`.
 */
export function pageDocs(page: ApexPage): string {
  const alias = page.alias ?? '';
  const isPublic = page.isPublic;
  const auth = page.authentication;
  const itemsOnly = unownedItems(page);
  const buttonsOnly = unownedButtons(page);

  const parts: string[] = [];
  parts.push(
    `<!-- GENERATED by apx-docs from pages/p${String(page.id).padStart(5, '0')}-${alias.toLowerCase()}.apx -- DO NOT EDIT.\n` +
      `     Regenerate after any .apx change; reflects exactly what @apx/parser has typed. -->`,
  );
  parts.push(heading(1, `Page ${page.id}: ${page.name ?? alias} (\`${alias}\`)`));
  parts.push(
    table(
      ['', ''],
      [
        ['Title', page.title],
        ['Authentication', auth ?? (isPublic ? 'public' : null)],
        ['Generated tests', `\`${pageObjectFileName(page)}\`, \`${specFileName(page)}\``],
      ],
    ),
  );

  parts.push(heading(2, `Page-level items (${itemsOnly.length})`));
  parts.push(itemsTable(itemsOnly));

  parts.push(heading(2, `Page-level buttons (${buttonsOnly.length})`));
  parts.push(buttonsTable(buttonsOnly));

  parts.push(heading(2, `Regions (${page.regions.length})`));
  parts.push(page.regions.length > 0 ? page.regions.map(regionSection).join('\n\n') : '_(none)_');

  parts.push(heading(2, `Dynamic actions (${page.dynamicActions.length})`));
  parts.push(
    page.dynamicActions.length > 0
      ? page.dynamicActions.map((da) => dynamicActionSection(3, da)).join('\n\n')
      : '_(none)_',
  );

  parts.push(heading(2, `Branches (${page.branches.length})`));
  parts.push(branchesTable(page.branches));

  parts.push(heading(2, `Validations (${page.validations.length})`));
  parts.push(validationsTable(page.validations));

  parts.push(heading(2, `Processes (${page.processes.length})`));
  parts.push(processesTable(page.processes));

  parts.push(heading(2, `Computations (${page.computations.length})`));
  parts.push(computationsTable(page.computations));

  return `${parts.join('\n\n')}\n`;
}

/**
 * Top-level app summary — one row per documented page, plus the list of
 * component types this export contains that the typed AST doesn't model
 * yet (`ApexAppAst.unmodeled`) so a reader knows plainly what's NOT
 * reflected in these docs, rather than silently missing it (the same
 * "never lie by omission" discipline `raw` bags already follow — see
 * `ast.ts`'s own module doc comment).
 */
export function appIndexDocs(ast: ApexAppAst): string {
  const pages = [...ast.pages].filter((p) => p.id !== 0 && p.alias).sort((a, b) => a.id - b.id);
  const parts: string[] = [];
  parts.push('<!-- GENERATED by apx-docs -- DO NOT EDIT. Regenerate after any .apx change. -->');
  parts.push(heading(1, 'App documentation'));
  parts.push(`${pages.length} page(s) documented — one Markdown file each, linked below.`);
  parts.push(
    table(
      ['Page', 'Alias', 'Title', 'Regions', 'Items', 'Buttons'],
      pages.map((p) => [
        `[${p.id}](./${docsFileName(p)})`,
        p.alias,
        p.title,
        p.regions.length,
        p.items.length,
        p.buttons.length,
      ]),
    ),
  );
  if (ast.unmodeled.length > 0) {
    parts.push(heading(2, 'Not yet documented'));
    parts.push(
      `Component types seen in this export but not yet modeled by the typed AST ` +
        `(excluded from every page doc above — see \`packages/parser/src/ast.ts\`): ` +
        `${[...ast.unmodeled].sort().join(', ')}.`,
    );
  }
  return `${parts.join('\n\n')}\n`;
}

export interface DocsGenerateResult {
  generated: number;
  outDir: string;
  indexFile: string;
  files: string[];
  warnings: string[];
}

const INDEX_FILE_NAME = 'index.md';
const DOC_OUTPUT_RE = /^p\d+-.*\.docs\.md$/;
const DOC_OUTPUT_MARKER = 'GENERATED by apx-docs';

function removeStaleGeneratedDocs(outDir: string, expected: ReadonlySet<string>): void {
  for (const file of readdirSync(outDir)) {
    if (expected.has(file) || !DOC_OUTPUT_RE.test(file)) continue;
    const path = join(outDir, file);
    const prefix = readFileSync(path, 'utf8').slice(0, 256);
    if (prefix.includes(DOC_OUTPUT_MARKER)) unlinkSync(path);
  }
}

/**
 * Writes one Markdown file per page (`docsFileName()`) plus `index.md`
 * into `outDir`. Mirrors `generate()` in `lib.ts` — same `parseApp`/
 * `loadApexlangExport` pipeline, same page filter (`id !== 0 && alias` — page 0
 * is the parser's placeholder for unassigned/global constructs, not a
 * real page), same sort order, so page selection can never drift between
 * `apx-testgen` and `apx-docs` output for the same export.
 */
export function generateDocs(exportDir: string, outDir: string): DocsGenerateResult {
  const result = parseApp(loadApexlangExport(resolve(exportDir)));
  const resolvedOut = resolve(outDir);
  mkdirSync(resolvedOut, { recursive: true });

  const pages = [...result.ast.pages].sort((a, b) => a.id - b.id).filter((p) => p.id !== 0 && p.alias);
  const expected = new Set(pages.map(docsFileName));
  removeStaleGeneratedDocs(resolvedOut, expected);
  const files: string[] = [];
  for (const p of pages) {
    const fileName = docsFileName(p);
    writeFileSync(join(resolvedOut, fileName), pageDocs(p));
    files.push(fileName);
  }

  writeFileSync(join(resolvedOut, INDEX_FILE_NAME), appIndexDocs(result.ast));
  files.push(INDEX_FILE_NAME);

  return {
    generated: pages.length,
    outDir: resolvedOut,
    indexFile: INDEX_FILE_NAME,
    files,
    warnings: result.warnings.map((w) => `${w.loc.file}:${w.loc.line} ${w.message}`),
  };
}
