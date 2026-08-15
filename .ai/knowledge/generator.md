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
  affected by a given change. The per-type `diffXFields` functions and
  `diffPageContents` are exported specifically so
  `test/diff-field-coverage.test.ts` can drive them directly with
  synthetic fixtures — this is the automated enforcement for the
  `calendarSettings`/`chartSettings`+`htmlDomId` class of gap (a typed
  field with no diff handling), not just a checklist item anymore; see
  `.ai/checklists/parser-change.md`.
- `src/coverage.ts` — cross-references a recorded touch log (from
  `@apx/testkit`'s `recordCoverageTouch`) against the AST to report which
  declared items/regions/buttons a test run actually exercised.
  `UNTRACKABLE_REGION_TYPES` (currently `tree`/`calendar`/`map`, exported
  for exactly this reason) must be kept in exact sync with
  `REGION_STUB_TYPES`, the region-shaped stubs exported from
  `packages/testkit/src/components/unsupported.ts` — letting them drift
  has caused a real bug before (Interactive Grid's real, recorded
  coverage was silently excluded for an entire prior session after IG
  graduated to a real component but was never removed from this set).
  This is now automatically enforced, not just a manual concern:
  `test/coverage-unsupported-sync.test.ts` asserts exact set equality
  between the two AND that every stub the set still claims is untrackable
  genuinely still throws `UnsupportedComponentError` (hasn't quietly
  graduated).
- `src/docs.ts` — Markdown documentation generated directly from the
  already-typed AST (GitHub issue #4, `docs/ecosystem-roadmap.md` "Ninth
  round" item 4) — reading already-typed data into a readable format, not
  new analysis, the same shape as `diff.ts`'s templating layer. One
  `<alias>.docs.md` per page (`docsFileName()` in `page-object.ts` — same
  single-source-of-truth naming discipline `pageObjectFileName()`/
  `specFileName()` already follow) plus a top-level `index.md` summary.
  Documents items/buttons/regions (calendar/chart settings, static-id
  override, nested columns and region actions), dynamic actions,
  branches, validations, processes, computations — explicitly NOT
  business-process docs/navigation maps or ER diagrams (need a
  cross-reference graph and DB schema data this project doesn't have —
  see the roadmap entry). `test/docs.test.ts` guards field-completeness
  with a sentinel-value fixture (a field typed on the AST but never
  rendered here would go unnoticed the same way `calendarSettings` once
  did for `apx-diff` — see `diff-field-coverage.test.ts`'s doc comment for
  the precedent this mirrors) plus a determinism check.
- `src/lib.ts` — shared `loadExport()`/`generate()`/`inspect()`, also
  imported directly by `packages/mcp`.
- `src/cli.ts` / `diff-cli.ts` / `coverage-cli.ts` / `docs-cli.ts` — the
  four CLI entrypoints (`apx-generate`/equivalent, `apx-diff`,
  `apx-coverage`, `apx-docs`).

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
regression until proven otherwise. `docs.ts` carries the identical
contract (`test/docs.test.ts` asserts it directly, regenerating twice into
separate directories and diffing byte-for-byte) — no timestamps, no
ordering beyond the AST's own stable source order.

**Self-consistency is not correctness** (runtime-review P0 item 5) — the
`reference-fixtures` check above only proves the generator produces the
SAME output twice; it says nothing about whether that output is right. A
reproducibly-wrong template change would pass it every time. `test/golden/`
adds the missing correctness gate: real input/expected pairs (all
hand-written, modeling real corpus structure — never copied from an
Oracle export, per `examples/verified-apps/README.md`'s established
redistribution-rights handling) covering every generation-time decision
this package makes — region resolution (ADR-003), navigation safety,
`modalDialog`, duplicate button labels, `htmlDomId`, each resolvable
region type, dynamic actions, and branches. `test/golden.test.ts` diffs
generated output against `test/golden/expected/` byte-for-byte, in
addition to the existing double-generate self-consistency check. See
`test/golden/README.md` for what each fixture proves and how to update
`expected/` after an intentional template change — this is now also part
of `.ai/checklists/release.md`.

## Adding generator support for a new component — see `.ai/checklists/new-component.md`
