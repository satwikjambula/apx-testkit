# Checklist: before considering any change "done" / before a release

Release Engineer's domain (`/release`) — the final gate before tagging.
The full verification pass. Run this before every commit that touches
`packages/*`, and again, in full, before tagging a release.

- [ ] `npm run build --workspaces --if-present` — all four packages
      (`@apx/parser`, `@apx/testgen`, `@apx/testkit`, `@apx/mcp`), zero
      errors.
- [ ] `npm test --if-present` — full `vitest` suite across workspaces,
      all green.
- [ ] `npm run typecheck:spike` — the spike directory typechecks
      against the freshly built `@apx/testkit` types.
- [ ] Regenerate `packages/generator/test/fixtures/reference-fixtures`
      and diff against the committed `examples/employee-page` output —
      must be byte-identical.
- [ ] `cd packages/generator && npx vitest run test/golden.test.ts` — the
      golden generator fixtures (`packages/generator/test/golden/`, P0
      item 5 of the runtime-review pass) must match `golden/expected/`
      byte-for-byte, covering every generation-time decision (region
      resolution, navigation safety, modalDialog, duplicate button
      labels, htmlDomId, Interactive Report/Cards/Faceted
      Search/Chart/Interactive Grid, dynamic actions, branches) — not
      just the single `reference-fixtures` case. See
      `packages/generator/test/golden/README.md` for what each fixture
      proves and how to update `expected/` after an intentional template
      change.
- [ ] Parse every real local `.apx` export through `@apx/parser` — zero
      warnings across all of them.
- [ ] If a runtime capability changed: re-run the relevant
      `spike/tests/*.spec.ts` live against the real app (gated on
      `APX_LOGIN_TEST_USERNAME`/`APX_LOGIN_TEST_PASSWORD`), not just the
      unit suite.
- [ ] Confirm documentation is in sync (Documentation & DX Engineer's
      domain, but every agent checks before handing off):
      `docs/ecosystem-roadmap.md`, `docs/component-coverage-matrix.md`,
      `docs/support-matrix.md`, `README.md` capability matrix,
      `docs/tutorial.md`, `docs/quirks/26.1.json`,
      `docs/grammar-assumptions.md`, `CLAUDE.md`.
- [ ] `node scripts/validate-verification-registry.mjs` — the verification
      registry (`docs/verification/26.1.json`) itself is internally valid:
      every entry has required fields with valid enum values, every `id`
      is unique, every `citation` resolves to a real file (and, for
      `docs/quirks/26.1.json#<id>` citations, a real quirk id — an orphaned
      citation is a regression, not just a style nit).
- [ ] `node scripts/generate-support-matrix.mjs --check` — confirms
      `docs/support-matrix.md`'s generated table has not drifted from what
      `docs/verification/26.1.json` would produce. If a runtime/parser
      finding changed and its `docs/support-matrix.md` row didn't update
      with it, this fails — update the registry entry and re-run
      `node scripts/generate-support-matrix.mjs` (no `--check`), never
      hand-edit the table rows directly.
- [ ] Confirm no real Oracle sample-app exports/zips got staged —
      these are kept local only, never committed (same handling as
      credentials).
- [ ] Confirm no credentials are hardcoded anywhere in the diff — only
      `APX_LOGIN_TEST_USERNAME`/`APX_LOGIN_TEST_PASSWORD` env var reads.
- [ ] Commit message states what changed and why in plain terms; no
      Claude/AI attribution trailer (matches this repo's existing commit
      history convention).
- [ ] **Release-specific** (tagging a version, not just committing):
      decide patch/minor/major based on whether any typed AST field,
      public `@apx/testkit`/`@apx/testgen`/`@apx/mcp` export, or CLI flag
      changed shape or was removed.
