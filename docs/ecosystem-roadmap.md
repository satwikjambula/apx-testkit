# Ecosystem roadmap (post-M4 vision)

Captures the long-term direction the maintainer wants: a comprehensive
Oracle APEX testing ecosystem, not just a smoke-test generator. Six areas
were named; this ledger groups them by what's actually verifiable today
against the one live reference app (UX Pattern Catalog) versus what needs
new ground truth first — same evidence-over-assumption rule as everywhere
else in this project (see CLAUDE.md Invariant 2).

## Tier 1 — buildable now, real ground truth exists

- **Richer component APIs: Interactive Report, Cards, Faceted Search.**
  Confirmed live: `browse-interactive-report` has a full `a-IRR-*` toolbar
  (search, sort widget, pagination, actions, views); `faceted-search-cards`
  has `a-CardView-*` cards and `a-FS-*` facets. These can be built the same
  way `item.ts` was: wrap the documented `apex.region(id)` widget API
  (`interactiveReport`, etc.), never a raw selector.
- **Automatic waits tied to APEX's client lifecycle.** APEX fires documented
  client-side events (`apexreadyend`, `apexafterrefresh`,
  `apexbeforepageaction`, etc. via `apex.event`/`$(document).on(...)`).
  `gotoApexPage` already waits for `apex.item` to exist as a boot signal;
  this extends the same idea to per-region refresh/ready events instead of
  `page.waitForTimeout()` calls (one already exists in the generated "clean
  console" test — a good first target to replace).
- **VS Code/Cursor integration that regenerates on export change.** Pure
  tooling, no new APEX ground truth needed: a file watcher on the export
  directory driving the existing `@apx/testgen` CLI/`@apx/mcp` tools. Could
  ship as a VS Code extension or a `--watch` flag on the CLI itself.

## Tier 2 — real ground truth exists, but needs care

- **Charts.** Present and confirmed live (Oracle JET, SVG-rendered) — but
  chart container DOM ids are JET-generated hashes
  (`chart1000639411058$cp5`), NOT the `.apx` static id, unlike pageItems.
  Any chart API must go through `apex.region(id).widget()`-level calls
  (data refresh, series inspection via the documented JET/APEX chart API),
  never a DOM id assumption. Needs its own short discovery pass to confirm
  exactly what the widget API exposes before writing `chart.ts`.
- **Snapshot testing for regions and pages.** Feasible (Playwright has
  built-in screenshot/snapshot assertions), but needs a design decision
  first: APEX pages often render live/seeded data, so a naive
  pixel/DOM-tree snapshot will be flaky by default. Needs a policy for what
  gets masked/excluded (timestamps, generated ids, chart data) before it's
  useful rather than noisy.

## Tier 3 — blocked without new ground truth, or genuinely novel

- **Interactive Grid.** NOT present anywhere in the one live app available
  to this project. Oracle does publicly document the `interactiveGrid`
  widget JS API (`apex.region(id).widget().interactiveGrid(...)`), so a
  wrapper COULD be written from documentation alone the way the parser's
  grammar was — but per this project's own M0 lesson, that's exactly the
  kind of docs-only assumption that turned out wrong in places once checked
  against a real app. Do not ship an `ig.ts` claiming verified behavior
  without a live app that actually has an Interactive Grid region to check
  it against.
- **Trees as a content/data-display pattern.** The only Tree widget in the
  one available app is the universal left-nav (`a-TreeView` inside the nav
  chrome) — not a page-content region. No ground truth exists here for
  "Tree region" as the plan envisions it (e.g. a hierarchical data browser).
- **Code coverage mapping from generated tests back to APEX components.**
  No prior art anywhere in this project. Needs its own design spike first:
  what does "coverage" mean here — which regions/items/buttons a test suite
  touches, mapped back to the `.apx` AST? That's more tractable (the AST
  already has identifiers) than traditional code-line coverage, but it's a
  new artifact type, not an extension of anything that exists today.

## Sequencing note

Given the current state (M3 engineering-complete, M4 launch-prep done,
still short a second real user and a second real export), Tier 1 items are
the highest-leverage next work: they extend `@apx/testkit`'s existing
verified-primitive pattern into more of what the one available app can
actually prove, without waiting on external dependencies. Tier 3 items
should stay on this ledger, unbuilt, until either a new export with
Interactive Grid/Tree content or a design spike resolves what "coverage"
means here — building them earlier risks the exact kind of confident-wrong
assumption this project has structured itself to avoid.
