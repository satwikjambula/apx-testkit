# ADR-001: The semantic AST is canonical

## Status
Accepted

## Context
`@apx/parser` produces two layers for every parsed export: a generic
`ComponentNode` tree (`type`/`identifier`/`props`/`children`, everything
flattened into a `raw` bag) and a typed `ApexAppAst`
(`ApexPage`/`ApexRegion`/`ApexItem`/`ApexButton`/`ApexDynamicAction`/...,
see `packages/parser/src/ast.ts`). Two real downstream consumers already
exist and read *only* the typed layer for the fields it covers:
`apx-coverage` (`packages/generator/src/coverage.ts`) cross-references
typed identifiers against a recorded touch log, and `apx-diff`
(`packages/generator/src/diff.ts`) diffs typed fields one at a time,
falling back to a whole-object `raw` comparison only for what isn't typed
yet.

## Decision
The typed AST is the canonical representation of an APEX application for
every downstream consumer — generator, coverage, diff, and any future
runtime dispatch. `raw` bags exist *only* as a lossless fallback for
constructs not yet typed. No consumer should read a `raw.*` key directly
when a typed field exists for the same data, and no typed field should
ever be added without a path for constructs that don't have one to keep
falling into `raw` untouched.

## Consequences
- Every new typed field must be threaded through `diff.ts`'s field-by-field
  diffing in the *same* change that types it — not left for later. This has
  already been a real, repeated gap: `calendarSettings` shipped without a
  diff line, caught only when `chartSettings`/`htmlDomId` were added later
  and the gap was noticed and backfilled (see
  `docs/grammar-assumptions.md`, the Chart typed-AST entries).
- `ApexAppAst.unmodeled` (component types the typed projection skipped)
  must stay accurate — it is the honesty mechanism that lets consumers
  know what the canonical layer does *not* yet cover, instead of silently
  under-reporting.
- Adding a typed field is a strictly additive operation on `ApexRegion`/
  `ApexItem`/etc. — it must never remove or stop populating the
  corresponding `raw` key, since `raw` is the permanent safety net for
  everything the typed layer hasn't caught up to yet.
