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
   `regions`/`items`/`buttons`/`dynamicActions`), `sourceFiles`, and
   `unmodeled` (component types the typed layer skipped, for honesty
   about coverage). See `packages/parser/src/ast.ts` for the full type
   definitions and their doc comments — each typed field's doc comment
   cites the specific EBNF production it was checked against and the
   real data that confirmed it.

## Files

- `src/ast.ts` — the type definitions (`ApexAppAst`, `ApexPage`,
  `ApexRegion`, `ApexItem`, `ApexButton`, `ApexDynamicAction`,
  `ApexCalendarSettings`, `ApexChartSettings`, `RawBag`/`RawValue`/
  `ComponentNode`).
- `src/parser.ts` — the tokenizer (`COMPONENT_OPEN`/`GROUP_OPEN`/
  `OBJ_PROP_OPEN`/`PROPERTY`/`FENCE_OPEN` regexes), the line-oriented
  recursive-descent `parseBody()`, `parseArray()` (has a documented
  history of a subtle line-advance bug, fixed — see
  `docs/grammar-assumptions.md`), `tryFence()` for multiline
  `{lang, code}` fenced strings, and the `projectPages()`/`projectItem()`/
  `projectButton()`/`projectDAAction()`/`projectDynamicAction()` functions
  that build the typed layer from the generic tree.
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

## Adding a typed field — see `.ai/checklists/parser-change.md`

The short version: check the **full** relevant EBNF production(s) (not
just the property you already assume matters), cross-check against every
real `.apx` export available locally, add the field with a doc comment
citing both, wire it into `apx-diff`'s `diffRegionFields()`/equivalent in
the *same* change, add `vitest` regression tests, and run the
zero-warnings sweep across all real exports plus the determinism check.
