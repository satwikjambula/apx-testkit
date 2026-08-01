## What this changes and why

<!-- One or two sentences. If this fixes an issue, link it: "Fixes #N". -->

## Evidence

This project only ships behavior that's actually been checked — see
`CONTRIBUTING.md` and `docs/grammar-assumptions.md` / `docs/quirks/26.1.json`
for the pattern. Fill in whichever applies:

- [ ] **Parser/AST change** — cites the relevant EBNF production(s) and was
      checked against real `.apx` export data (not just one instance).
- [ ] **Runtime/testkit change** — called live against a real running APEX
      instance, not assumed from a method name or the docs. Evidence (what
      you called, what came back) is in the PR description or a
      `docs/quirks/26.1.json` entry.
- [ ] **Generator change** — determinism re-checked: same input still
      produces byte-identical output (`diff -r` on two runs).
- [ ] **Docs-only / other** — n/a, explain above instead.

## Checklist

- [ ] `npm run lint` passes
- [ ] `npm test --workspaces --if-present` passes
- [ ] If this changes a component's verified status, typed AST field, or a
      public export shape: the docs that describe it were updated in the
      same PR (`docs/component-coverage-matrix.md`, `README.md`'s
      capability matrix, `docs/tutorial.md` — see
      `.claude/agents/documentation-dx-engineer.md` for the full "update
      together" list if you're unsure which apply)
- [ ] No real Oracle sample-app export data is included in this diff
      (`.apx` files, zips) — those stay local-only, never committed
