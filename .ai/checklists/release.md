# Checklist: before considering any change "done" / before a release

The full verification pass. Run this before every commit that touches
`packages/*`, and again, in full, before tagging a release.

- [ ] `npm run build --workspaces --if-present` — all four packages
      (`@apx/parser`, `@apx/testgen`, `@apx/testkit`, `@apx/mcp`), zero
      errors.
- [ ] `npm test --if-present` — full `vitest` suite across workspaces,
      all green.
- [ ] `cd spike && npx tsc --noEmit` — the spike directory typechecks
      against the freshly built `@apx/testkit` types.
- [ ] Regenerate `packages/generator/test/fixtures/reference-fixtures`
      and diff against the committed `examples/employee-page` output —
      must be byte-identical.
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
