# Parser (`packages/parser`, `@apx/parser`)

## What it does

Turns Oracle APEX's APEXlang export format (`.apx` text files) into two
layers (see ADR-001):

1. **`ComponentNode`** — a generic recursive tree:
   `{ type, identifier, props, children, loc }`. `props` is a flattened
   bag (nested groups become dotted keys, e.g. `settings.displayColumn`,
   `advanced.htmlDomId`). This layer is lossless by construction — every
   component type parses into a node even if the typed projection below
   doesn't know what to do with it.
2. **`ApexAppAst`** — the typed, canonical projection: `pages` (each with
   `regions`/`items`/`buttons`/`dynamicActions`/`branches`/`validations`/
   `processes`/`computations`, and each region with its own `columns`/
   `actions`), `sourceFiles`, and `unmodeled` (component types the typed
   layer skipped, for honesty about coverage). See
   `packages/parser/src/ast.ts` for the full type definitions and their
   doc comments — each typed field's doc comment cites the specific EBNF
   production it was checked against and the real data that confirmed it.

## Files

- `src/ast.ts` — the type definitions (`ApexAppAst`, `ApexPage`,
  `ApexRegion`, `ApexItem`, `ApexButton`, `ApexDynamicAction`,
  `ApexCalendarSettings`, `ApexChartSettings`, `ApexBranch`,
  `ApexValidation`, `ApexProcess`, `ApexComputation`, `ApexReportColumn`,
  `ApexRegionAction`, `ApexServerSideCondition` (shared by branch/
  validation/process/computation), `RawBag`/`RawValue`/`ComponentNode`).
  `ApexItem.lovName` is a narrow named-LOV reference field, gated to
  `selectList`/`radioGroup`/`popupLov` (see docs/ecosystem-roadmap.md
  "Seventh round"). `ApexRegionAction` is deliberately named (not a bare
  `Action`) to stay unambiguously distinct from the Dynamic-Action
  `ApexDAAction` — the bare component-type name `action` is overloaded in
  real APEXlang between two structurally different parent productions
  (`dynamicAction`'s child vs. a region's row-level action/link); do not
  conflate the two when touching either.
- `src/parser.ts` — the tokenizer (`COMPONENT_OPEN`/`GROUP_OPEN`/
  `OBJ_PROP_OPEN`/`PROPERTY`/`FENCE_OPEN` regexes), the line-oriented
  recursive-descent `parseBody()`, `parseArray()` (has a documented
  history of a subtle line-advance bug, fixed — see
  `docs/grammar-assumptions.md`), `tryFence()` for multiline
  `{lang, code}` fenced strings, and the `projectPages()`/`projectItem()`/
  `projectButton()`/`projectDAAction()`/`projectDynamicAction()`/
  `projectBranch()`/`projectValidation()`/`projectProcess()`/
  `projectComputation()`/`projectColumn()`/`projectRegionAction()`
  functions that build the typed layer from the generic tree.
  `projectPageTarget()` is the one shared helper behind three of these —
  `branch.behavior.target`, `column.link.target`, and
  `action.behavior.target` all confirmed the SAME real, nested
  `{ page, items, clearCache }` object shape despite the EBNF typing
  `target` as an opaque `<value>` in every one of these productions (see
  `docs/grammar-assumptions.md`'s `link.target`/`branch.target` findings)
  — a genuine, recurring pattern across this grammar, not three
  coincidentally-similar one-offs.
- `src/index.ts` — public exports.

## Key helpers in `parser.ts`

- `str()` — string-or-null extraction from a raw value.
- `bool()` — boolean-or-null.
- `stringArray()` — string array-or-null.
- `multilineText()` — handles a property that can be EITHER a bare string
  or a fenced `{lang, code}` object (found on `region.source.sqlQuery`,
  despite the EBNF typing it as `<multiline-string>` only) — real data
  wins over the grammar's stated type when they disagree.
- `refName()` — parses `@identifier` / `@/standard-theme-path` references
  into `{ ref, standard }`.

## `KNOWN_REGION_TYPES` is documentation-only

The constant in `ast.ts` lists the region types this project has
explicitly reasoned about — it does **not** gate parsing. Any region
`type` string parses safely into `raw`/`unmodeled` whether or not it's in
that list. Do not add a runtime check against this list; it exists purely
so a reader can see which types have been considered.

## Manifest and version awareness — not yet built

`ApexAppAst.astVersion` (`'0.1.0-provisional'`, `ast.ts:41`) is this
project's own AST-shape version, hardcoded — it is not derived from the
export's own `.apex/apexlang.json` manifest. There is no
`ApexlangManifest { version, mmdVersion, ... }` type, no code path that
reads that manifest file, and no version-gating logic (known+verified →
normal, known-but-unsupported → warn, unknown → refuse to silently
assume compatibility). Every corpus addition in
`.ai/knowledge/verification.md` confirms `mmdVersion 26.1.0+3102` by
hand (`curl`/checkout + read the manifest directly) before being added —
that discipline is real, but it's a human practice today, not an
enforced one the parser itself performs at parse time. See
`.ai/knowledge/constitution-reconciliation.md` §B for the full gap
writeup (constitution §§3-4). If this gets built: the export-directory
walk that would need to read `.apex/apexlang.json` alongside the rest
(`pages/`, `application.apx`, etc.) currently lives in
`loadExport()` (`packages/generator/src/lib.ts`, not this package,
despite the name) — parsing the manifest's *content* into a typed shape
belongs here in `@apx/parser` (it's the same kind of `.apex/`-adjacent
file this package already owns), but reading it off disk in the first
place is `loadExport()`'s job, matching how every other source file in
an export is already handled. Not a new package either way — no reason
to split manifest parsing from the rest of what these two packages
already do to the same export directory.

## Adding a typed field — see `.ai/checklists/parser-change.md`

The short version: check the **full** relevant EBNF production(s) (not
just the property you already assume matters), cross-check against every
real `.apx` export available locally, cross-check against
`Sawalhah/apexlang-view`'s independent parser (reference only, never a
dependency — see `.ai/knowledge/verification.md`), add the field with a
doc comment citing all of the above, wire it into `apx-diff`'s
`diffRegionFields()`/equivalent in the *same* change, add `vitest`
regression tests, and run the zero-warnings sweep across all real
exports plus the determinism check.
