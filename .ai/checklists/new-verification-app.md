# Checklist: adding a new real Oracle sample app to the verification corpus

QA/Verification Engineer's domain (`/qa`). Use this whenever a new real
`.apx` export (zip or unzipped directory) becomes available — whether or
not it comes with a live running instance.

- [ ] **Unzip to local scratch, never the repo.** Real Oracle exports are
      handled exactly like credentials: useful locally, never committed.
      Confirm the extraction path isn't under a tracked directory before
      doing anything else.
- [ ] **Parse it through `@apx/parser` and check for warnings.** Zero
      warnings is the bar every existing app already clears — any warning
      here is a real parser gap, not noise. If warnings appear, that's an
      immediate handoff to `/parser`, not something to route around.
- [ ] **Check for genuinely new region/component types** — anything not
      already in `KNOWN_REGION_TYPES` (`packages/parser/src/ast.ts`,
      documentation-only, doesn't gate parsing) or in the stub list
      (`packages/testkit/src/components/unsupported.ts`). New types still
      parse safely into `raw`/`unmodeled` — that's expected — but their
      existence is real signal for what to check next.
- [ ] **If a new type appeared**, decide with `/apex`: is this worth a
      typed AST field now (real EBNF production exists, real data
      confirms it), or does it stay `raw` for now per the restrained-scope
      principle (type only what has clear, direct testing value)?
- [ ] **Cross-check existing assumptions against this app specifically.**
      A single-app finding generalizing project-wide has been wrong
      before (Chart's `widget()` claim) — a new app is a free chance to
      confirm or contradict an existing "confirmed" claim, not just to
      pad the corpus size. Specifically worth checking on any new app:
  - Does `advanced { htmlDomId: ... }` show up on region types beyond
    Chart/Interactive Grid? (ADR-003)
  - Does any region's export identifier diverge from what a live
    instance (if available) reports as the runtime id?
- [ ] **Verify determinism** on this app alone: generate twice, confirm
      byte-identical output; run `apx-diff` self-diff against itself and
      confirm zero reported changes.
- [ ] **If a live, running instance is available for this specific app**
      (not just the static export) — that's a high-value opportunity,
      separate from the parsing work above. Hand off to `/apex` (is
      there a real public API for whatever's new here) and
      `/runtime` (verify + wrap it) per `.ai/checklists/new-component.md`
      and `.ai/checklists/runtime-api.md`. Do not let "we already have
      the export" substitute for live verification when a live app is
      actually reachable (ADR-002, ADR-004).
- [ ] **Update `.ai/knowledge/verification.md`'s app list** — add the new
      app, and its live/static-only status.
- [ ] **Update `docs/component-coverage-matrix.md`** — per-app region
      counts and any new region-type rows (`/docs`).
- [ ] **Record anything noteworthy** in `docs/grammar-assumptions.md`
      (parser findings) and/or `docs/quirks/26.1.json` (runtime findings,
      only if live access existed) — even a clean, uneventful parse of a
      structurally different app is worth a one-line note; it's evidence
      the grammar generalizes, not nothing.
- [ ] **Run the full regression sweep** (`.ai/checklists/release.md`)
      before considering this done — a new app in the corpus is a change
      to what "zero warnings across every real export" means, and the
      whole sweep should be re-run to prove it still holds project-wide,
      not just for the one new app.
