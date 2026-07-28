# cymbal-coffee-ops — verification results

Generated `@apx/testgen` output from a real, independently-authored app export
(`cofin/oracledb-vertexai-demo` (Apache-2.0)). **The raw `.apx` export data is NOT included here** — only
this project's own derived tool output (generated Playwright specs + this
results summary). This app's license is already fully resolved, confirmed
directly from the source repository's own `LICENSE` file — the raw export
is kept out for consistency with the rest of this corpus's handling, not
because of any remaining licensing question. See
`.ai/knowledge/verification.md` for the full reasoning.

## Parse

- **Warnings**: 0 (zero-warnings bar met)
- **Pages**: 9
- **Regions**: 18
- **Items**: 6
- **Buttons**: 2
- **Dynamic Actions**: 0

### Region types found
- `staticContent`: 13
- `interactiveReport`: 5

### Unmodeled component types
Real, present in this export, not yet typed at the parser level — preserved
in `raw` bags, nothing lost (ADR-001): `pageGroup`, `process`

## Generation

`@apx/testgen` produced **8** page object + smoke spec pairs
(7 marked skip: auth required). See `generated/` for
the actual files.

## Determinism

Generated twice from the same export — byte-identical output, both times.
`apx-diff` self-diff (this export against itself):
**0 added, 0 removed, 0 changed, 8 unchanged** — confirms zero spurious differences.

## Live verification

**Live verification**: no running instance available for this app — static ground truth only (parser output, determinism, and structural findings above). No runtime claims are made about this app beyond what a live instance would be needed to confirm.
