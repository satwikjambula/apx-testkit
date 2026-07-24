# Generator (`packages/generator`, `@apx/testgen`) + `packages/mcp`

## What it does

Consumes the typed AST from `@apx/parser` and produces deterministic
artifacts — never anything an LLM authors at generation time (see
`packages/mcp/src/server.ts`'s own doc comment: "the agent DISPATCHES
generation; it never authors assertions — determinism is the product").

## Files

- `src/page-object.ts` — emits a `PageObject` class + a smoke `.spec.ts`
  per page, importing exclusively from `@apx/testkit` (the treadmill
  rule). Emits ONLY runtime-verified assertions: alias URL loads, clean
  console, normalized title, all declared page items present, an
  `apex.item()` round-trip per item. A login-required page gets a real
  generated spec that logs in via `login()` in a `beforeEach`, gated at
  runtime on `APX_LOGIN_TEST_USERNAME`/`APX_LOGIN_TEST_PASSWORD` (skips
  cleanly if unset), not a permanent skip.
- `src/diff.ts` — AST-to-AST regression detection between two export
  versions. Diffs typed fields one at a time (page alias/name/title/
  authentication, item type/label/required/sourceColumn, region type/
  name/source/calendarSettings/chartSettings/htmlDomId, button label/
  action, dynamic action trigger/condition/nested actions) and falls back
  to a whole-`raw`-object comparison (`RAW_CHANGED_NOTE`) for anything not
  individually typed yet. Cross-references which generated spec files are
  affected by a given change.
- `src/coverage.ts` — cross-references a recorded touch log (from
  `@apx/testkit`'s `recordCoverageTouch`) against the AST to report which
  declared items/regions/buttons a test run actually exercised.
  `UNTRACKABLE_REGION_TYPES` (currently `tree`/`calendar`/`map`) must be
  kept in exact sync with the region-shaped stubs in
  `packages/testkit/src/components/unsupported.ts` — letting them drift
  has caused a real bug before (Interactive Grid's real, recorded
  coverage was silently excluded for an entire prior session after IG
  graduated to a real component but was never removed from this set).
- `src/lib.ts` — shared `loadExport()`/`generate()`/`inspect()`, also
  imported directly by `packages/mcp`.
- `src/cli.ts` / `diff-cli.ts` / `coverage-cli.ts` — the three CLI
  entrypoints (`apx-generate`/equivalent, `apx-diff`, `apx-coverage`).

## `packages/mcp` (`@apx/mcp`)

A thin MCP server (`server.ts`) exposing exactly two tools —
`inspect_apex_export` and `generate_apex_tests` — to agentic editors
(Cursor, Claude Code, Copilot agent mode, Windsurf) over stdio. It is a
wrapper around `@apx/testgen/lib`'s `generate`/`inspect`, nothing more —
no independent logic to keep in sync beyond re-exporting these two calls
with editor-friendly schemas.

## Determinism is enforced, not assumed

Same input must always produce byte-identical output. The release
checklist (`.ai/checklists/release.md`) verifies this by regenerating
`packages/generator/test/fixtures/reference-fixtures` and diffing against
the committed `examples/employee-page` output — any difference is a
regression until proven otherwise.

## Adding generator support for a new component — see `.ai/checklists/new-component.md`
