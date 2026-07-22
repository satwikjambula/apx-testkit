# apx-testkit

`apx-*` naming (not "apexlang"/"apex") is a permanent, compliance-driven
choice per Oracle's trademark guidelines, not a placeholder — see
docs/license-check.md.

**Status: pre-alpha (M3 engineering-complete).** Verified against exactly
one real APEX 26.1 application (UX Pattern Catalog) — see
docs/support-matrix.md before trusting anything here beyond that, and
docs/grammar-assumptions.md for the full ledger of what's confirmed vs. open.

## What apx-testkit is

apx-testkit generates a maintainable Playwright regression suite directly
from an Oracle APEX 26.1+ application's APEXlang (`.apx`) export. It's three
pieces wired together:

1. **A parser** (`@apx/parser`) — `.apx` source in, a typed, read-only JSON
   AST out. Unrecognized constructs are preserved in `raw` bags and reported
   as warnings, never silently dropped.
2. **A generator** (`@apx/testgen`) — that AST in, a typed PageObject
   (`.page.ts`) plus a smoke spec (`.spec.ts`) that exercises it, per page,
   deterministically out.
3. **A testkit** (`@apx/testkit`) — the Playwright fixtures and component
   helpers (built on `apex.item()`/`apex.region()`, never raw CSS selectors)
   that both the generated code and hand-written specs import from.

An MCP server (`@apx/mcp`) exposes the generator to agentic editors (Cursor,
Claude Code, etc.), so an AI assistant regenerates tests as part of its own
workflow instead of hand-authoring them — see docs/editor-integration.md.

## Quick example (30 seconds)

Given a page in an APEXlang export:

```
page 3 (
  name: Employee
  alias: EMPLOYEE
  region employee (
    pageItem P3_ENAME ( type: textField label: Name required: true )
    button save ( label: Save action: submit )
  )
)
```

Running:

```
node packages/generator/dist/cli.js <export-dir> --out <tests-dir>
```

produces a typed page object —

```ts
export class EmployeePage {
  static readonly alias = 'employee';
  constructor(private readonly page: Page) {}
  async goto(): Promise<string[]> { return gotoApexPage(this.page, this.url()); }
  get ename(): ApexItem { return new ApexItem(this.page, 'P3_ENAME'); }
  async clickSave(): Promise<void> { await buttonByLabel(this.page, 'Save').click(); }
}
```

— and a smoke spec that exercises it, never talking to `@apx/testkit`
directly:

```ts
test('apex.item round-trip on P3_ENAME', async ({ page }) => {
  const po = new EmployeePage(page);
  await po.goto();
  await po.ename.setValue('apx-testgen');
  expect(await po.ename.getValue()).toBe('apx-testgen');
});
```

The full, real output this produces (generated from a committed fixture,
nothing hand-edited) is in `examples/employee-page/`. Regenerate every time
the `.apx` changes and review both diffs — the `.apx` diff and the
regenerated-test diff — side by side in the same PR.

## Why not just hand-write Playwright tests?

- **Deterministic, so it's diffable.** Same `.apx` input -> byte-identical
  output (verified in CI's determinism gate). When a page changes, the
  regenerated diff sits next to the `.apx` diff in the same review — nobody
  has to guess what changed or re-derive it by hand.
- **The DOM lives in one place.** Generated code never contains a raw CSS
  selector — only `@apx/testkit` primitives built on documented
  `apex.item()`/`apex.region()` APIs. When APEX's DOM changes across a
  release, you fix it once in the testkit; every generated suite inherits
  the fix without hand-editing.
- **Catches "the AI agent broke this page" the same day.** With agents now
  editing `.apx` files directly, the risk isn't a human typo — it's an
  autonomous edit nobody reviewed for rendering/validation breakage. A
  regenerated smoke suite is the safety net that would have caught it.
- **Zero LLM calls in the test loop.** Generation is metadata -> template,
  not model -> guess. The assertions are identical every run — the opposite
  trade-off from an AI test-writer, and the reason this stays CI-stable.
- **The floor is a floor, not a strategy.** This doesn't replace test
  authorship for business logic — it replaces "does the page still
  render/validate correctly" as a repetitive hand-written chore.

## Architecture

```
.apx export
    │
    ▼
@apx/parser    — read-only, .apx -> typed JSON AST (unrecognized constructs
                 land in `raw` bags + warnings, never silently dropped)
    │
    ▼
@apx/testgen   — AST -> per page: <alias>.page.ts (PageObject) +
                 <alias>.spec.ts (smoke spec exercising it)
                 deterministic: same AST in -> byte-identical files out
    ▼
@apx/testkit   — the primitives BOTH generated and hand-written specs
                 import: item.ts (apex.item, VERIFIED), region.ts
                 (generic ApexRegion: refresh/getSessionState/
                 getCurrentRecordId/etc., verified on two widget types),
                 cards.ts + faceted-search.ts (pagination, selection,
                 facet counts -- verified live, incl. two confirmed
                 gotchas: getRecords() is broken on Cards in this app,
                 getTotalResourceCount() needs polling), button.ts
                 (accessible-role locators, partial -- DOM id convention
                 still open), auth.ts (login fixture, unverified),
                 console-guard.ts, session.ts

@apx/mcp       — MCP stdio server wrapping @apx/testgen for agentic editors
                 (inspect_apex_export, generate_apex_tests tools)
```

Repo layout: `packages/parser`, `packages/testkit`, `packages/generator`,
`packages/mcp`. `spike/` is a runnable Playwright project against a live
public reference app (UX Pattern Catalog); `examples/` is real generator
output, committed, so you can read the current output shape without running
anything.

Scope commitments: APEX 26.1+ only. No linter (APEX Advisor/SQLcl own that
role). No `.apx` writer (SQLcl owns import — a writer invites round-trip
corruption bugs). No Interactive Grid deep interaction.

### Running it locally

```
npm install   # once, at repo root — @apx/testkit is a real runtime
              # dependency of generated/hand-written specs, not just a
              # type-checking convenience
node packages/generator/dist/cli.js <export-dir> --out <tests-dir>
cd spike && npm install && npm test
```

`npm install && npm run test --workspaces` runs the unit tests (the parser's
integration test and the full spike suite both need a real APEX
export/instance and skip cleanly without one).

## Current limitations

Full list in docs/limitations.md; the headline ones:

- **Verified against one real app only** (UX Pattern Catalog) — see
  docs/support-matrix.md. Nothing here should be trusted beyond that app
  until a second, independent export confirms it.
- **Region/button assertions don't exist yet.** The DOM identifier
  convention is still an open discovery item (see
  docs/grammar-assumptions.md "Still open"); button *click methods* work
  today via accessible-role/label locators as a deliberate interim
  workaround, not a verified static-id convention.
- **`auth.ts` is implemented but unverified** — no ground-truth app used so
  far has a login page.
- **Drawer/modal pages fail to load** via a plain friendly-URL GET
  (confirmed live on p00420) — a known, documented gap, not yet root-caused.
- **`spike/tests-generated/`'s 18 committed files are stale** relative to
  the current page-object generator template; regenerating them for real
  needs the actual export, which isn't committed (redistribution unchecked).
- **No Interactive Report/Grid support, no `required`-item assertion, no
  data-dependent assertions** — the last one is permanent, by design; the
  generator has no way to know what data your instance holds.

## Roadmap

| Milestone | Status |
|---|---|
| M0 — ground truth, license/naming check | Done |
| M1 — parser | Done against one app; needs a second, independent export before it's fully trusted |
| M2 — testkit fixtures | Done — exit criterion met (hand-written spec, testkit primitives only, passing live) |
| M3 — generator (page objects + smoke specs) | Engineering-complete; the literal exit criterion (a green run in a live 26.1 GitHub Actions container) is open — needs Oracle APEX/ORDS infrastructure this project doesn't have access to |
| M4 — release + second user | Launch-prep done: LICENSE (full Apache-2.0), trademark/license review, support matrix, limitations doc, examples/. The actual milestone — a real second user filing real breakage reports — is still open and isn't something engineering work alone can produce |

Highest-value next steps (see docs/limitations.md and CLAUDE.md "Outstanding
debts"): capture the region/button DOM discovery report, validate the parser
against a second independent `.apx` export, get a real login page to verify
`auth.ts` against, and — the actual M4 milestone — find that second user.

### Beyond M4: a comprehensive APEX testing ecosystem

The longer-term direction is richer component APIs (Interactive Report,
Cards, Charts, Interactive Grid, Trees), lifecycle-aware waits instead of
timeouts, snapshot testing, coverage mapping back to `.apx` components, and
editor integration that regenerates on export change. See
docs/ecosystem-roadmap.md for what's actually verifiable against the one
live reference app today versus what's genuinely blocked on new ground
truth or needs its own design first.
